import { create } from 'xmlbuilder2'
import { optimize } from 'svgo'
import type { DiagramAnalysis } from '@/types/diagram'
import type { TactileObject } from '@/types/tactile'
import { encodeBraille, normalizeStemText } from '@/lib/braille'
import {
  buildTactilePlan,
  KEY_START_Y, KEY_LINE_H, KEY_MAX_LINES, KEY_SEP_Y, TITLE_Y, MARGIN, PAGE_W, WIRE_SW,
} from '@/lib/svg/tactilePlanner'

type El = ReturnType<typeof create>

// ── SVG coordinate formatter ───────────────────────────────────────────────────

function f(v: number): string { return v.toFixed(1) }

// ── Braille dot geometry ───────────────────────────────────────────────────────
// Physical Braille standard spacing (all in mm)

const B = {
  dotR: 0.7,    // raised-dot radius
  hStep: 2.5,   // left-column to right-column offset
  vStep: 2.5,   // inter-row within a cell
  cellW: 6.0,   // cell advance (left-col center, cell N → cell N+1)
  lineH: 10.0,  // line advance (top-dot, line N → top-dot, line N+1)
}

const DOT_OFFSETS = [
  { bit: 0x01, dx: 0,       dy: 0       },  // dot 1 (top-left)
  { bit: 0x02, dx: 0,       dy: 2.5     },  // dot 2
  { bit: 0x04, dx: 0,       dy: 5.0     },  // dot 3
  { bit: 0x08, dx: 2.5,     dy: 0       },  // dot 4 (top-right)
  { bit: 0x10, dx: 2.5,     dy: 2.5     },  // dot 5
  { bit: 0x20, dx: 2.5,     dy: 5.0     },  // dot 6
]

function drawBrailleChar(parent: El, char: string, xMm: number, yMm: number) {
  const cp = char.codePointAt(0) ?? 0
  if (cp < 0x2800 || cp > 0x28FF) return
  const bits = cp - 0x2800
  if (bits === 0) return  // blank cell, no dots
  for (const { bit, dx, dy } of DOT_OFFSETS) {
    if (bits & bit) {
      parent.ele('circle', { cx: f(xMm + dx), cy: f(yMm + dy), r: f(B.dotR), fill: '#000000' }).up()
    }
  }
}

function drawBrailleString(parent: El, brailleStr: string, xMm: number, yMm: number): number {
  let x = xMm
  for (const ch of brailleStr) {
    drawBrailleChar(parent, ch, x, yMm)
    x += B.cellW
  }
  return x - xMm  // width used
}

// Word-wrap plain normalised text, then render as Braille dots.
// Returns total height consumed (mm).
function renderBrailleText(
  parent: El,
  normalizedText: string,
  xMm: number,
  yMm: number,
  maxWidthMm: number,
): number {
  const words = normalizedText.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    const braille = encodeBraille(candidate)
    if (braille.length * B.cellW > maxWidthMm && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)

  let curY = yMm
  for (const line of lines) {
    drawBrailleString(parent, encodeBraille(line), xMm, curY)
    curY += B.lineH
  }
  return curY - yMm
}

// ── Stroke constants ───────────────────────────────────────────────────────────

const SW_WIRE      = String(WIRE_SW)   // 0.5mm
const SW_COMPONENT = '0.7'             // component outlines
const SW_AXIS      = '0.6'
const SW_ARROW     = '0.7'
const FILL_NONE    = 'none'
const INK          = '#000000'

const HALF_ALONG = 13  // mm — half of component gap in wire direction (matches planner)

// ── Component symbol drawing (all horizontal; rotated flag uses SVG transform) ─

function line(parent: El, x1: number, y1: number, x2: number, y2: number, sw = SW_WIRE) {
  parent.ele('line', { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2), stroke: INK, 'stroke-width': sw }).up()
}

function drawBattery(g: El, cx: number, cy: number) {
  // Long plate (negative) at cx-5, short plate (positive) at cx+5
  line(g, cx - HALF_ALONG, cy, cx - 5, cy)          // left wire stub
  line(g, cx - 5, cy - 7,  cx - 5, cy + 7, '0.9')   // long plate
  line(g, cx + 5, cy - 4,  cx + 5, cy + 4, '0.5')   // short plate
  line(g, cx + 5, cy,      cx + HALF_ALONG, cy)      // right wire stub
}

