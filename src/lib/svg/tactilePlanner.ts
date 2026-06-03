import type { DiagramAnalysis, DiagramElement, Relationship } from '@/types/diagram'
import type {
  TactilePlan,
  TactileObject,
  TactileConnection,
  TactileKeyEntry,
  TactileValidationIssue,
  ComponentShape,
} from '@/types/tactile'
import { normalizeStemText } from '@/lib/braille'

// ── Page constants (A4 portrait, all in mm) ───────────────────────────────────

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 15
const TITLE_H = 18      // reserved at top for title braille line
const TITLE_Y = MARGIN + 12  // baseline of title row

// Drawing area: below title, above key separator
const DRAW_X = MARGIN
const DRAW_Y = MARGIN + TITLE_H + 4
const DRAW_W = PAGE_W - 2 * MARGIN         // 180mm
const DRAW_H = 170                          // mm tall drawing region

// Key area
const KEY_SEP_Y = DRAW_Y + DRAW_H + 3      // separator line
const KEY_START_Y = KEY_SEP_Y + 8          // first key entry baseline
const KEY_LINE_H = 9                        // mm per key line
const KEY_MAX_LINES = Math.floor((PAGE_H - MARGIN - KEY_START_Y) / KEY_LINE_H)

// Circuit loop (inside drawing area)
const LOOP_L = DRAW_X + 20
const LOOP_T = DRAW_Y + 10
const LOOP_R = DRAW_X + DRAW_W - 20        // 175mm
const LOOP_B = DRAW_Y + DRAW_H - 10

const CORNER_GUARD = 14   // mm clearance from loop corners
const HALF_ALONG = 13     // mm half-extent of any component along the wire direction
const WIRE_SW = 0.5       // stroke-width for wires (mm)

// Minimum spacing checks
const MIN_OBJECT_SEP = 3.2  // mm between adjacent tactile objects

// ── Noise filter (shared with renderer) ──────────────────────────────────────

const KEEP_TYPES = [
  'battery', 'cell', 'power', 'source', 'voltage',
  'resistor',
  'capacitor',
  'inductor', 'coil',
  'bulb', 'lamp', 'led', 'light',
  'switch',
  'diode', 'transistor', 'transformer',
  'ammeter', 'voltmeter', 'galvanometer', 'meter',
  'motor', 'generator',
  'bar', 'column', 'line', 'point', 'data', 'sector', 'slice', 'pie', 'segment',
  'object', 'mass', 'block', 'body', 'surface', 'force', 'vector', 'arrow',
]

function isNoise(type: string): boolean {
  const t = type.toLowerCase()
  return !KEEP_TYPES.some(k => t.includes(k))
}

// ── Circuit topology helpers ──────────────────────────────────────────────────

function detectTopology(elements: DiagramElement[], relationships: Relationship[]): 'series' | 'parallel' | 'unknown' {
  if (relationships.length === 0) return 'unknown'
  const degree = new Map<string, number>()
  for (const rel of relationships) {
    degree.set(rel.from, (degree.get(rel.from) ?? 0) + 1)
    degree.set(rel.to, (degree.get(rel.to) ?? 0) + 1)
  }
  const maxDeg = Math.max(...degree.values())
  if (maxDeg <= 2) return 'series'
  if (maxDeg >= 3) return 'parallel'
  return 'unknown'
}

// BFS from battery to order series components for reading order around loop
function orderSeriesComponents(elements: DiagramElement[], relationships: Relationship[]): DiagramElement[] {
  const batteryKeys = ['battery', 'cell', 'power', 'source', 'voltage']
  const battery = elements.find(el => batteryKeys.some(k => el.type.toLowerCase().includes(k)))

  if (!battery || relationships.length === 0) return elements

  const adj = new Map<string, string[]>()
  for (const rel of relationships) {
    if (!adj.has(rel.from)) adj.set(rel.from, [])
    if (!adj.has(rel.to)) adj.set(rel.to, [])
    adj.get(rel.from)!.push(rel.to)
    adj.get(rel.to)!.push(rel.from)
  }

  const ids = new Set(elements.map(e => e.id))
  const ordered: DiagramElement[] = []
  const visited = new Set<string>()
  const queue = [battery.id]
  visited.add(battery.id)

  while (queue.length > 0) {
    const cur = queue.shift()!
    const el = elements.find(e => e.id === cur)
    if (el) ordered.push(el)
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next) && ids.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  // Append any unreachable (disconnected)
  for (const el of elements) {
    if (!visited.has(el.id)) ordered.push(el)
  }
  return ordered
}

