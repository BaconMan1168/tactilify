import { create } from 'xmlbuilder2'
import { optimize } from 'svgo'
import type { TactilePlan, TactileObject, TactileValidationIssue, TactileSymbolRecipe, Bbox } from '@/types/tactile'
import { encodeBraille, normalizeStemText } from '@/lib/braille'
import { CELL_W, LINE_H } from '@/lib/brailleMetrics'

type El = ReturnType<typeof create>

// ── SVG coordinate formatter ──────────────────────────────────────────────────

function f(v: number): string { return v.toFixed(1) }

// ── BANA physical constants ───────────────────────────────────────────────────

const BANA = {
  MIN_SYMBOL_SIZE_MM:   6,
  MIN_LINE_GAP_MM:      3,
  MIN_STROKE_MM:        0.7,
  GUIDE_LINE_STROKE_MM: 0.5,
  MIN_ELEMENT_SEP_MM:   4,
  MIN_BRAILLE_CLEAR_MM: 10,
  MIN_LEAD_LINE_LEN_MM: 8,
  MAX_ASPECT_RATIO:     4.0,
  MIN_ASPECT_RATIO:     0.5,
}

// ── ShapeParams clamping ──────────────────────────────────────────────────────

function clampShapeParams(p?: TactileSymbolRecipe['shapeParams']): Required<Pick<NonNullable<typeof p>, 'widthMm' | 'heightMm' | 'radiusMm'>> & typeof p {
  if (!p) return { widthMm: 20, heightMm: 15, radiusMm: 8 }
  return {
    ...p,
    widthMm: Math.max(BANA.MIN_SYMBOL_SIZE_MM, p.widthMm ?? 20),
    heightMm: Math.max(BANA.MIN_SYMBOL_SIZE_MM, p.heightMm ?? 15),
    radiusMm: Math.max(BANA.MIN_SYMBOL_SIZE_MM / 2, p.radiusMm ?? 8),
    aspectRatio: p.aspectRatio
      ? Math.min(BANA.MAX_ASPECT_RATIO, Math.max(BANA.MIN_ASPECT_RATIO, p.aspectRatio))
      : undefined,
  }
}

// ── Braille dot geometry ──────────────────────────────────────────────────────

const DOT_R    = 0.7
const DOT_OFFSETS = [
  { bit: 0x01, dx: 0,   dy: 0   },
  { bit: 0x02, dx: 0,   dy: 2.5 },
  { bit: 0x04, dx: 0,   dy: 5.0 },
  { bit: 0x08, dx: 2.5, dy: 0   },
  { bit: 0x10, dx: 2.5, dy: 2.5 },
  { bit: 0x20, dx: 2.5, dy: 5.0 },
]

function drawBrailleChar(parent: El, char: string, xMm: number, yMm: number) {
  const cp = char.codePointAt(0) ?? 0
  if (cp < 0x2800 || cp > 0x28FF) return
  const bits = cp - 0x2800
  if (bits === 0) return
  for (const { bit, dx, dy } of DOT_OFFSETS) {
    if (bits & bit) {
      parent.ele('circle', { cx: f(xMm + dx), cy: f(yMm + dy), r: f(DOT_R), fill: '#000000' }).up()
    }
  }
}

function drawBrailleString(parent: El, brailleStr: string, xMm: number, yMm: number): number {
  let x = xMm
  for (const ch of brailleStr) {
    drawBrailleChar(parent, ch, x, yMm)
    x += CELL_W
  }
  return x - xMm
}

function renderBrailleText(
  parent: El,
  normalizedText: string,
  xMm: number,
  yMm: number,
  maxWidthMm: number,
  maxLines = Infinity,
): number {
  const words = normalizedText.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    const braille = encodeBraille(candidate)
    if (braille.length * CELL_W > maxWidthMm && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)

  let curY = yMm
  const limit = Math.min(lines.length, maxLines)
  for (let i = 0; i < limit; i++) {
    drawBrailleString(parent, encodeBraille(lines[i]), xMm, curY)
    curY += LINE_H
  }
  return curY - yMm
}

// ── Stroke constants ──────────────────────────────────────────────────────────

const SW_WIRE      = String(BANA.GUIDE_LINE_STROKE_MM)
const SW_COMPONENT = String(BANA.MIN_STROKE_MM)
const SW_AXIS      = '0.6'
const SW_LEAD      = String(BANA.GUIDE_LINE_STROKE_MM)
const FILL_NONE    = 'none'
const INK          = '#000000'