function drawResistor(g: El, cx: number, cy: number) {
  // Single polyline: left stub + zigzag + right stub
  const pts = [
    [cx - HALF_ALONG, cy],
    [cx - 8, cy],
    [cx - 6, cy - 5], [cx - 2, cy + 5],
    [cx + 2, cy - 5], [cx + 6, cy + 5],
    [cx + 8, cy],
    [cx + HALF_ALONG, cy],
  ].map(([x, y]) => `${f(x)},${f(y)}`).join(' ')
  g.ele('polyline', { points: pts, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
}

function drawCapacitor(g: El, cx: number, cy: number) {
  line(g, cx - HALF_ALONG, cy, cx - 4, cy)          // left wire stub
  line(g, cx - 4, cy - 8, cx - 4, cy + 8, '0.9')   // left plate
  line(g, cx + 4, cy - 8, cx + 4, cy + 8, '0.9')   // right plate
  line(g, cx + 4, cy,     cx + HALF_ALONG, cy)       // right wire stub
}

function drawInductor(g: El, cx: number, cy: number) {
  line(g, cx - HALF_ALONG, cy, cx - 10, cy)  // left stub
  // 4 bumps (arcs), each 5mm wide, spanning cx-10 to cx+10
  for (let i = 0; i < 4; i++) {
    const ax = cx - 10 + i * 5
    g.ele('path', { d: `M ${f(ax)},${f(cy)} a 2.5,2.5 0 0 1 5,0`, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  }
  line(g, cx + 10, cy, cx + HALF_ALONG, cy)  // right stub
}

function drawBulb(g: El, cx: number, cy: number) {
  line(g, cx - HALF_ALONG, cy, cx - 7, cy)
  g.ele('circle', { cx: f(cx), cy: f(cy), r: '7', fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT }).up()
  // X crosshair inside circle
  const d = 4.5
  line(g, cx - d, cy - d, cx + d, cy + d, '0.5')
  line(g, cx + d, cy - d, cx - d, cy + d, '0.5')
  line(g, cx + 7, cy, cx + HALF_ALONG, cy)
}

function drawSwitch(g: El, cx: number, cy: number) {
  line(g, cx - HALF_ALONG, cy, cx - 6, cy)          // left stub
  g.ele('circle', { cx: f(cx - 6), cy: f(cy), r: '1.5', fill: FILL_NONE, stroke: INK, 'stroke-width': '0.5' }).up()
  line(g, cx - 6, cy, cx + 4, cy - 9, SW_COMPONENT) // open arm
  g.ele('circle', { cx: f(cx + 6), cy: f(cy), r: '1.5', fill: FILL_NONE, stroke: INK, 'stroke-width': '0.5' }).up()
  line(g, cx + 6, cy, cx + HALF_ALONG, cy)
}

function drawGenericComponent(g: El, cx: number, cy: number) {
  g.ele('rect', {
    x: f(cx - 10), y: f(cy - 6), width: '20', height: '12', rx: '2',
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
  line(g, cx - HALF_ALONG, cy, cx - 10, cy)
  line(g, cx + 10, cy, cx + HALF_ALONG, cy)
}

// ── Graph shape drawing ───────────────────────────────────────────────────────

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
  // Mark each data point with a small diamond
  for (const pt of pts) {
    const s = 2.5
    const dPts = `${f(pt.xMm)},${f(pt.yMm - s)} ${f(pt.xMm + s)},${f(pt.yMm)} ${f(pt.xMm)},${f(pt.yMm + s)} ${f(pt.xMm - s)},${f(pt.yMm)}`
    svg.ele('polygon', { points: dPts, fill: INK, stroke: FILL_NONE }).up()
  }
}

function drawPieSector(svg: El, obj: TactileObject) {
  const extra = obj.extra ?? {}
  const r     = Number(extra.r ?? 60)
  const sa    = Number(extra.startAngle ?? 0)
  const ea    = Number(extra.endAngle ?? Math.PI)
  const cx    = obj.xMm
  const cy    = obj.yMm
  const x1    = cx + r * Math.cos(sa)
  const y1    = cy + r * Math.sin(sa)
  const x2    = cx + r * Math.cos(ea)
  const y2    = cy + r * Math.sin(ea)
  const sweep = ea - sa
  const large = sweep > Math.PI ? 1 : 0
  svg.ele('path', {
    d: `M ${f(cx)},${f(cy)} L ${f(x1)},${f(y1)} A ${f(r)},${f(r)} 0 ${large},1 ${f(x2)},${f(y2)} Z`,
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

// ── Free-body drawing ─────────────────────────────────────────────────────────

function drawObjectRect(svg: El, obj: TactileObject) {
  const w = obj.widthMm ?? 32
  const h = obj.heightMm ?? 22
  svg.ele('rect', {
    x: f(obj.xMm), y: f(obj.yMm), width: f(w), height: f(h), rx: '3',
    fill: FILL_NONE, stroke: INK, 'stroke-width': SW_COMPONENT,
  }).up()
}

function drawForceArrow(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const [p1, p2] = pts

  line(svg, p1.xMm, p1.yMm, p2.xMm, p2.yMm, SW_ARROW)

  // Arrowhead at p2
  const angle = Math.atan2(p2.yMm - p1.yMm, p2.xMm - p1.xMm)
  const size  = 5  // mm
  const ax = p2.xMm - size * Math.cos(angle - Math.PI / 6)
  const ay = p2.yMm - size * Math.sin(angle - Math.PI / 6)
  const bx = p2.xMm - size * Math.cos(angle + Math.PI / 6)
  const by = p2.yMm - size * Math.sin(angle + Math.PI / 6)
  svg.ele('polygon', { points: `${f(p2.xMm)},${f(p2.yMm)} ${f(ax)},${f(ay)} ${f(bx)},${f(by)}`, fill: INK, stroke: FILL_NONE }).up()
}

// ── Wire drawing ──────────────────────────────────────────────────────────────

function drawWire(svg: El, obj: TactileObject) {
  const pts = obj.points
  if (!pts || pts.length < 2) return
  const pStr = pts.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_WIRE }).up()
}

// ── Marker rendering ──────────────────────────────────────────────────────────

function drawMarker(parent: El, obj: TactileObject) {
  if (!obj.marker) return
  const braille = encodeBraille(obj.marker)
  drawBrailleString(parent, braille, obj.xMm, obj.yMm)
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

  // Component shapes — wrap in optional rotation group
  const cx = obj.xMm
  const cy = obj.yMm
  const g  = obj.rotated
    ? svg.ele('g', { transform: `rotate(90, ${f(cx)}, ${f(cy)})` })
    : svg.ele('g')

  switch (obj.shape) {
    case 'battery':          drawBattery(g, cx, cy);          break
    case 'resistor':         drawResistor(g, cx, cy);         break
    case 'capacitor':        drawCapacitor(g, cx, cy);        break
    case 'inductor':         drawInductor(g, cx, cy);         break
    case 'bulb':             drawBulb(g, cx, cy);             break
    case 'switch':           drawSwitch(g, cx, cy);           break
    case 'generic-component':drawGenericComponent(g, cx, cy); break
    case 'bar':              drawBar(g, obj);                 break
    case 'line-chart':       drawLineChart(g, obj);           break
    case 'pie-sector':       drawPieSector(g, obj);           break
    case 'object-rect':      drawObjectRect(g, obj);          break
    case 'force-arrow':      drawForceArrow(g, obj);          break
  }

  g.up()
}

// ── Connection paths ──────────────────────────────────────────────────────────

function drawConnection(svg: El, path: { xMm: number; yMm: number }[]) {
  if (path.length < 2) return
  const pStr = path.map(p => `${f(p.xMm)},${f(p.yMm)}`).join(' ')
  svg.ele('polyline', { points: pStr, fill: FILL_NONE, stroke: INK, 'stroke-width': SW_WIRE }).up()
}

// ── Key section rendering ─────────────────────────────────────────────────────

function drawKey(svg: El, plan: ReturnType<typeof buildTactilePlan>) {
  const { key, page } = plan
  if (key.length === 0) return

  const kx = MARGIN

  // Separator line
  svg.ele('line', {
    x1: f(MARGIN), y1: f(KEY_SEP_Y),
    x2: f(page.widthMm - MARGIN), y2: f(KEY_SEP_Y),
    stroke: INK, 'stroke-width': '0.3',
  }).up()

  // "key" label in Braille above entries
  const keyLabel = encodeBraille('key')
  drawBrailleString(svg, keyLabel, kx, KEY_SEP_Y + 2)

  let y = KEY_START_Y
  const maxLineW = page.widthMm - 2 * MARGIN

  const limit = Math.min(key.length, KEY_MAX_LINES)
  for (let i = 0; i < limit; i++) {
    const entry = key[i]
    const lineText = `${entry.marker} ${entry.normalizedText}`
    const wrapH = renderBrailleText(svg, lineText, kx, y, maxLineW)
    y += Math.max(wrapH, KEY_LINE_H)
    if (y + KEY_LINE_H > page.heightMm - MARGIN) break
  }

  if (key.length > limit) {
    // Note that key was truncated
    const note = encodeBraille('see attached key')
    drawBrailleString(svg, note, kx, y)
  }
}

// ── Transcriber notes ─────────────────────────────────────────────────────────

function drawTranscriberNotes(svg: El, plan: ReturnType<typeof buildTactilePlan>) {
  const { transcriberNotes, page } = plan
  if (transcriberNotes.length === 0) return

  // Place notes above the key separator as small, plain SVG text (for the sighted technician)
  // These do not emboss as Braille — they serve as setup instructions only.
  const noteY = KEY_SEP_Y - 3
  const note  = transcriberNotes[0].slice(0, 120)
  svg.ele('text', {
    x: f(MARGIN),
    y: f(noteY),
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

  // White background
  doc.ele('rect', { x: '0', y: '0', width: f(PAGE_W), height: f(plan.page.heightMm), fill: '#ffffff' }).up()

  // Title — normalised then Braille dot geometry
  const { normalized: normTitle } = normalizeStemText(plan.title)
  renderBrailleText(doc, normTitle, MARGIN, TITLE_Y, PAGE_W - 2 * MARGIN)

  // Diagram objects
  for (const obj of plan.objects) {
    drawObject(doc, obj)
  }

  // Orthogonal connection paths (custom layout)
  for (const conn of plan.connections) {
    drawConnection(doc, conn.path)
  }

  // Transcriber notes (plain text, for technician)
  drawTranscriberNotes(doc, plan)

  // Key
  drawKey(doc, plan)

  const raw = doc.end({ headless: true })
  const result = optimize(raw, {
    plugins: ['removeDoctype', 'removeComments', 'cleanupIds', 'minifyStyles'],
  })
  return result.data
}