// ── Safe perimeter distribution for series loop ───────────────────────────────

type LoopPoint = { xMm: number; yMm: number; side: 'top' | 'right' | 'bottom' | 'left' }

function distributeOnLoop(n: number): LoopPoint[] {
  const W = LOOP_R - LOOP_L
  const H = LOOP_B - LOOP_T

  // Safe region lengths per side (excluding corner guards)
  const safeT = W - 2 * CORNER_GUARD
  const safeR = H - 2 * CORNER_GUARD
  const safeB = W - 2 * CORNER_GUARD
  const safeL = H - 2 * CORNER_GUARD
  const total = safeT + safeR + safeB + safeL

  const spacing = total / n
  const points: LoopPoint[] = []

  for (let i = 0; i < n; i++) {
    let d = i * spacing + spacing / 2

    if (d < safeT) {
      points.push({ xMm: LOOP_L + CORNER_GUARD + d, yMm: LOOP_T, side: 'top' })
      continue
    }
    d -= safeT
    if (d < safeR) {
      points.push({ xMm: LOOP_R, yMm: LOOP_T + CORNER_GUARD + d, side: 'right' })
      continue
    }
    d -= safeR
    if (d < safeB) {
      // Bottom side goes right-to-left
      points.push({ xMm: LOOP_R - CORNER_GUARD - d, yMm: LOOP_B, side: 'bottom' })
      continue
    }
    d -= safeB
    // Left side goes bottom-to-top
    points.push({ xMm: LOOP_L, yMm: LOOP_B - CORNER_GUARD - d, side: 'left' })
  }
  return points
}

// ── Circuit component shape resolver ─────────────────────────────────────────

function circuitShape(type: string): ComponentShape {
  const t = type.toLowerCase()
  if (t.includes('battery') || t.includes('cell') || t.includes('power') || t.includes('source') || t.includes('voltage')) return 'battery'
  if (t.includes('resistor')) return 'resistor'
  if (t.includes('capacitor')) return 'capacitor'
  if (t.includes('inductor') || t.includes('coil')) return 'inductor'
  if (t.includes('bulb') || t.includes('lamp') || t.includes('led') || t.includes('light')) return 'bulb'
  if (t.includes('switch')) return 'switch'
  return 'generic-component'
}

// ── Wire segments for series loop ────────────────────────────────────────────

type CompOnSide = { xMm: number; yMm: number; side: 'top' | 'right' | 'bottom' | 'left'; id: string }

function buildLoopWires(comps: CompOnSide[]): TactileObject[] {
  const wires: TactileObject[] = []
  let wIdx = 0

  function addWire(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    if (dx < 0.5 && dy < 0.5) return  // skip zero-length segments
    wires.push({
      id: `wire-${wIdx++}`,
      role: 'wire',
      shape: 'wire',
      xMm: x1,
      yMm: y1,
      points: [{ xMm: x1, yMm: y1 }, { xMm: x2, yMm: y2 }],
    })
  }

  // Group components by side
  const top    = comps.filter(c => c.side === 'top').sort((a, b) => a.xMm - b.xMm)
  const right  = comps.filter(c => c.side === 'right').sort((a, b) => a.yMm - b.yMm)
  const bottom = comps.filter(c => c.side === 'bottom').sort((a, b) => b.xMm - a.xMm)  // R→L
  const left   = comps.filter(c => c.side === 'left').sort((a, b) => b.yMm - a.yMm)   // B→T

  // Top side: L→R
  {
    let cur = LOOP_L
    for (const c of top) {
      addWire(cur, LOOP_T, c.xMm - HALF_ALONG, LOOP_T)
      cur = c.xMm + HALF_ALONG
    }
    addWire(cur, LOOP_T, LOOP_R, LOOP_T)
  }

  // Right side: T→B
  {
    let cur = LOOP_T
    for (const c of right) {
      addWire(LOOP_R, cur, LOOP_R, c.yMm - HALF_ALONG)
      cur = c.yMm + HALF_ALONG
    }
    addWire(LOOP_R, cur, LOOP_R, LOOP_B)
  }

  // Bottom side: R→L
  {
    let cur = LOOP_R
    for (const c of bottom) {
      addWire(cur, LOOP_B, c.xMm + HALF_ALONG, LOOP_B)
      cur = c.xMm - HALF_ALONG
    }
    addWire(cur, LOOP_B, LOOP_L, LOOP_B)
  }

  // Left side: B→T
  {
    let cur = LOOP_B
    for (const c of left) {
      addWire(LOOP_L, cur, LOOP_L, c.yMm + HALF_ALONG)
      cur = c.yMm - HALF_ALONG
    }
    addWire(LOOP_L, cur, LOOP_L, LOOP_T)
  }

  return wires
}