// ── Bbox helpers ──────────────────────────────────────────────────────────────

function bboxOverlaps(a: Bbox, b: Bbox, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w + pad &&
    a.x + a.w + pad > b.x - pad &&
    a.y - pad < b.y + b.h + pad &&
    a.y + a.h + pad > b.y - pad
  )
}

function lineSegmentBbox(x1: number, y1: number, x2: number, y2: number, pad = 1): Bbox {
  return {
    x: Math.min(x1, x2) - pad,
    y: Math.min(y1, y2) - pad,
    w: Math.abs(x2 - x1) + 2 * pad,
    h: Math.abs(y2 - y1) + 2 * pad,
  }
}

// ── Generic labeled shape drawing ─────────────────────────────────────────────

function drawLabeledShape(g: El, obj: TactileObject) {
  const cx = obj.xMm
  const cy = obj.yMm
  const prefix = obj.marker ? `#${obj.marker} ` : ''
  const combined = prefix + (obj.label ?? '')
  const display = combined.length > 18 ? combined.slice(0, 17) + '…' : combined

  switch (obj.shape) {
    case 'rect':
      g.ele('rect', { x: f(cx - 14), y: f(cy - 7), width: '28', height: '14', rx: '2', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    case 'circle':
      g.ele('circle', { cx: f(cx), cy: f(cy), r: '10', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    case 'diamond': {
      const pts = `${f(cx)},${f(cy - 9)} ${f(cx + 14)},${f(cy)} ${f(cx)},${f(cy + 9)} ${f(cx - 14)},${f(cy)}`
      g.ele('polygon', { points: pts, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    }
    case 'ellipse':
      g.ele('ellipse', { cx: f(cx), cy: f(cy), rx: '14', ry: '8', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    default:
      g.ele('rect', { x: f(cx - 14), y: f(cy - 7), width: '28', height: '14', rx: '2', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  }

  g.ele('text', { x: f(cx), y: f(cy + 1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': '3', 'font-family': 'sans-serif', fill: INK }).txt(display).up()
}

// ── Arrow drawing ─────────────────────────────────────────────────────────────

function drawArrowHead(svg: El, pts: { xMm: number; yMm: number }[], size = 5) {
  const p1 = pts[pts.length - 2]
  const p2 = pts[pts.length - 1]
  const angle = Math.atan2(p2.yMm - p1.yMm, p2.xMm - p1.xMm)
  const ax = p2.xMm - size * Math.cos(angle - Math.PI / 6)
  const ay = p2.yMm - size * Math.sin(angle - Math.PI / 6)
  const bx = p2.xMm - size * Math.cos(angle + Math.PI / 6)
  const by = p2.yMm - size * Math.sin(angle + Math.PI / 6)
  svg.ele('polygon', { points: `${f(p2.xMm)},${f(p2.yMm)} ${f(ax)},${f(ay)} ${f(bx)},${f(by)}`, fill: INK, stroke: FILL_NONE }).up()
}

function drawArrow(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  drawArrowHead(svg, pts)
}

// ── Domain symbols ────────────────────────────────────────────────────────────

function drawBatterySymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // Short thick plate (positive, left)
  svg.ele('line', { x1: f(cx - 3), y1: f(cy - 2), x2: f(cx - 3), y2: f(cy + 2), stroke: INK, 'stroke-width': '1.5' }).up()
  // Long thin plate (negative, right)
  svg.ele('line', { x1: f(cx + 3), y1: f(cy - 5), x2: f(cx + 3), y2: f(cy + 5), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // Connection wires (extend to ±13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(cx - 3), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
  svg.ele('line', { x1: f(cx + 3), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawResistorSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // 5-peak zigzag over 8mm, amplitude 3mm
  const x0 = cx - 8, x1 = cx + 8
  const peaks = 5
  const step = 16 / (peaks * 2)
  const pts: [number, number][] = [[x0 - 5, cy]]
  for (let i = 0; i < peaks * 2; i++) {
    const x = x0 + i * step
    const y = cy + (i % 2 === 0 ? -3 : 3)
    pts.push([x, y])
  }
  pts.push([x1 + 5, cy])
  const pStr = pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawCapacitorSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // Two parallel vertical plates, 3mm gap
  svg.ele('line', { x1: f(cx - 1.5), y1: f(cy - 6), x2: f(cx - 1.5), y2: f(cy + 6), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  svg.ele('line', { x1: f(cx + 1.5), y1: f(cy - 6), x2: f(cx + 1.5), y2: f(cy + 6), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // Connection wires (extend to ±13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(cx - 1.5), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
  svg.ele('line', { x1: f(cx + 1.5), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawSwitchSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // Left wire and contact point (extend to -13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(cx - 2), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
  svg.ele('circle', { cx: f(cx - 2), cy: f(cy), r: '0.8', fill: INK }).up()
  // Lever at 45°
  svg.ele('line', { x1: f(cx - 2), y1: f(cy), x2: f(cx + 6), y2: f(cy - 5), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // Right contact and wire (extend to +13mm)
  svg.ele('circle', { cx: f(cx + 6), cy: f(cy), r: '0.8', fill: INK }).up()
  svg.ele('line', { x1: f(cx + 6), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawLampSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm, r = 4
  svg.ele('circle', { cx: f(cx), cy: f(cy), r: f(r), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // X inside
  const d = r * 0.65
  svg.ele('line', { x1: f(cx - d), y1: f(cy - d), x2: f(cx + d), y2: f(cy + d), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  svg.ele('line', { x1: f(cx + d), y1: f(cy - d), x2: f(cx - d), y2: f(cy + d), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // Connection wires (extend to ±13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(cx - r), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
  svg.ele('line', { x1: f(cx + r), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawInductorSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // 4 raised bumps (semicircle arcs), each radius 2mm, total 16mm wide
  const bumpR = 2
  const numBumps = 4
  const totalW = numBumps * bumpR * 2
  const startX = cx - totalW / 2

  // Connection wires (extend to ±13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(startX), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()

  for (let i = 0; i < numBumps; i++) {
    const bx = startX + i * bumpR * 2 + bumpR
    // Upper semicircle arc: M (bx-bumpR, cy) A bumpR,bumpR 0 0,1 (bx+bumpR, cy)
    svg.ele('path', {
      d: `M ${f(bx - bumpR)},${f(cy)} A ${f(bumpR)},${f(bumpR)} 0 0,1 ${f(bx + bumpR)},${f(cy)}`,
      fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
    }).up()
  }

  svg.ele('line', { x1: f(startX + totalW), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawDiodeSymbol(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  // Triangle pointing right: (cx-6, cy-5), (cx-6, cy+5), (cx+4, cy)
  svg.ele('polygon', {
    points: `${f(cx - 6)},${f(cy - 5)} ${f(cx - 6)},${f(cy + 5)} ${f(cx + 4)},${f(cy)}`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
  // Bar at tip
  svg.ele('line', { x1: f(cx + 4), y1: f(cy - 5), x2: f(cx + 4), y2: f(cy + 5), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // Connection wires (extend to ±13mm to meet loop wires at HALF_ALONG boundary)
  svg.ele('line', { x1: f(cx - 13), y1: f(cy), x2: f(cx - 6), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
  svg.ele('line', { x1: f(cx + 4), y1: f(cy), x2: f(cx + 13), y2: f(cy), stroke: INK, 'stroke-width': SW_WIRE }).up()
}

function drawAtomCircle(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm, r = Math.max(BANA.MIN_SYMBOL_SIZE_MM / 2, 6)
  svg.ele('circle', { cx: f(cx), cy: f(cy), r: f(r), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawBondLine(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm
  const x1 = cx - 10, x2 = cx + 10
  const bondOrder = Number(obj.extra?.bondOrder ?? 1)
  const gap = BANA.MIN_LINE_GAP_MM / 2

  if (bondOrder >= 3) {
    svg.ele('line', { x1: f(x1), y1: f(cy - gap), x2: f(x2), y2: f(cy - gap), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
    svg.ele('line', { x1: f(x1), y1: f(cy),       x2: f(x2), y2: f(cy),       stroke: INK, 'stroke-width': SW_COMPONENT }).up()
    svg.ele('line', { x1: f(x1), y1: f(cy + gap), x2: f(x2), y2: f(cy + gap), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  } else if (bondOrder === 2) {
    svg.ele('line', { x1: f(x1), y1: f(cy - gap), x2: f(x2), y2: f(cy - gap), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
    svg.ele('line', { x1: f(x1), y1: f(cy + gap), x2: f(x2), y2: f(cy + gap), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  } else {
    svg.ele('line', { x1: f(x1), y1: f(cy), x2: f(x2), y2: f(cy), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  }
}

function drawForceArrowScaled(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) {
    drawArrow(svg, obj)
    return
  }
  // Length is already encoded in the points array by the planner
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  drawArrowHead(svg, pts, 5)
}

function drawAngleArc(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm, r = 5
  // Draw arc from 0° to 45° as a representative angle
  const startAngle = 0
  const endAngle = Math.PI / 4
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy - r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy - r * Math.sin(endAngle)
  svg.ele('path', {
    d: `M ${f(x1)},${f(y1)} A ${f(r)},${f(r)} 0 0,0 ${f(x2)},${f(y2)}`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
  // Angle legs
  svg.ele('line', { x1: f(cx), y1: f(cy), x2: f(cx + 8), y2: f(cy), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  svg.ele('line', { x1: f(cx), y1: f(cy), x2: f(cx + 5), y2: f(cy - 5), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawRightAngleMark(svg: El, obj: TactileObject) {
  const cx = obj.xMm, cy = obj.yMm, s = 3
  svg.ele('path', {
    d: `M ${f(cx)},${f(cy - s)} L ${f(cx)},${f(cy)} L ${f(cx + s)},${f(cy)}`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

// ── Rotation wrapper ──────────────────────────────────────────────────────────

function withRotation(svg: El, obj: TactileObject, drawFn: (g: El) => void): void {
  if (!obj.rotationDeg) { drawFn(svg); return }
  const g = svg.ele('g', { transform: `rotate(${obj.rotationDeg}, ${f(obj.xMm)}, ${f(obj.yMm)})` })
  drawFn(g)
  g.up()
}

// ── Organic primitive draw functions ──────────────────────────────────────────

function drawRoundedLobe(svg: El, cx: number, cy: number, w: number, h: number) {
  const hw = w / 2, hh = h / 2
  // Two symmetric cubic bezier curves forming a rounded lobe pointing right
  svg.ele('path', {
    d: `M ${f(cx - hw)},${f(cy)} C ${f(cx - hw / 2)},${f(cy - hh)} ${f(cx + hw / 2)},${f(cy - hh)} ${f(cx + hw)},${f(cy)} C ${f(cx + hw / 2)},${f(cy + hh)} ${f(cx - hw / 2)},${f(cy + hh)} ${f(cx - hw)},${f(cy)} Z`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

function drawPointedLobe(svg: El, cx: number, cy: number, w: number, h: number) {
  const hw = w / 2, hh = h / 2
  // Pointed tip: control points near the tip are tight
  svg.ele('path', {
    d: `M ${f(cx - hw)},${f(cy)} C ${f(cx)},${f(cy - hh)} ${f(cx + hw)},${f(cy - hh / 3)} ${f(cx + hw)},${f(cy)} C ${f(cx + hw)},${f(cy + hh / 3)} ${f(cx)},${f(cy + hh)} ${f(cx - hw)},${f(cy)} Z`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

function drawBeanRegion(svg: El, cx: number, cy: number, w: number, h: number) {
  const hw = w / 2, hh = h / 2
  // Bean: ellipse-like with gentle concavity on left side
  svg.ele('path', {
    d: [
      `M ${f(cx - hw)},${f(cy)}`,
      `C ${f(cx - hw)},${f(cy - hh)} ${f(cx + hw / 2)},${f(cy - hh)} ${f(cx + hw)},${f(cy)}`,
      `C ${f(cx + hw / 2)},${f(cy + hh)} ${f(cx - hw)},${f(cy + hh)} ${f(cx - hw / 4)},${f(cy)}`,
      `C ${f(cx - hw / 4)},${f(cy - hh / 3)} ${f(cx - hw)},${f(cy - hh / 4)} ${f(cx - hw)},${f(cy)}`,
      'Z',
    ].join(' '),
    fill: FILL_NONE, stroke: INK, 'stroke-width': String(BANA.GUIDE_LINE_STROKE_MM),
  }).up()
}

function drawOuterBoundary(svg: El, cx: number, cy: number, w: number, h: number) {
  svg.ele('ellipse', { cx: f(cx), cy: f(cy), rx: f(w / 2), ry: f(h / 2), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawInnerRegion(svg: El, cx: number, cy: number, w: number, h: number) {
  svg.ele('ellipse', { cx: f(cx), cy: f(cy), rx: f(w / 2), ry: f(h / 2), fill: FILL_NONE, stroke: INK, 'stroke-width': String(BANA.GUIDE_LINE_STROKE_MM) }).up()
}

// ── Modifier draw functions ───────────────────────────────────────────────────

function applyModifierInnerLine(svg: El, cx: number, cy: number, w: number) {
  const hw = w / 2
  svg.ele('line', { x1: f(cx - hw), y1: f(cy), x2: f(cx + hw), y2: f(cy), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function applyModifierWavyInnerLine(svg: El, cx: number, cy: number, w: number, h: number) {
  const hw = w / 2, amp = h / 8, cycles = 3
  const steps = cycles * 4
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const x = cx - hw + (i / steps) * w
    const y = cy + amp * Math.sin((i / steps) * cycles * 2 * Math.PI)
    pts.push(`${f(x)},${f(y)}`)
  }
  svg.ele('polyline', { points: pts.join(' '), fill: FILL_NONE, stroke: INK, 'stroke-width': String(BANA.GUIDE_LINE_STROKE_MM) }).up()
}

function applyModifierParallelLines(svg: El, cx: number, cy: number, w: number, h: number, count = 3) {
  const hw = w / 2
  const gap = h / (count + 1)
  for (let i = 1; i <= count; i++) {
    const y = cy - h / 2 + i * gap
    svg.ele('line', { x1: f(cx - hw), y1: f(y), x2: f(cx + hw), y2: f(y), stroke: INK, 'stroke-width': String(BANA.GUIDE_LINE_STROKE_MM) }).up()
  }
}

function applyModifierCross(svg: El, cx: number, cy: number, r: number) {
  svg.ele('line', { x1: f(cx - r), y1: f(cy), x2: f(cx + r), y2: f(cy), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  svg.ele('line', { x1: f(cx), y1: f(cy - r), x2: f(cx), y2: f(cy + r), stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function applyModifierDot(svg: El, cx: number, cy: number) {
  svg.ele('circle', { cx: f(cx), cy: f(cy), r: '1', fill: INK }).up()
}

// ── Recipe dispatcher ─────────────────────────────────────────────────────────

function drawRecipe(svg: El, obj: TactileObject, recipe: TactileSymbolRecipe) {
  const params = clampShapeParams(recipe.shapeParams)
  const cx = obj.xMm, cy = obj.yMm
  const w = params.widthMm ?? 20
  const h = params.heightMm ?? 15

  // Draw base primitive
  switch (recipe.basePrimitive) {
    case 'circle':         svg.ele('circle', { cx: f(cx), cy: f(cy), r: f(Math.min(w, h) / 2), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up(); break
    case 'ellipse':        svg.ele('ellipse', { cx: f(cx), cy: f(cy), rx: f(w / 2), ry: f(h / 2), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up(); break
    case 'rectangle':      svg.ele('rect', { x: f(cx - w / 2), y: f(cy - h / 2), width: f(w), height: f(h), rx: '2', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up(); break
    case 'diamond': {
      const pts = `${f(cx)},${f(cy - h / 2)} ${f(cx + w / 2)},${f(cy)} ${f(cx)},${f(cy + h / 2)} ${f(cx - w / 2)},${f(cy)}`
      svg.ele('polygon', { points: pts, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    }
    case 'triangle': {
      const pts = `${f(cx)},${f(cy - h / 2)} ${f(cx + w / 2)},${f(cy + h / 2)} ${f(cx - w / 2)},${f(cy + h / 2)}`
      svg.ele('polygon', { points: pts, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      break
    }
    case 'line':           svg.ele('line', { x1: f(cx - w / 2), y1: f(cy), x2: f(cx + w / 2), y2: f(cy), stroke: INK, 'stroke-width': SW_COMPONENT }).up(); break
    case 'arrow': {
      const arrowPts = [{ xMm: cx - w / 2, yMm: cy }, { xMm: cx + w / 2, yMm: cy }]
      const pStr = arrowPts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
      svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
      drawArrowHead(svg, arrowPts)
      break
    }
    case 'outer-boundary': drawOuterBoundary(svg, cx, cy, w, h); break
    case 'inner-region':   drawInnerRegion(svg, cx, cy, w, h); break
    case 'rounded-lobe':   drawRoundedLobe(svg, cx, cy, w, h); break
    case 'pointed-lobe':   drawPointedLobe(svg, cx, cy, w, h); break
    case 'bean-region':    drawBeanRegion(svg, cx, cy, w, h); break
  }

  // Apply modifiers
  for (const mod of recipe.modifiers ?? []) {
    switch (mod) {
      case 'inner-line':       applyModifierInnerLine(svg, cx, cy, w); break
      case 'wavy-inner-line':  applyModifierWavyInnerLine(svg, cx, cy, w, h); break
      case 'parallel-lines':   applyModifierParallelLines(svg, cx, cy, w, h); break
      case 'cross':            applyModifierCross(svg, cx, cy, Math.min(w, h) * 0.3); break
      case 'dot':              applyModifierDot(svg, cx, cy); break
    }
  }
}

// ── Chart shapes ──────────────────────────────────────────────────────────────

function drawAxis(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_AXIS }).up()
}

function drawBar(svg: El, obj: TactileObject) {
  if (!obj.widthMm || !obj.heightMm) return
  svg.ele('rect', { x: f(obj.xMm), y: f(obj.yMm), width: f(obj.widthMm), height: f(obj.heightMm), fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawLineChart(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  for (const pt of pts) {
    const s = 2.5
    const dPts = `${f(pt.xMm)},${f(pt.yMm - s)} ${f(pt.xMm + s)},${f(pt.yMm)} ${f(pt.xMm)},${f(pt.yMm + s)} ${f(pt.xMm - s)},${f(pt.yMm)}`
    svg.ele('polygon', { points: dPts, fill: INK, stroke: FILL_NONE }).up()
  }
}

function drawPieSector(svg: El, obj: TactileObject) {
  const extra = obj.extra ?? {}
  const r  = Number(extra.r ?? 60)
  const sa = Number(extra.startAngle ?? 0)
  const ea = Number(extra.endAngle ?? Math.PI)
  const cx = obj.xMm, cy = obj.yMm
  const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa)
  const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea)
  const large = (ea - sa) > Math.PI ? 1 : 0
  svg.ele('path', { d: `M ${f(cx)},${f(cy)} L ${f(x1)},${f(y1)} A ${f(r)},${f(r)} 0 ${large},1 ${f(x2)},${f(y2)} Z`, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

// ── Wire drawing ──────────────────────────────────────────────────────────────

function drawWire(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_WIRE }).up()
}

// ── Lead-line routing ─────────────────────────────────────────────────────────

function drawLeadLine(
  svg: El,
  labelX: number,
  labelY: number,
  targetX: number,
  targetY: number,
  textBboxes: Bbox[],
  warnings: TactileValidationIssue[],
) {
  const dist = Math.sqrt((targetX - labelX) ** 2 + (targetY - labelY) ** 2)
  if (dist < BANA.MIN_LEAD_LINE_LEN_MM) return

  const labelCenterX = labelX + 5
  const labelCenterY = labelY + LINE_H / 2

  // Try straight line
  const straightBox = lineSegmentBbox(labelCenterX, labelCenterY, targetX, targetY)
  const straightCollides = textBboxes.some(b => bboxOverlaps(straightBox, b, 1))

  if (!straightCollides) {
    svg.ele('line', { x1: f(labelCenterX), y1: f(labelCenterY), x2: f(targetX), y2: f(targetY), stroke: INK, 'stroke-width': SW_LEAD }).up()
    return
  }

  // Try L-shaped path: horizontal then vertical
  const midX = targetX
  const midY = labelCenterY
  const seg1Box = lineSegmentBbox(labelCenterX, labelCenterY, midX, midY)
  const seg2Box = lineSegmentBbox(midX, midY, targetX, targetY)
  const lCollides = textBboxes.some(b => bboxOverlaps(seg1Box, b, 1) || bboxOverlaps(seg2Box, b, 1))

  if (!lCollides) {
    svg.ele('polyline', {
      points: `${f(labelCenterX)},${f(labelCenterY)} ${f(midX)},${f(midY)} ${f(targetX)},${f(targetY)}`,
      fill: FILL_NONE, stroke: INK, 'stroke-width': SW_LEAD,
    }).up()
    return
  }

  // Emit collision warning and draw straight line anyway
  warnings.push({ severity: 'warning', code: 'LEAD_LINE_COLLISION', message: `Lead-line at (${labelX.toFixed(0)},${labelY.toFixed(0)}) could not be routed without collision.` })
  svg.ele('line', { x1: f(labelCenterX), y1: f(labelCenterY), x2: f(targetX), y2: f(targetY), stroke: INK, 'stroke-width': SW_LEAD }).up()
}

// ── Marker / Braille label rendering ─────────────────────────────────────────

function drawMarker(
  parent: El,
  obj: TactileObject,
  textBboxes: Bbox[],
  warnings: TactileValidationIssue[],
) {
  const text = obj.marker ?? obj.label ?? ''
  if (!text) return

  // Draw lead-line before braille text
  if (obj.leadLineTo) {
    drawLeadLine(parent, obj.xMm, obj.yMm, obj.leadLineTo.xMm, obj.leadLineTo.yMm, textBboxes, warnings)
  }

  const { normalized } = normalizeStemText(text)
  const braille = encodeBraille(normalized)
  drawBrailleString(parent, braille, obj.xMm, obj.yMm)
}

// ── Connection paths ──────────────────────────────────────────────────────────

function drawConnection(svg: El, path: { xMm: number; yMm: number }[], directed?: boolean) {
  if (path.length < 2) return
  const pStr = path.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_WIRE }).up()

  if (directed) {
    drawArrowHead(svg, path, 4)
  }
}

// ── Main object dispatcher ────────────────────────────────────────────────────

function drawObject(
  svg: El,
  obj: TactileObject,
  textBboxes: Bbox[],
  warnings: TactileValidationIssue[],
) {
  if (obj.role === 'marker') {
    drawMarker(svg, obj, textBboxes, warnings)
    return
  }

  if (obj.role === 'wire') {
    if (obj.shape === 'axis') { drawAxis(svg, obj); return }
    drawWire(svg, obj)
    return
  }

  // Recipe takes priority for component objects
  if (obj.recipe) {
    drawRecipe(svg, obj, obj.recipe)
    return
  }

  switch (obj.shape) {
    case 'rect':
    case 'circle':
    case 'diamond':
    case 'ellipse':
      drawLabeledShape(svg, obj)
      break
    case 'arrow':         drawArrow(svg, obj); break
    case 'bar':           drawBar(svg, obj); break
    case 'line-chart':    drawLineChart(svg, obj); break
    case 'pie-sector':    drawPieSector(svg, obj); break
    // Domain symbols — 7 circuit symbols use withRotation; others are directional/symmetric
    case 'battery-symbol':   withRotation(svg, obj, g => drawBatterySymbol(g, obj)); break
    case 'resistor-symbol':  withRotation(svg, obj, g => drawResistorSymbol(g, obj)); break
    case 'capacitor-symbol': withRotation(svg, obj, g => drawCapacitorSymbol(g, obj)); break
    case 'switch-symbol':    withRotation(svg, obj, g => drawSwitchSymbol(g, obj)); break
    case 'lamp-symbol':      withRotation(svg, obj, g => drawLampSymbol(g, obj)); break
    case 'inductor-symbol':  withRotation(svg, obj, g => drawInductorSymbol(g, obj)); break
    case 'diode-symbol':     withRotation(svg, obj, g => drawDiodeSymbol(g, obj)); break
    case 'atom-circle':       drawAtomCircle(svg, obj); break
    case 'bond-line':         drawBondLine(svg, obj); break
    case 'force-arrow-scaled': drawForceArrowScaled(svg, obj); break
    case 'angle-arc':         drawAngleArc(svg, obj); break
    case 'right-angle-mark':  drawRightAngleMark(svg, obj); break
    case 'anchor':            break // invisible collision anchor
    default:
      warnings.push({ severity: 'warning', code: 'SYMBOL_NOT_RENDERED', message: `Shape '${obj.shape}' has no renderer.` })
  }
}

// ── Exploration instructions zone ─────────────────────────────────────────────

function drawInstructions(svg: El, plan: TactilePlan, warnings: TactileValidationIssue[]) {
  const { explorationInstructions, instructionsZone, page } = plan
  if (!explorationInstructions) return

  const { normalized } = normalizeStemText(explorationInstructions)
  if (!normalized) return

  // Separator line between drawing area and instructions
  svg.ele('line', {
    x1: f(page.marginMm), y1: f(instructionsZone.yMm - 3),
    x2: f(page.widthMm - page.marginMm), y2: f(instructionsZone.yMm - 3),
    stroke: INK, 'stroke-width': '0.3',
  }).up()

  const maxLines = Math.floor(instructionsZone.heightMm / LINE_H)
  const words = normalized.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (encodeBraille(candidate).length * CELL_W > instructionsZone.widthMm && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)

  if (lines.length > maxLines) {
    warnings.push({ severity: 'warning', code: 'INSTRUCTIONS_OVERFLOW', message: `Exploration instructions need ${lines.length} lines but only ${maxLines} available; truncated.` })
  }

  let y = instructionsZone.yMm
  const limit = Math.min(lines.length, maxLines)
  for (let i = 0; i < limit; i++) {
    drawBrailleString(svg, encodeBraille(lines[i]), instructionsZone.xMm, y)
    y += LINE_H
  }
}

// ── Key section ───────────────────────────────────────────────────────────────

function drawKey(svg: El, plan: TactilePlan) {
  const { key, keyZone, instructionsZone, page } = plan
  if (key.length === 0) return

  // Separator line between instructions and key
  svg.ele('line', {
    x1: f(page.marginMm), y1: f(keyZone.yMm - 3),
    x2: f(page.widthMm - page.marginMm), y2: f(keyZone.yMm - 3),
    stroke: INK, 'stroke-width': '0.3',
  }).up()

  drawBrailleString(svg, encodeBraille('key'), keyZone.xMm, keyZone.yMm)

  let y = keyZone.yMm + LINE_H  // start below "key" header
  const maxY = keyZone.yMm + keyZone.heightMm
  const maxLineW = keyZone.widthMm

  for (const entry of key) {
    if (y + entry.heightMm > maxY) {
      drawBrailleString(svg, encodeBraille('see attached key'), keyZone.xMm, y)
      break
    }
    const lineText = `${entry.marker} ${entry.normalizedText}`
    renderBrailleText(svg, lineText, keyZone.xMm, y, maxLineW)
    y += entry.heightMm
  }
}

// ── Transcriber notes ─────────────────────────────────────────────────────────

function drawTranscriberNotes(svg: El, plan: TactilePlan) {
  const { transcriberNotes, instructionsZone } = plan
  if (transcriberNotes.length === 0) return
  const note = transcriberNotes[0].slice(0, 80)
  svg.ele('text', {
    x: f(plan.page.marginMm),
    y: f(instructionsZone.yMm - 6),
    'font-size': '3.5',
    'font-family': 'sans-serif',
    fill: '#555555',
  }).txt(`Note: ${note}`).up()
}

// ── Public entry point ────────────────────────────────────────────────────────

export function renderTactile(plan: TactilePlan): string {
  const renderWarnings: TactileValidationIssue[] = []

  // Collect all marker label bboxes for lead-line collision checking
  const textBboxes: Bbox[] = plan.objects
    .filter(o => o.role === 'marker' && o.bboxMm)
    .map(o => o.bboxMm!)

  const doc = create({ version: '1.0' })
    .ele('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${plan.page.widthMm} ${plan.page.heightMm}`,
      width: `${plan.page.widthMm}mm`,
      height: `${plan.page.heightMm}mm`,
    })

  doc.ele('rect', { x: '0', y: '0', width: f(plan.page.widthMm), height: f(plan.page.heightMm), fill: '#ffffff' }).up()

  // Title zone
  const { normalized: normTitle } = normalizeStemText(plan.title)
  renderBrailleText(doc, normTitle, plan.titleZone.xMm, plan.titleZone.yMm, plan.titleZone.widthMm, 2)

  // Short description zone (summary)
  if (plan.shortDescription && plan.shortDescriptionZone) {
    const { normalized: normDesc } = normalizeStemText(plan.shortDescription)
    if (normDesc) {
      renderBrailleText(doc, normDesc, plan.shortDescriptionZone.xMm, plan.shortDescriptionZone.yMm, plan.shortDescriptionZone.widthMm, 2)
    }
  }

  // Diagram objects
  for (const obj of plan.objects) {
    drawObject(doc, obj, textBboxes, renderWarnings)
  }

  // Connection paths
  for (const conn of plan.connections) {
    drawConnection(doc, conn.path, conn.directed)
  }

  // Zone sections
  drawInstructions(doc, plan, renderWarnings)
  drawTranscriberNotes(doc, plan)
  drawKey(doc, plan)

  // Merge render-time warnings back into plan for caller inspection
  plan.warnings.push(...renderWarnings)

  const raw = doc.end({ headless: true })
  const result = optimize(raw, {
    plugins: ['removeDoctype', 'removeComments', 'cleanupIds', 'minifyStyles'],
  })
  return result.data
}
