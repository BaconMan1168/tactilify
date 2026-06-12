import type { Mat, Point2 as CvPoint2 } from '@u4/opencv4nodejs'

type CvModule = typeof import('@u4/opencv4nodejs')

const MIN_AREA_RATIO = 0.10       // quad must cover ≥10% of image area
const ANALYSIS_MAX_DIM = 1200
const MIN_SKEW_DEG = 0.5          // correct skew down to 0.5°
const MAX_SKEW_DEG = 30.0         // skip correction if > 30° (probably intentional)
const MIN_HOUGH_LINES = 3         // need at least 3 lines for angle estimate
const BLUR_VARIANCE_THRESHOLD = 100 // Laplacian variance below this = apply sharpening

function tryLoadCv(): CvModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@u4/opencv4nodejs') as CvModule
  } catch {
    return null
  }
}

function orderQuadPoints(pts: CvPoint2[]): CvPoint2[] {
  const sum = pts.map(p => p.x + p.y)
  const diff = pts.map(p => p.x - p.y)
  const tl = pts[sum.indexOf(Math.min(...sum))]
  const br = pts[sum.indexOf(Math.max(...sum))]
  const tr = pts[diff.indexOf(Math.max(...diff))]
  const bl = pts[diff.indexOf(Math.min(...diff))]
  return [tl, tr, br, bl]
}

// Sanity-check that 4 points form a roughly rectangular shape.
// Rejects wildly skewed quads that would produce a distorted warp.
function isReasonableQuad(pts: CvPoint2[]): boolean {
  const [tl, tr, br, bl] = pts
  const w = Math.max(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - bl.x, br.y - bl.y),
  )
  const h = Math.max(
    Math.hypot(bl.x - tl.x, bl.y - tl.y),
    Math.hypot(br.x - tr.x, br.y - tr.y),
  )
  const ratio = w / h
  // Reject extreme aspect ratios — a real diagram page is between 0.3 and 3.5
  return ratio > 0.3 && ratio < 3.5
}

// Detect document boundary quad in `analysis` and apply perspective warp to `fullRes`
function tryPerspectiveCrop(
  cv: CvModule,
  analysis: Mat,
  fullRes: Mat,
  toFullScale: number,
): Mat | null {
  const imageArea = analysis.rows * analysis.cols

  const gray = analysis.bgrToGray()
  const blurred = gray.gaussianBlur(new cv.Size(5, 5), 0)
  const edges = blurred.canny(50, 150)

  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
  const dilated = edges.dilate(kernel, new cv.Point2(-1, -1), 2)

  const contours = dilated.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
  if (!contours.length) return null

  const sorted = [...contours].sort((a, b) => b.area - a.area).slice(0, 5)

  for (const contour of sorted) {
    if (contour.area < imageArea * MIN_AREA_RATIO) break

    const peri = contour.arcLength(true)
    const approx = contour.approxPolyDP(0.02 * peri, true)
    if (approx.length !== 4) continue

    const ordered = orderQuadPoints(approx)
    if (!isReasonableQuad(ordered)) continue

    const [tl, tr, br, bl] = ordered

    const w = Math.round(Math.max(
      Math.hypot(br.x - bl.x, br.y - bl.y),
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
    ) * toFullScale)
    const h = Math.round(Math.max(
      Math.hypot(tr.x - br.x, tr.y - br.y),
      Math.hypot(tl.x - bl.x, tl.y - bl.y),
    ) * toFullScale)

    if (w < 80 || h < 80) continue

    const srcPoints = [tl, tr, br, bl].map(p =>
      new cv.Point2(p.x * toFullScale, p.y * toFullScale),
    )
    const dstPoints = [
      new cv.Point2(0, 0),
      new cv.Point2(w - 1, 0),
      new cv.Point2(w - 1, h - 1),
      new cv.Point2(0, h - 1),
    ]

    const M = cv.getPerspectiveTransform(srcPoints, dstPoints)
    return fullRes.warpPerspective(M, new cv.Size(w, h))
  }

  return null
}

// Detect skew angle in `analysis` and apply rotation correction to `fullRes`
function tryDeskew(cv: CvModule, analysis: Mat, fullRes: Mat): Mat | null {
  const gray = analysis.bgrToGray()
  const blurred = gray.gaussianBlur(new cv.Size(5, 5), 0)
  const edges = blurred.canny(50, 150)

  const lines = edges.houghLinesP(1, Math.PI / 180, 80, 60, 15)
  if (!lines || lines.length < MIN_HOUGH_LINES) return null

  const angles: number[] = []
  for (const line of lines) {
    // Vec4 constructor is (w,x,y,z) → HoughLinesP: x1=w, y1=x, x2=y, y2=z
    const dx = line.y - line.w
    const dy = line.z - line.x
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    if (Math.abs(angle) < 45) angles.push(angle)
  }

  if (angles.length < MIN_HOUGH_LINES) return null

  angles.sort((a, b) => a - b)
  const median = angles[Math.floor(angles.length / 2)]

  if (Math.abs(median) < MIN_SKEW_DEG) return null
  if (Math.abs(median) > MAX_SKEW_DEG) return null  // too large — probably intentional

  const center = new cv.Point2(fullRes.cols / 2, fullRes.rows / 2)
  const M = cv.getRotationMatrix2D(center, median, 1.0)
  return fullRes.warpAffine(M, new cv.Size(fullRes.cols, fullRes.rows))
}

// Apply a very gentle unsharp mask only when the image is clearly blurry
function trySharpening(cv: CvModule, mat: Mat): Mat | null {
  const gray = mat.channels === 1 ? mat : mat.bgrToGray()
  const laplacian = gray.laplacian(cv.CV_64F)
  const { stddev } = laplacian.meanStdDev()
  const variance = (stddev.at(0, 0) as number) ** 2

  if (variance >= BLUR_VARIANCE_THRESHOLD) return null

  // Unsharp mask: 30% sharpening boost
  const softBlur = mat.gaussianBlur(new cv.Size(0, 0), 3)
  return mat.addWeighted(1.3, softBlur, -0.3, 0)
}

export function normalizeImage(buffer: Buffer): Buffer {
  const cv = tryLoadCv()
  if (!cv) return buffer

  try {
    const fullRes = cv.imdecode(buffer)

    const maxDim = Math.max(fullRes.rows, fullRes.cols)
    const analysisScale = Math.min(1, ANALYSIS_MAX_DIM / maxDim)
    const analysis = analysisScale < 1
      ? fullRes.resize(
          Math.round(fullRes.rows * analysisScale),
          Math.round(fullRes.cols * analysisScale),
        )
      : fullRes
    const toFullScale = 1 / analysisScale

    // Geometric correction: perspective crop takes priority over rotation-only deskew
    const geometryResult = tryPerspectiveCrop(cv, analysis, fullRes, toFullScale)
      ?? tryDeskew(cv, analysis, fullRes)

    // Sharpening check on the geometry-corrected image (or original if no correction)
    const target = geometryResult ?? fullRes
    const sharpened = trySharpening(cv, target)

    const finalResult = sharpened ?? geometryResult
    if (!finalResult) return buffer

    return cv.imencode('.jpg', finalResult)
  } catch {
    return buffer
  }
}