// ── Marker label placement (outside loop, clearance from component) ───────────

function markerPosition(pt: LoopPoint, markerClearance = 10): { xMm: number; yMm: number } {
  switch (pt.side) {
    case 'top':    return { xMm: pt.xMm - 3, yMm: pt.yMm - markerClearance }
    case 'right':  return { xMm: pt.xMm + markerClearance, yMm: pt.yMm - 3 }
    case 'bottom': return { xMm: pt.xMm - 3, yMm: pt.yMm + markerClearance }
    case 'left':   return { xMm: pt.xMm - markerClearance - 6, yMm: pt.yMm - 3 }
  }
}

// ── Key entry builder ─────────────────────────────────────────────────────────

function buildKeyEntry(marker: string, el: DiagramElement): TactileKeyEntry {
  const rawLabel = el.label.trim()
  const rawValue = el.value?.trim() ?? ''
  const rawText = rawValue ? `${rawLabel} ${rawValue}` : rawLabel
  const { normalized } = normalizeStemText(rawText)
  return { marker, elementId: el.id, text: rawText, normalizedText: normalized }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
  plan: Pick<TactilePlan, 'objects' | 'key' | 'transcriberNotes' | 'layout'>,
  warnings: TactileValidationIssue[],
) {
  // Key overflow
  if (plan.key.length > KEY_MAX_LINES) {
    warnings.push({
      severity: 'warning',
      code: 'TEXT_OVERFLOW',
      message: `Key has ${plan.key.length} entries but only ${KEY_MAX_LINES} fit on the page. Some entries will be truncated.`,
    })
  }

  // No key entries
  if (plan.key.length === 0) {
    warnings.push({ severity: 'warning', code: 'NO_LEGEND', message: 'No key entries generated.' })
  }

  // Unknown symbols in key entries
  for (const entry of plan.key) {
    const { unknownSymbols } = normalizeStemText(entry.normalizedText)
    for (const sym of unknownSymbols) {
      warnings.push({
        severity: 'warning',
        code: 'UNKNOWN_SYMBOL',
        message: `Symbol '${sym}' in key entry '${entry.normalizedText}' could not be normalised for Braille.`,
      })
    }
  }

  // Normalised layout without transcriber note
  if (plan.layout === 'orthogonal-series-loop' && plan.transcriberNotes.length === 0) {
    warnings.push({
      severity: 'warning',
      code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE',
      message: 'Layout was normalised but no transcriber note was generated.',
    })
  }
}

// ── Grid layout (fallback / graphs / free-body) ───────────────────────────────

function gridPosMm(index: number, total: number): { xMm: number; yMm: number } {
  const cols = Math.min(4, Math.max(1, total))
  const col = index % cols
  const row = Math.floor(index / cols)
  const rows = Math.ceil(total / cols)
  return {
    xMm: DRAW_X + (col + 0.5) * (DRAW_W / cols),
    yMm: DRAW_Y + (row + 0.5) * (DRAW_H / rows),
  }
}

// ── Diagram-type plan builders ────────────────────────────────────────────────

