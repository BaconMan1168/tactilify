import { create } from 'xmlbuilder2'
import { optimize } from 'svgo'
import type { DiagramAnalysis, DiagramElement, Relationship } from '@/types/diagram'
import { encodeBraille } from '@/lib/braille'

const A4_W = 794
const A4_H = 1123
const DRAW_X = 47
const DRAW_Y = 120  // leaves room for title area
const DRAW_W = 700
const DRAW_H = 930

const STROKE = '#000000'
const SW = '2'  // stroke-width

// ── Helpers ──────────────────────────────────────────────────────────────────

function toX(nx: number) { return DRAW_X + nx * DRAW_W }
function toY(ny: number) { return DRAW_Y + ny * DRAW_H }

type El = ReturnType<typeof create>

function label(parent: El, x: number, y: number, text: string) {
  parent.ele('text', {
    x: String(x),
    y: String(y),
    'font-size': '11',
    'font-family': 'serif',
    fill: STROKE,
  }).txt(encodeBraille(text)).up()
}

function arrowHead(parent: El, x1: number, y1: number, x2: number, y2: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 10
  const ax = x2 - size * Math.cos(angle - Math.PI / 6)
  const ay = y2 - size * Math.sin(angle - Math.PI / 6)
  const bx = x2 - size * Math.cos(angle + Math.PI / 6)
  const by = y2 - size * Math.sin(angle + Math.PI / 6)
  parent.ele('polygon', {
    points: `${x2},${y2} ${ax},${ay} ${bx},${by}`,
    fill: STROKE,
    stroke: 'none',
  }).up()
}

// ── Grid fallback layout ──────────────────────────────────────────────────────

function gridPosition(index: number, total: number): { x: number; y: number } {
  const cols = Math.min(4, total)
  const rows = Math.ceil(total / cols)
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    x: DRAW_X + (col + 0.5) * (DRAW_W / cols),
    y: DRAW_Y + (row + 0.5) * (DRAW_H / rows),
  }
}

// ── Circuit element renderers ─────────────────────────────────────────────────

