import { create } from 'xmlbuilder2'
import { optimize } from 'svgo'
import type { DiagramAnalysis } from '@/types/diagram'
import type { TactileObject } from '@/types/tactile'
import { encodeBraille, normalizeStemText } from '@/lib/braille'
import { CELL_W, LINE_H } from '@/lib/brailleMetrics'
import { buildTactilePlan, MARGIN, PAGE_W, WIRE_SW } from '@/lib/svg/tactilePlanner'

type El = ReturnType<typeof create>

// ── SVG coordinate formatter ──────────────────────────────────────────────────

function f(v: number): string { return v.toFixed(1) }

// ── Braille dot geometry (physical standard spacing, all in mm) ───────────────

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

const SW_WIRE      = String(WIRE_SW)
const SW_COMPONENT = '0.7'
const SW_AXIS      = '0.6'
const SW_ARROW     = '0.7'
const FILL_NONE    = 'none'
const INK          = '#000000'

// ── Generic labeled shape drawing ─────────────────────────────────────────────

function line(parent: El, x1: number, y1: number, x2: number, y2: number, sw = SW_WIRE) {
  parent.ele('line', { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), stroke: INK, 'stroke-width': sw }).up()
}

function drawLabeledShape(g: El, obj: TactileObject) {
  const cx = obj.xMm
  const cy = obj.yMm
  const prefix = obj.marker ? `#${obj.marker} ` : ''
  const combined = prefix + (obj.label ?? '')
  const display = combined.length > 11 ? combined.slice(0, 10) + '…' : combined

  switch (obj.shape) {
    case 'rect': {
      g.ele('rect', {
        x: f(cx - 14), y: f(cy - 7), width: '28', height: '14', rx: '2',
        fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
      }).up()
      break
    }
    case 'circle': {
      g.ele('circle', {
        cx: f(cx), cy: f(cy), r: '10',
        fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
      }).up()
      break
    }
    case 'diamond': {
      const pts = `${f(cx)},${f(cy - 9)} ${f(cx + 14)},${f(cy)} ${f(cx)},${f(cy + 9)} ${f(cx - 14)},${f(cy)}`
      g.ele('polygon', {
        points: pts,
        fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
      }).up()
      break
    }
    case 'ellipse': {
      g.ele('ellipse', {
        cx: f(cx), cy: f(cy), rx: '14', ry: '8',
        fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
      }).up()
      break
    }
    default:
      g.ele('rect', {
        x: f(cx - 14), y: f(cy - 7), width: '28', height: '14', rx: '2',
        fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
      }).up()
  }

  g.ele('text', {
    x: f(cx),
    y: f(cy + 1),
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    'font-size': '3',
    'font-family': 'sans-serif',
    fill: INK,
  }).txt(display).up()
}

// ── Arrow drawing ─────────────────────────────────────────────────────────────

function drawArrow(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return

  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_ARROW }).up()

  const p1 = pts[pts.length - 2]
  const p2 = pts[pts.length - 1]
  const angle = Math.atan2(p2.yMm - p1.yMm, p2.xMm - p1.xMm)
  const size  = 5
  const ax = p2.xMm - size * Math.cos(angle - Math.PI / 6)
  const ay = p2.yMm - size * Math.sin(angle - Math.PI / 6)
  const bx = p2.xMm - size * Math.cos(angle + Math.PI / 6)
  const by = p2.yMm - size * Math.sin(angle + Math.PI / 6)
  svg.ele('polygon', {
    points: `${f(p2.xMm)},${f(p2.yMm)} ${f(ax)},${f(ay)} ${f(bx)},${f(by)}`,
    fill: INK, stroke: FILL_NONE,
  }).up()
}

// ── Chart shape drawing ───────────────────────────────────────────────────────

function drawAxis(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_AXIS }).up()
}