function planCircuit(analysis: DiagramAnalysis, warnings: TactileValidationIssue[]): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = analysis.elements.filter(el => !isNoise(el.type))
  const topology = detectTopology(meaningful, analysis.relationships)
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  const transcriberNotes: string[] = []

  if (topology === 'series' && meaningful.length >= 2 && meaningful.length <= 12) {
    const ordered = orderSeriesComponents(meaningful, analysis.relationships)
    const loopPoints = distributeOnLoop(ordered.length)

    const compsOnSide: CompOnSide[] = []

    ordered.forEach((el, idx) => {
      const pt = loopPoints[idx]
      const marker = String(idx + 1)
      const shape = circuitShape(el.type)

      objects.push({
        id: `comp-${el.id}`,
        sourceElementId: el.id,
        role: 'component',
        shape,
        xMm: pt.xMm,
        yMm: pt.yMm,
        rotated: pt.side === 'left' || pt.side === 'right',
        marker,
      })

      const mPos = markerPosition(pt)
      objects.push({
        id: `marker-${el.id}`,
        role: 'marker',
        shape: 'marker-label',
        xMm: mPos.xMm,
        yMm: mPos.yMm,
        marker,
      })

      compsOnSide.push({ xMm: pt.xMm, yMm: pt.yMm, side: pt.side, id: el.id })
      key.push(buildKeyEntry(marker, el))
    })

    const wires = buildLoopWires(compsOnSide)
    objects.push(...wires)

    transcriberNotes.push(
      'Circuit layout rearranged into a rectangle to make the series connection easier to trace by touch. Follow the numbered components in order around the loop.'
    )

    return { layout: 'orthogonal-series-loop', objects, connections: [], key, transcriberNotes }
  }

  // Fallback: grid positions, straight relationship lines
  if (topology === 'parallel') {
    warnings.push({
      severity: 'warning',
      code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE',
      message: 'Parallel circuit detected. Layout approximated — verify with a sighted reviewer.',
    })
  }

  meaningful.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(idx, meaningful.length)
    const marker = String(idx + 1)

    objects.push({
      id: `comp-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: circuitShape(el.type),
      xMm: pos.xMm,
      yMm: pos.yMm,
      marker,
    })
    objects.push({
      id: `marker-${el.id}`,
      role: 'marker',
      shape: 'marker-label',
      xMm: pos.xMm + 14,
      yMm: pos.yMm - 10,
      marker,
    })
    key.push(buildKeyEntry(marker, el))
  })

  const connections: TactileConnection[] = []
  for (const rel of analysis.relationships) {
    const fromEl = meaningful.find(e => e.id === rel.from)
    const toEl   = meaningful.find(e => e.id === rel.to)
    if (!fromEl || !toEl) continue
    const fi = meaningful.indexOf(fromEl)
    const ti = meaningful.indexOf(toEl)
    const fp = fromEl.position ? { xMm: DRAW_X + fromEl.position.x * DRAW_W, yMm: DRAW_Y + fromEl.position.y * DRAW_H } : gridPosMm(fi, meaningful.length)
    const tp = toEl.position   ? { xMm: DRAW_X + toEl.position.x * DRAW_W,   yMm: DRAW_Y + toEl.position.y * DRAW_H }   : gridPosMm(ti, meaningful.length)

    // Orthogonal 2-segment wire (horizontal then vertical)
    connections.push({
      from: rel.from,
      to: rel.to,
      path: [
        { xMm: fp.xMm, yMm: fp.yMm },
        { xMm: tp.xMm, yMm: fp.yMm },
        { xMm: tp.xMm, yMm: tp.yMm },
      ],
    })
  }

  return { layout: 'custom', objects, connections, key, transcriberNotes }
}

function planGraph(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const { elements } = analysis
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  const axisX = DRAW_X + 15
  const axisY = DRAW_Y + DRAW_H - 15
  const axisW = DRAW_W - 25
  const axisH = DRAW_H - 25

  // Y-axis
  objects.push({ id: 'axis-y', role: 'wire', shape: 'axis', xMm: axisX, yMm: DRAW_Y + 5, points: [{ xMm: axisX, yMm: DRAW_Y + 5 }, { xMm: axisX, yMm: axisY }] })
  // X-axis
  objects.push({ id: 'axis-x', role: 'wire', shape: 'axis', xMm: axisX, yMm: axisY, points: [{ xMm: axisX, yMm: axisY }, { xMm: axisX + axisW, yMm: axisY }] })

  const types = elements.map(e => e.type.toLowerCase())
  const isLine = types.some(t => t.includes('line') || t.includes('point') || t.includes('data'))
  const isPie  = types.some(t => t.includes('sector') || t.includes('slice') || t.includes('pie') || t.includes('segment'))

  if (isPie) {
    const cx = DRAW_X + DRAW_W / 2
    const cy = DRAW_Y + DRAW_H / 2
    const r  = Math.min(DRAW_W, DRAW_H) / 2 - 20
    const total = elements.reduce((s, e) => s + (parseFloat(e.value ?? '1') || 1), 0)
    let startAngle = -Math.PI / 2

    elements.forEach((el, idx) => {
      const frac  = (parseFloat(el.value ?? '1') || 1) / total
      const sweep = frac * 2 * Math.PI
      const end   = startAngle + sweep
      const mid   = startAngle + sweep / 2
      const marker = String(idx + 1)

      objects.push({
        id: `sector-${idx}`,
        role: 'component',
        shape: 'pie-sector',
        xMm: cx,
        yMm: cy,
        extra: { r, startAngle, endAngle: end, sweep },
        marker,
      })
      objects.push({
        id: `marker-${idx}`,
        role: 'marker',
        shape: 'marker-label',
        xMm: cx + Math.cos(mid) * (r * 0.65) - 3,
        yMm: cy + Math.sin(mid) * (r * 0.65) - 3,
        marker,
      })
      key.push(buildKeyEntry(marker, el))
      startAngle = end
    })

  } else if (isLine) {
    const vals = elements.map(e => parseFloat(e.value ?? '0') || 0)
    const maxV = Math.max(...vals, 1)
    const step = axisW / Math.max(elements.length - 1, 1)
    const pts = elements.map((_, i) => ({
      xMm: axisX + i * step,
      yMm: axisY - (vals[i] / maxV) * axisH,
    }))

    objects.push({ id: 'line-chart', role: 'component', shape: 'line-chart', xMm: pts[0]?.xMm ?? axisX, yMm: pts[0]?.yMm ?? axisY, points: pts })

    elements.forEach((el, i) => {
      const marker = String(i + 1)
      objects.push({ id: `marker-${i}`, role: 'marker', shape: 'marker-label', xMm: pts[i].xMm - 3, yMm: axisY + 8, marker })
      key.push(buildKeyEntry(marker, el))
    })

    // Tick marks on y-axis
    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }] })
    }

  } else {
    // Bar chart
    const vals = elements.map(e => parseFloat(e.value ?? '1') || 1)
    const maxV = Math.max(...vals, 1)
    const barW = Math.max(8, Math.floor((axisW / elements.length) * 0.6))
    const gap  = axisW / elements.length

    elements.forEach((el, i) => {
      const barH  = (vals[i] / maxV) * axisH
      const bx    = axisX + i * gap + (gap - barW) / 2
      const by    = axisY - barH
      const marker = String(i + 1)

      objects.push({
        id: `bar-${i}`,
        role: 'component',
        shape: 'bar',
        xMm: bx,
        yMm: by,
        widthMm: barW,
        heightMm: barH,
        marker,
      })
      objects.push({ id: `marker-${i}`, role: 'marker', shape: 'marker-label', xMm: bx + 1, yMm: axisY + 8, marker })
      key.push(buildKeyEntry(marker, el))
    })

    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }] })
    }
  }

  return { layout: 'custom', objects, connections: [], key, transcriberNotes: [] }
}

const DIRECTION_MAP: Record<string, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
  upward: [0, -1], downward: [0, 1],
}

function planFreeBody(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const { elements, relationships } = analysis
  const meaningful = elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  let markerIdx = 1

  const positions = new Map<string, { xMm: number; yMm: number }>()
  meaningful.forEach((el, i) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(i, meaningful.length)
    positions.set(el.id, pos)
  })

  // Draw object blocks (non-force elements)
  meaningful.forEach(el => {
    const t = el.type.toLowerCase()
    const isForce = t.includes('force') || t.includes('vector') || t.includes('arrow')
    if (isForce) return

    const pos = positions.get(el.id)!
    const marker = String(markerIdx++)
    objects.push({
      id: `obj-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: 'object-rect',
      xMm: pos.xMm - 16,
      yMm: pos.yMm - 11,
      widthMm: 32,
      heightMm: 22,
      marker,
    })
    objects.push({ id: `marker-obj-${el.id}`, role: 'marker', shape: 'marker-label', xMm: pos.xMm + 14, yMm: pos.yMm - 14, marker })
    key.push(buildKeyEntry(marker, el))
  })

  // Draw force vectors
  for (const rel of relationships) {
    const from = positions.get(rel.from)
    if (!from) continue

    const dirKey = (rel.label ?? rel.type ?? '').toLowerCase().trim()
    const dir = DIRECTION_MAP[dirKey] ?? [1, 0]
    const rawMag = parseFloat(meaningful.find(e => e.id === rel.from || e.id === rel.to)?.value ?? '50')
    const mag = isNaN(rawMag) ? 50 : Math.min(Math.max(rawMag * 2.5, 25), 80)

    const ex = from.xMm + dir[0] * mag
    const ey = from.yMm + dir[1] * mag
    const marker = String(markerIdx++)
    const forceEl = meaningful.find(e => e.id === rel.to) ?? meaningful.find(e => e.id === rel.from)

    objects.push({
      id: `force-${rel.from}-${rel.to}`,
      role: 'component',
      shape: 'force-arrow',
      xMm: from.xMm,
      yMm: from.yMm,
      points: [{ xMm: from.xMm, yMm: from.yMm }, { xMm: ex, yMm: ey }],
      marker,
    })
    if (forceEl) key.push(buildKeyEntry(marker, forceEl))
  }

  return { layout: 'custom', objects, connections: [], key, transcriberNotes: [] }
}