function drawCircuitElement(parent: El, el: DiagramElement, cx: number, cy: number) {
  const t = el.type.toLowerCase()

  if (t.includes('battery') || t.includes('cell') || t.includes('power')) {
    // IEC battery: alternating long/short horizontal lines
    for (let i = 0; i < 3; i++) {
      const y = cy - 10 + i * 10
      parent.ele('line', { x1: String(cx - 18), y1: String(y), x2: String(cx + 18), y2: String(y), stroke: STROKE, 'stroke-width': i % 2 === 0 ? '2.5' : '1.2' }).up()
    }
    parent.ele('line', { x1: String(cx), y1: String(cy - 10), x2: String(cx), y2: String(cy - 18), stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx), y1: String(cy + 10), x2: String(cx), y2: String(cy + 18), stroke: STROKE, 'stroke-width': SW }).up()

  } else if (t.includes('resistor')) {
    // Zigzag polyline
    const pts = [
      `${cx - 20},${cy}`,
      `${cx - 14},${cy - 8}`, `${cx - 6},${cy + 8}`,
      `${cx + 2},${cy - 8}`, `${cx + 10},${cy + 8}`,
      `${cx + 14},${cy - 8}`, `${cx + 20},${cy}`,
    ].join(' ')
    parent.ele('polyline', { points: pts, fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()

  } else if (t.includes('capacitor')) {
    // Two parallel vertical lines with wire stubs
    parent.ele('line', { x1: String(cx - 20), y1: String(cy), x2: String(cx - 4), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx - 4), y1: String(cy - 14), x2: String(cx - 4), y2: String(cy + 14), stroke: STROKE, 'stroke-width': '2.5' }).up()
    parent.ele('line', { x1: String(cx + 4), y1: String(cy - 14), x2: String(cx + 4), y2: String(cy + 14), stroke: STROKE, 'stroke-width': '2.5' }).up()
    parent.ele('line', { x1: String(cx + 4), y1: String(cy), x2: String(cx + 20), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()

  } else if (t.includes('inductor') || t.includes('coil')) {
    // Series of arcs
    for (let i = 0; i < 4; i++) {
      const ax = cx - 16 + i * 8
      parent.ele('path', {
        d: `M ${ax},${cy} a 4,4 0 0 1 8,0`,
        fill: 'none', stroke: STROKE, 'stroke-width': SW,
      }).up()
    }
    parent.ele('line', { x1: String(cx - 20), y1: String(cy), x2: String(cx - 16), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx + 16), y1: String(cy), x2: String(cx + 20), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()

  } else if (t.includes('bulb') || t.includes('lamp') || t.includes('led') || t.includes('light')) {
    // Circle with crosshair
    parent.ele('circle', { cx: String(cx), cy: String(cy), r: '14', fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx - 10), y1: String(cy - 10), x2: String(cx + 10), y2: String(cy + 10), stroke: STROKE, 'stroke-width': '1.5' }).up()
    parent.ele('line', { x1: String(cx + 10), y1: String(cy - 10), x2: String(cx - 10), y2: String(cy + 10), stroke: STROKE, 'stroke-width': '1.5' }).up()

  } else if (t.includes('switch')) {
    // Open switch: wire, angled gap, terminal dot
    parent.ele('line', { x1: String(cx - 20), y1: String(cy), x2: String(cx - 6), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx - 6), y1: String(cy), x2: String(cx + 4), y2: String(cy - 10), stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('circle', { cx: String(cx + 8), cy: String(cy), r: '3', fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
    parent.ele('line', { x1: String(cx + 11), y1: String(cy), x2: String(cx + 20), y2: String(cy), stroke: STROKE, 'stroke-width': SW }).up()

  } else if (t.includes('wire') || t.includes('node') || t.includes('junction')) {
    // Just a dot
    parent.ele('circle', { cx: String(cx), cy: String(cy), r: '3', fill: STROKE, stroke: 'none' }).up()

  } else {
    // Labeled rectangle fallback
    parent.ele('rect', { x: String(cx - 24), y: String(cy - 12), width: '48', height: '24', rx: '4', fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
  }
}

// ── Per-type renderers ────────────────────────────────────────────────────────

function renderCircuit(svg: El, analysis: DiagramAnalysis) {
  const { elements, relationships } = analysis

  // Compute pixel positions
  const positions = new Map<string, { x: number; y: number }>()
  elements.forEach((el, i) => {
    const pos = el.position
      ? { x: toX(el.position.x), y: toY(el.position.y) }
      : gridPosition(i, elements.length)
    positions.set(el.id, pos)
  })

  // Draw wires first (behind elements)
  for (const rel of relationships) {
    const a = positions.get(rel.from)
    const b = positions.get(rel.to)
    if (!a || !b) continue
    svg.ele('line', {
      x1: String(Math.round(a.x)), y1: String(Math.round(a.y)),
      x2: String(Math.round(b.x)), y2: String(Math.round(b.y)),
      stroke: STROKE, 'stroke-width': '1.5',
    }).up()
  }

  // Draw elements + labels
  for (const el of elements) {
    const pos = positions.get(el.id)!
    const cx = Math.round(pos.x)
    const cy = Math.round(pos.y)
    drawCircuitElement(svg, el, cx, cy)
    label(svg, cx + 16, cy - 16, el.label + (el.value ? ' ' + el.value : ''))
  }
}

function renderGraph(svg: El, analysis: DiagramAnalysis) {
  const { elements } = analysis
  if (elements.length === 0) return

  const axisX = DRAW_X + 40
  const axisY = DRAW_Y + DRAW_H - 40
  const axisW = DRAW_W - 80
  const axisH = DRAW_H - 80

  // Axes
  svg.ele('line', { x1: String(axisX), y1: String(DRAW_Y), x2: String(axisX), y2: String(axisY), stroke: STROKE, 'stroke-width': SW }).up()
  svg.ele('line', { x1: String(axisX), y1: String(axisY), x2: String(axisX + axisW), y2: String(axisY), stroke: STROKE, 'stroke-width': SW }).up()

  // Detect chart type from element types
  const types = elements.map(e => e.type.toLowerCase())
  const isLine = types.some(t => t.includes('line') || t.includes('point') || t.includes('data'))
  const isPie  = types.some(t => t.includes('sector') || t.includes('slice') || t.includes('pie') || t.includes('segment'))

  if (isPie) {
    // Pie: arc sectors
    const cx = DRAW_X + DRAW_W / 2
    const cy = DRAW_Y + DRAW_H / 2
    const r = Math.min(DRAW_W, DRAW_H) / 2 - 60
    const total = elements.reduce((s, e) => s + (parseFloat(e.value ?? '1') || 1), 0)
    let startAngle = -Math.PI / 2
    for (const el of elements) {
      const frac = (parseFloat(el.value ?? '1') || 1) / total
      const sweep = frac * 2 * Math.PI
      const end = startAngle + sweep
      const lx = Math.round(cx + Math.cos(startAngle + sweep / 2) * r)
      const ly = Math.round(cy + Math.sin(startAngle + sweep / 2) * r)
      const x1 = Math.round(cx + r * Math.cos(startAngle))
      const y1 = Math.round(cy + r * Math.sin(startAngle))
      const x2 = Math.round(cx + r * Math.cos(end))
      const y2 = Math.round(cy + r * Math.sin(end))
      const large = sweep > Math.PI ? 1 : 0
      svg.ele('path', {
        d: `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${large},1 ${x2},${y2} Z`,
        fill: 'none', stroke: STROKE, 'stroke-width': SW,
      }).up()
      label(svg, lx + 4, ly, el.label)
      startAngle = end
    }

  } else if (isLine) {
    // Line chart
    const vals = elements.map(e => parseFloat(e.value ?? '0') || 0)
    const maxV = Math.max(...vals, 1)
    const step = axisW / Math.max(elements.length - 1, 1)
    const pts = elements.map((_, i) => {
      const x = axisX + i * step
      const y = axisY - (vals[i] / maxV) * axisH
      return `${Math.round(x)},${Math.round(y)}`
    }).join(' ')
    svg.ele('polyline', { points: pts, fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
    // Labels on x axis
    elements.forEach((el, i) => {
      const x = axisX + i * step
      label(svg, Math.round(x) - 8, axisY + 20, el.label)
    })

  } else {
    // Bar chart (default)
    const vals = elements.map(e => parseFloat(e.value ?? '1') || 1)
    const maxV = Math.max(...vals, 1)
    const barW = Math.floor((axisW / elements.length) * 0.7)
    const gap   = Math.floor(axisW / elements.length)
    elements.forEach((el, i) => {
      const barH = Math.round((vals[i] / maxV) * axisH)
      const bx = axisX + i * gap + (gap - barW) / 2
      const by = axisY - barH
      svg.ele('rect', { x: String(Math.round(bx)), y: String(Math.round(by)), width: String(barW), height: String(barH), fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
      label(svg, Math.round(bx), axisY + 20, el.label)
      // Value above bar
      label(svg, Math.round(bx), Math.round(by) - 4, el.value ?? '')
    })
    // Y-axis tick marks (5 ticks)
    for (let t = 0; t <= 5; t++) {
      const ty = Math.round(axisY - (t / 5) * axisH)
      svg.ele('line', { x1: String(axisX - 5), y1: String(ty), x2: String(axisX), y2: String(ty), stroke: STROKE, 'stroke-width': '1.5' }).up()
    }
  }
}

function renderFreeBody(svg: El, analysis: DiagramAnalysis) {
  const { elements, relationships } = analysis

  const positions = new Map<string, { x: number; y: number }>()
  elements.forEach((el, i) => {
    const pos = el.position
      ? { x: toX(el.position.x), y: toY(el.position.y) }
      : gridPosition(i, elements.length)
    positions.set(el.id, pos)
  })

  const DIRECTION_MAP: Record<string, [number, number]> = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
    upward: [0, -1], downward: [0, 1],
  }

  // Draw objects
  for (const el of elements) {
    const t = el.type.toLowerCase()
    const isForce = t.includes('force') || t.includes('vector') || t.includes('arrow')
    if (isForce) continue

    const pos = positions.get(el.id)!
    const cx = Math.round(pos.x)
    const cy = Math.round(pos.y)
    svg.ele('rect', { x: String(cx - 30), y: String(cy - 20), width: '60', height: '40', rx: '6', fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
    label(svg, cx - 26, cy + 4, el.label)
  }

  // Draw force arrows from relationships
  for (const rel of relationships) {
    const from = positions.get(rel.from)
    if (!from) continue
    const cx = Math.round(from.x)
    const cy = Math.round(from.y)

    const dirKey = (rel.label ?? rel.type ?? '').toLowerCase().trim()
    const dir = DIRECTION_MAP[dirKey] ?? [1, 0]
    const mag = (() => {
      const el = elements.find(e => e.id === rel.from || e.id === rel.to)
      const v = parseFloat(el?.value ?? '60')
      return isNaN(v) ? 60 : Math.min(Math.max(v * 4, 40), 120)
    })()

    const ex = cx + dir[0] * mag
    const ey = cy + dir[1] * mag
    svg.ele('line', { x1: String(cx), y1: String(cy), x2: String(Math.round(ex)), y2: String(Math.round(ey)), stroke: STROKE, 'stroke-width': SW }).up()
    arrowHead(svg, cx, cy, Math.round(ex), Math.round(ey))
    const forceEl = elements.find(e => e.id === rel.to)
    if (forceEl) {
      label(svg, Math.round(ex) + 4, Math.round(ey), forceEl.label + (forceEl.value ? ' ' + forceEl.value : ''))
    }
  }
}

function renderGeneric(svg: El, analysis: DiagramAnalysis) {
  const { elements, relationships } = analysis
  const positions = new Map<string, { x: number; y: number }>()
  elements.forEach((el, i) => {
    const pos = el.position
      ? { x: toX(el.position.x), y: toY(el.position.y) }
      : gridPosition(i, elements.length)
    positions.set(el.id, pos)
  })

  for (const rel of relationships) {
    const a = positions.get(rel.from)
    const b = positions.get(rel.to)
    if (!a || !b) continue
    svg.ele('line', {
      x1: String(Math.round(a.x)), y1: String(Math.round(a.y)),
      x2: String(Math.round(b.x)), y2: String(Math.round(b.y)),
      stroke: STROKE, 'stroke-width': '1.5',
    }).up()
  }

  for (const el of elements) {
    const pos = positions.get(el.id)!
    const cx = Math.round(pos.x)
    const cy = Math.round(pos.y)
    svg.ele('rect', { x: String(cx - 28), y: String(cy - 14), width: '56', height: '28', rx: '4', fill: 'none', stroke: STROKE, 'stroke-width': SW }).up()
    label(svg, cx - 24, cy + 4, el.label)
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function renderTactile(analysis: DiagramAnalysis): string {
  const doc = create({ version: '1.0' })
    .ele('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${A4_W} ${A4_H}`,
      width: String(A4_W),
      height: String(A4_H),
    })

  // White background
  doc.ele('rect', { x: '0', y: '0', width: String(A4_W), height: String(A4_H), fill: '#ffffff' }).up()

  // Title + summary in braille
  doc.ele('text', { x: String(DRAW_X), y: '52', 'font-size': '18', 'font-family': 'serif', fill: STROKE })
    .txt(encodeBraille(analysis.title)).up()
  doc.ele('text', { x: String(DRAW_X), y: '82', 'font-size': '12', 'font-family': 'serif', fill: '#555' })
    .txt(encodeBraille(analysis.summary.slice(0, 80))).up()

  // Divider line
  doc.ele('line', { x1: String(DRAW_X), y1: '96', x2: String(DRAW_X + DRAW_W), y2: '96', stroke: '#ccc', 'stroke-width': '1' }).up()

  if (analysis.elements.length === 0) {
    doc.ele('text', { x: String(DRAW_X), y: String(DRAW_Y + 60), 'font-size': '14', 'font-family': 'serif', fill: STROKE })
      .txt(encodeBraille('No elements detected.')).up()
  } else {
    switch (analysis.type) {
      case 'circuit':    renderCircuit(doc, analysis);   break
      case 'graph':      renderGraph(doc, analysis);     break
      case 'free-body':  renderFreeBody(doc, analysis);  break
      default:           renderGeneric(doc, analysis);   break
    }
  }

  const raw = doc.end({ headless: true })

  const result = optimize(raw, {
    plugins: ['removeDoctype', 'removeComments', 'cleanupIds', 'minifyStyles'],
  })

  return result.data
}