function drawBar(svg: El, obj: TactileObject) {
  if (!obj.widthMm || !obj.heightMm) return
  svg.ele('rect', {
    x: f(obj.xMm), y: f(obj.yMm), width: f(obj.widthMm), height: f(obj.heightMm),
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
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
  const cx = obj.xMm
  const cy = obj.yMm
  const x1 = cx + r * Math.cos(sa)
  const y1 = cy + r * Math.sin(sa)
  const x2 = cx + r * Math.cos(ea)
  const y2 = cy + r * Math.sin(ea)
  const large = (ea - sa) > Math.PI ? 1 : 0
  svg.ele('path', {
    d: `M ${f(cx)},${f(cy)} L ${f(x1)},${f(y1)} A ${f(r)},${f(r)} 0 ${large},1 ${f(x2)},${f(y2)} Z`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

// ── Wire drawing ──────────────────────────────────────────────────────────────

function drawWire(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_WIRE }).up()
}

// ── Marker / Braille label rendering ─────────────────────────────────────────
// Uses obj.marker (short numeric key reference) first; falls back to obj.label.

function drawMarker(parent: El, obj: TactileObject) {
  const text = obj.marker ?? obj.label ?? ''
  if (!text) return
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
    const p1 = path[path.length - 2]
    const p2 = path[path.length - 1]
    const angle = Math.atan2(p2.yMm - p1.yMm, p2.xMm - p1.xMm)
    const size  = 4
    const ax = p2.xMm - size * Math.cos(angle - Math.PI / 6)
    const ay = p2.yMm - size * Math.sin(angle - Math.PI / 6)
    const bx = p2.xMm - size * Math.cos(angle + Math.PI / 6)
    const by = p2.yMm - size * Math.sin(angle + Math.PI / 6)
    svg.ele('polygon', {
      points: `${f(p2.xMm)},${f(p2.yMm)} ${f(ax)},${f(ay)} ${f(bx)},${f(by)}`,
      fill: INK, stroke: FILL_NONE,
    }).up()
  }
}

// ── Main object dispatcher ────────────────────────────────────────────────────

function drawObject(svg: El, obj: TactileObject) {
  if (obj.role === 'marker') {
    drawMarker(svg, obj)
    return
  }

  if (obj.role === 'wire') {
    switch (obj.shape) {
      case 'axis': drawAxis(svg, obj); return
      default:     drawWire(svg, obj); return
    }
  }

  switch (obj.shape) {
    case 'rect':
    case 'circle':
    case 'diamond':
    case 'ellipse':
      drawLabeledShape(svg, obj)
      break
    case 'arrow':
      drawArrow(svg, obj)
      break
    case 'bar':
      drawBar(svg, obj)
      break
    case 'line-chart':
      drawLineChart(svg, obj)
      break
    case 'pie-sector':
      drawPieSector(svg, obj)
      break
  }
}

// ── Key section ───────────────────────────────────────────────────────────────

function drawKey(svg: El, plan: ReturnType<typeof buildTactilePlan>) {
  const { key, page, drawingArea } = plan
  if (key.length === 0) return

  const kx = MARGIN
  // Derive separator position from drawing area (planner guarantees this relationship)
  const keySepY = drawingArea.yMm + drawingArea.heightMm + 5
  const keyStartY = keySepY + 10  // KEY_HEADER_H = 10mm

  svg.ele('line', {
    x1: f(MARGIN), y1: f(keySepY),
    x2: f(page.widthMm - MARGIN), y2: f(keySepY),
    stroke: INK, 'stroke-width': '0.3',
  }).up()

  drawBrailleString(svg, encodeBraille('key'), kx, keySepY + 2)

  let y = keyStartY
  const maxLineW = page.widthMm - 2 * MARGIN

  for (const entry of key) {
    if (y + entry.heightMm > page.heightMm - MARGIN) {
      drawBrailleString(svg, encodeBraille('see attached key'), kx, y)
      break
    }
    const lineText = `${entry.marker} ${entry.normalizedText}`
    renderBrailleText(svg, lineText, kx, y, maxLineW)
    y += entry.heightMm
  }
}

// ── Transcriber notes ─────────────────────────────────────────────────────────

function drawTranscriberNotes(svg: El, plan: ReturnType<typeof buildTactilePlan>) {
  const { transcriberNotes, drawingArea } = plan
  if (transcriberNotes.length === 0) return
  const keySepY = drawingArea.yMm + drawingArea.heightMm + 5
  const note = transcriberNotes[0].slice(0, 120)
  svg.ele('text', {
    x: f(MARGIN),
    y: f(keySepY - 3),
    'font-size': '3.5',
    'font-family': 'sans-serif',
    fill: '#555555',
  }).txt(`Note: ${note}`).up()
}

// ── Public entry point ────────────────────────────────────────────────────────

export function renderTactile(analysis: DiagramAnalysis): string {
  const plan = buildTactilePlan(analysis)

  const doc = create({ version: '1.0' })
    .ele('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${PAGE_W} ${plan.page.heightMm}`,
      width: `${PAGE_W}mm`,
      height: `${plan.page.heightMm}mm`,
    })

  doc.ele('rect', { x: '0', y: '0', width: f(PAGE_W), height: f(plan.page.heightMm), fill: '#ffffff' }).up()

  const { normalized: normTitle } = normalizeStemText(plan.title)
  renderBrailleText(doc, normTitle, MARGIN, MARGIN, PAGE_W - 2 * MARGIN, 2)

  for (const obj of plan.objects) {
    drawObject(doc, obj)
  }

  for (const conn of plan.connections) {
    drawConnection(doc, conn.path, conn.directed)
  }

  drawTranscriberNotes(doc, plan)
  drawKey(doc, plan)

  const raw = doc.end({ headless: true })
  const result = optimize(raw, {
    plugins: ['removeDoctype', 'removeComments', 'cleanupIds', 'minifyStyles'],
  })
  return result.data
}