function planGeneric(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = analysis.elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  meaningful.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(idx, meaningful.length)
    const marker = String(idx + 1)

    objects.push({
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: 'generic-component',
      xMm: pos.xMm,
      yMm: pos.yMm,
      widthMm: 20,
      heightMm: 12,
      marker,
    })
    objects.push({ id: `marker-${el.id}`, role: 'marker', shape: 'marker-label', xMm: pos.xMm + 12, yMm: pos.yMm - 8, marker })
    key.push(buildKeyEntry(marker, el))
  })

  const connections: TactileConnection[] = []
  for (const rel of analysis.relationships) {
    const fi = meaningful.findIndex(e => e.id === rel.from)
    const ti = meaningful.findIndex(e => e.id === rel.to)
    if (fi < 0 || ti < 0) continue
    const fp = meaningful[fi].position ? { xMm: DRAW_X + meaningful[fi].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[fi].position!.y * DRAW_H } : gridPosMm(fi, meaningful.length)
    const tp = meaningful[ti].position ? { xMm: DRAW_X + meaningful[ti].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[ti].position!.y * DRAW_H } : gridPosMm(ti, meaningful.length)
    connections.push({ from: rel.from, to: rel.to, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  return { layout: 'custom', objects, connections, key, transcriberNotes: [] }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function buildTactilePlan(analysis: DiagramAnalysis): TactilePlan {
  const warnings: TactileValidationIssue[] = []

  let partial: Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'>

  switch (analysis.type) {
    case 'circuit':   partial = planCircuit(analysis, warnings);  break
    case 'graph':     partial = planGraph(analysis);              break
    case 'free-body': partial = planFreeBody(analysis);           break
    default:          partial = planGeneric(analysis);            break
  }

  const plan: TactilePlan = {
    page: {
      widthMm: PAGE_W,
      heightMm: PAGE_H,
      marginMm: MARGIN,
      orientation: 'portrait',
    },
    drawingArea: {
      xMm: DRAW_X,
      yMm: DRAW_Y,
      widthMm: DRAW_W,
      heightMm: DRAW_H,
    },
    diagramType: analysis.type === 'unknown' ? 'unknown' : analysis.type,
    title: analysis.title,
    ...partial,
    warnings,
  }

  validate(plan, warnings)
  return plan
}

export { KEY_START_Y, KEY_LINE_H, KEY_MAX_LINES, KEY_SEP_Y, TITLE_Y, MARGIN, PAGE_W, PAGE_H, WIRE_SW }
