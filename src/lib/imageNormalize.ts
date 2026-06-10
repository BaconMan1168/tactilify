import type { Mat, Point2 as CvPoint2 } from '@u4/opencv4nodejs'

type CvModule = typeof import('@u4/opencv4nodejs')

const MIN_AREA_RATIO = 0.15
const ANALYSIS_MAX_DIM = 1200

// eslint-disable-next-line @typescript-eslint/no-require-imports
function tryLoadCv(): CvModule | null {
  try {
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

    const [tl, tr, br, bl] = orderQuadPoints(approx)

    // Output dimensions in full-res space
    const w = Math.round(Math.max(
      Math.hypot(br.x - bl.x, br.y - bl.y),
      Math.hypot(tr.x - tl.x, tr.y - tl.y),
    ) * toFullScale)
    const h = Math.round(Math.max(
      Math.hypot(tr.x - br.x, tr.y - br.y),
      Math.hypot(tl.x - bl.x, tl.y - bl.y),
    ) * toFullScale)

    if (w < 80 || h < 80) continue

    // Map quad corners from analysis-space → full-res-space
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
  if (!lines || lines.length < 5) return null

  const angles: number[] = []
  for (const line of lines) {
    // Vec4 constructor is (w,x,y,z) → HoughLinesP: x1=w, y1=x, x2=y, y2=z
    const dx = line.y - line.w
    const dy = line.z - line.x
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    if (Math.abs(angle) < 45) angles.push(angle)
  }

  if (angles.length < 3) return null

  angles.sort((a, b) => a - b)
  const median = angles[Math.floor(angles.length / 2)]
  if (Math.abs(median) < 0.5) return null

  const center = new cv.Point2(fullRes.cols / 2, fullRes.rows / 2)
  const M = cv.getRotationMatrix2D(center, median, 1.0)
  return fullRes.warpAffine(M, new cv.Size(fullRes.cols, fullRes.rows))
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

    const cropped = tryPerspectiveCrop(cv, analysis, fullRes, toFullScale)
    if (cropped) return cv.imencode('.jpg', cropped)

    const deskewed = tryDeskew(cv, analysis, fullRes)
    if (deskewed) return cv.imencode('.jpg', deskewed)

    return buffer
  } catch {
    // Never block the upload pipeline due to CV errors
    return buffer
  }
}
