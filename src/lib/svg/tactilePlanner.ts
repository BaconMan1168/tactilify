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
const TITLE_H = 24
const TITLE_Y = MARGIN

const DRAW_X = MARGIN
const DRAW_Y = MARGIN + TITLE_H + 2
const DRAW_W = PAGE_W - 2 * MARGIN         // 180mm
const DRAW_H = 170

const KEY_SEP_Y = DRAW_Y + DRAW_H + 3
const KEY_START_Y = KEY_SEP_Y + 8
const KEY_LINE_H = 9
const KEY_MAX_LINES = Math.floor((PAGE_H - MARGIN - KEY_START_Y) / KEY_LINE_H)

// Circuit loop bounds (inside drawing area)
const LOOP_L = DRAW_X + 20
const LOOP_T = DRAW_Y + 10
const LOOP_R = DRAW_X + DRAW_W - 20
const LOOP_B = DRAW_Y + DRAW_H - 10

const CORNER_GUARD = 14
const HALF_ALONG = 13     // mm gap on each side of component along the wire
const WIRE_SW = 0.5

const MIN_OBJECT_SEP = 3.2

// ── Noise filter ──────────────────────────────────────────────────────────────

const NOISE_TYPES = ['wire', 'node', 'junction', 'connector', 'terminal', 'label', 'annotation', 'text']

function isNoise(type: string): boolean {
  const t = type.toLowerCase()
  return NOISE_TYPES.some(k => t === k || t.startsWith(k))
}

// ── Shape resolver — maps visualShape hint to a ComponentShape ────────────────

function resolveShape(visualShape?: string | null): ComponentShape {
  switch (visualShape) {
    case 'circle':  return 'circle'
    case 'diamond': return 'diamond'
    case 'ellipse': return 'ellipse'
    case 'arrow':   return 'arrow'
    default:        return 'rect'
  }
}

// ── Label builder ─────────────────────────────────────────────────────────────

function elementLabel(el: DiagramElement): string {
  const v = el.value?.trim()
  return v ? `${el.label.trim()} ${v}` : el.label.trim()
}

// ── Topology detection ────────────────────────────────────────────────────────

function detectTopology(elements: DiagramElement[], relationships: Relationship[]): 'series' | 'parallel' | 'unknown' {
  if (relationships.length === 0) return 'unknown'
  const degree = new Map<string, number>()
  for (const rel of relationships) {
    degree.set(rel.from, (degree.get(rel.from) ?? 0) + 1)
    degree.set(rel.to,   (degree.get(rel.to)   ?? 0) + 1)
  }
  const maxDeg = Math.max(...degree.values())
  if (maxDeg <= 2) return 'series'
  if (maxDeg >= 3) return 'parallel'
  return 'unknown'
}

// BFS from a "source" element to order components for clockwise reading around loop
function orderLoopComponents(elements: DiagramElement[], relationships: Relationship[]): DiagramElement[] {
  const sourceKeys = ['battery', 'cell', 'power', 'source', 'voltage', 'supply']
  const source = elements.find(el => sourceKeys.some(k => el.type.toLowerCase().includes(k))) ?? elements[0]

  if (!source || relationships.length === 0) return elements

  const adj = new Map<string, string[]>()
  for (const rel of relationships) {
    if (!adj.has(rel.from)) adj.set(rel.from, [])
    if (!adj.has(rel.to))   adj.set(rel.to, [])
    adj.get(rel.from)!.push(rel.to)
    adj.get(rel.to)!.push(rel.from)
  }

  const ids = new Set(elements.map(e => e.id))
  const ordered: DiagramElement[] = []
  const visited = new Set<string>()
  const queue = [source.id]
  visited.add(source.id)

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
  for (const el of elements) {
    if (!visited.has(el.id)) ordered.push(el)
  }
  return ordered
}

// ── Loop perimeter distribution ───────────────────────────────────────────────

type LoopPoint = { xMm: number; yMm: number; side: 'top' | 'right' | 'bottom' | 'left' }

function distributeOnLoop(n: number): LoopPoint[] {
  const W = LOOP_R - LOOP_L
  const H = LOOP_B - LOOP_T
  const safeT = W - 2 * CORNER_GUARD
  const safeR = H - 2 * CORNER_GUARD
  const safeB = W - 2 * CORNER_GUARD
  const safeL = H - 2 * CORNER_GUARD
  const total = safeT + safeR + safeB + safeL
  const spacing = total / n
  const points: LoopPoint[] = []

  for (let i = 0; i < n; i++) {
    let d = i * spacing + spacing / 2
    if (d < safeT) { points.push({ xMm: LOOP_L + CORNER_GUARD + d, yMm: LOOP_T, side: 'top' }); continue }
    d -= safeT
    if (d < safeR) { points.push({ xMm: LOOP_R, yMm: LOOP_T + CORNER_GUARD + d, side: 'right' }); continue }
    d -= safeR
    if (d < safeB) { points.push({ xMm: LOOP_R - CORNER_GUARD - d, yMm: LOOP_B, side: 'bottom' }); continue }
    d -= safeB
    points.push({ xMm: LOOP_L, yMm: LOOP_B - CORNER_GUARD - d, side: 'left' })
  }
  return points
}

// ── Wire segments for series loop ────────────────────────────────────────────

type CompOnSide = { xMm: number; yMm: number; side: 'top' | 'right' | 'bottom' | 'left'; id: string }

function buildLoopWires(comps: CompOnSide[]): TactileObject[] {
  const wires: TactileObject[] = []
  let wIdx = 0

  function addWire(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    if (dx < 0.5 && dy < 0.5) return
    wires.push({
      id: `wire-${wIdx++}`,
      role: 'wire',
      shape: 'wire',
      xMm: x1,
      yMm: y1,
      points: [{ xMm: x1, yMm: y1 }, { xMm: x2, yMm: y2 }],
    })
  }

  const top    = comps.filter(c => c.side === 'top').sort((a, b) => a.xMm - b.xMm)
  const right  = comps.filter(c => c.side === 'right').sort((a, b) => a.yMm - b.yMm)
  const bottom = comps.filter(c => c.side === 'bottom').sort((a, b) => b.xMm - a.xMm)
  const left   = comps.filter(c => c.side === 'left').sort((a, b) => b.yMm - a.yMm)

  // Top side L→R
  let cur = LOOP_L
  for (const c of top)    { addWire(cur, LOOP_T, c.xMm - HALF_ALONG, LOOP_T); cur = c.xMm + HALF_ALONG }
  addWire(cur, LOOP_T, LOOP_R, LOOP_T)

  // Right side T→B
  cur = LOOP_T
  for (const c of right)  { addWire(LOOP_R, cur, LOOP_R, c.yMm - HALF_ALONG); cur = c.yMm + HALF_ALONG }
  addWire(LOOP_R, cur, LOOP_R, LOOP_B)

  // Bottom side R→L
  cur = LOOP_R
  for (const c of bottom) { addWire(cur, LOOP_B, c.xMm + HALF_ALONG, LOOP_B); cur = c.xMm - HALF_ALONG }
  addWire(cur, LOOP_B, LOOP_L, LOOP_B)

  // Left side B→T
  cur = LOOP_B
  for (const c of left)   { addWire(LOOP_L, cur, LOOP_L, c.yMm + HALF_ALONG); cur = c.yMm - HALF_ALONG }
  addWire(LOOP_L, cur, LOOP_L, LOOP_T)

  return wires
}

// ── Marker label placement (outside the loop, away from wires) ────────────────

function markerPosition(pt: LoopPoint, clearance = 10): { xMm: number; yMm: number } {
  switch (pt.side) {
    case 'top':    return { xMm: pt.xMm - 3, yMm: pt.yMm - clearance }
    case 'right':  return { xMm: pt.xMm + clearance, yMm: pt.yMm - 3 }
    case 'bottom': return { xMm: pt.xMm - 3, yMm: pt.yMm + clearance }
    case 'left':   return { xMm: pt.xMm - clearance - 6, yMm: pt.yMm - 3 }
  }
}

// ── Key entry builder ─────────────────────────────────────────────────────────

function buildKeyEntry(marker: string, el: DiagramElement): TactileKeyEntry {
  const rawText = elementLabel(el)
  const { normalized } = normalizeStemText(rawText)
  return { marker, elementId: el.id, text: rawText, normalizedText: normalized }
}

// ── Grid position fallback ────────────────────────────────────────────────────

function gridPosMm(index: number, total: number): { xMm: number; yMm: number } {
  const cols = Math.min(4, Math.max(1, total))
  const col  = index % cols
  const row  = Math.floor(index / cols)
  const rows = Math.ceil(total / cols)
  return {
    xMm: DRAW_X + (col + 0.5) * (DRAW_W / cols),
    yMm: DRAW_Y + (row + 0.5) * (DRAW_H / rows),
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
  plan: Pick<TactilePlan, 'objects' | 'key' | 'transcriberNotes' | 'layout'>,
  warnings: TactileValidationIssue[],
) {
  if (plan.key.length > KEY_MAX_LINES) {
    warnings.push({
      severity: 'warning',
      code: 'TEXT_OVERFLOW',
      message: `Key has ${plan.key.length} entries but only ${KEY_MAX_LINES} fit on the page.`,
    })
  }
  if (plan.key.length === 0) {
    warnings.push({ severity: 'warning', code: 'NO_LEGEND', message: 'No key entries generated.' })
  }
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
  if (plan.layout === 'cyclic-loop' && plan.transcriberNotes.length === 0) {
    warnings.push({
      severity: 'warning',
      code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE',
      message: 'Cyclic layout used but no transcriber note was generated.',
    })
  }
}

// ── Layout: cyclic (loop perimeter) ──────────────────────────────────────────

function planCyclic(
  analysis: DiagramAnalysis,
  warnings: TactileValidationIssue[],
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = analysis.elements.filter(el => !isNoise(el.type))
  const topology = detectTopology(meaningful, analysis.relationships)
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  const transcriberNotes: string[] = []

  if (meaningful.length >= 2 && meaningful.length <= 12) {
    const ordered = orderLoopComponents(meaningful, analysis.relationships)
    const loopPoints = distributeOnLoop(ordered.length)
    const compsOnSide: CompOnSide[] = []

    ordered.forEach((el, idx) => {
      const pt = loopPoints[idx]
      const marker = String(idx + 1)
      const label = elementLabel(el)

      objects.push({
        id: `comp-${el.id}`,
        sourceElementId: el.id,
        role: 'component',
        shape: resolveShape(el.visualShape),
        xMm: pt.xMm,
        yMm: pt.yMm,
        label,
        marker,
      })

      const mPos = markerPosition(pt)
      objects.push({
        id: `marker-${el.id}`,
        role: 'marker',
        shape: 'marker-label',
        xMm: mPos.xMm,
        yMm: mPos.yMm,
        label,
        marker,
      })

      compsOnSide.push({ xMm: pt.xMm, yMm: pt.yMm, side: pt.side, id: el.id })
      key.push(buildKeyEntry(marker, el))
    })

    objects.push(...buildLoopWires(compsOnSide))

    transcriberNotes.push(
      'Diagram rearranged into a rectangle to make the cyclic connection easier to trace by touch. Follow the numbered components in order around the loop.'
    )

    return { layout: 'cyclic-loop', objects, connections: [], key, transcriberNotes }
  }

  // Fallback for very small or large cyclic diagrams
  if (topology === 'parallel') {
    warnings.push({
      severity: 'warning',
      code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE',
      message: 'Parallel topology detected. Layout approximated — verify with a sighted reviewer.',
    })
  }

  meaningful.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(idx, meaningful.length)
    const marker = String(idx + 1)
    const label = elementLabel(el)

    objects.push({
      id: `comp-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: resolveShape(el.visualShape),
      xMm: pos.xMm,
      yMm: pos.yMm,
      label,
      marker,
    })
    objects.push({
      id: `marker-${el.id}`,
      role: 'marker',
      shape: 'marker-label',
      xMm: pos.xMm + 14,
      yMm: pos.yMm - 10,
      label,
      marker,
    })
    key.push(buildKeyEntry(marker, el))
  })

  const connections: TactileConnection[] = []
  for (const rel of analysis.relationships) {
    const fi = meaningful.findIndex(e => e.id === rel.from)
    const ti = meaningful.findIndex(e => e.id === rel.to)
    if (fi < 0 || ti < 0) continue
    const fp = meaningful[fi].position ? { xMm: DRAW_X + meaningful[fi].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[fi].position!.y * DRAW_H } : gridPosMm(fi, meaningful.length)
    const tp = meaningful[ti].position ? { xMm: DRAW_X + meaningful[ti].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[ti].position!.y * DRAW_H } : gridPosMm(ti, meaningful.length)
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  return { layout: 'cyclic-loop', objects, connections, key, transcriberNotes }
}

// ── Layout: axial (chart with axes) ───────────────────────────────────────────

function planAxial(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const { elements } = analysis
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  const axisX = DRAW_X + 15
  const axisY = DRAW_Y + DRAW_H - 15
  const axisW = DRAW_W - 25
  const axisH = DRAW_H - 25

  objects.push({ id: 'axis-y', role: 'wire', shape: 'axis', xMm: axisX, yMm: DRAW_Y + 5, points: [{ xMm: axisX, yMm: DRAW_Y + 5 }, { xMm: axisX, yMm: axisY }] })
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
        label: elementLabel(el),
        marker,
      })
      objects.push({
        id: `marker-${idx}`,
        role: 'marker',
        shape: 'marker-label',
        xMm: cx + Math.cos(mid) * (r * 0.65) - 3,
        yMm: cy + Math.sin(mid) * (r * 0.65) - 3,
        label: elementLabel(el),
        marker,
      })
      key.push(buildKeyEntry(marker, el))
      startAngle = end
    })

  } else if (isLine) {
    const vals = elements.map(e => parseFloat(e.value ?? '0') || 0)
    const maxV = Math.max(...vals, 1)
    const step = axisW / Math.max(elements.length - 1, 1)
    const pts  = elements.map((_, i) => ({ xMm: axisX + i * step, yMm: axisY - (vals[i] / maxV) * axisH }))

    objects.push({ id: 'line-chart', role: 'component', shape: 'line-chart', xMm: pts[0]?.xMm ?? axisX, yMm: pts[0]?.yMm ?? axisY, points: pts })

    elements.forEach((el, i) => {
      const marker = String(i + 1)
      objects.push({ id: `marker-${i}`, role: 'marker', shape: 'marker-label', xMm: pts[i].xMm - 3, yMm: axisY + 8, label: elementLabel(el), marker })
      key.push(buildKeyEntry(marker, el))
    })

    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }] })
    }

  } else {
    // Bar chart (default)
    const vals = elements.map(e => parseFloat(e.value ?? '1') || 1)
    const maxV = Math.max(...vals, 1)
    const barW = Math.max(8, Math.floor((axisW / elements.length) * 0.6))
    const gap  = axisW / elements.length

    elements.forEach((el, i) => {
      const barH  = (vals[i] / maxV) * axisH
      const bx    = axisX + i * gap + (gap - barW) / 2
      const by    = axisY - barH
      const marker = String(i + 1)

      objects.push({ id: `bar-${i}`, role: 'component', shape: 'bar', xMm: bx, yMm: by, widthMm: barW, heightMm: barH, label: elementLabel(el), marker })
      objects.push({ id: `marker-${i}`, role: 'marker', shape: 'marker-label', xMm: bx + 1, yMm: axisY + 8, label: elementLabel(el), marker })
      key.push(buildKeyEntry(marker, el))
    })

    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }] })
    }
  }

  return { layout: 'axial-chart', objects, connections: [], key, transcriberNotes: [] }
}

// ── Layout: positional (preserve spatial positions) ───────────────────────────

const DIRECTION_MAP: Record<string, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
  upward: [0, -1], downward: [0, 1],
}

function planPositional(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
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

  // Non-arrow elements → labeled boxes
  meaningful.forEach(el => {
    const t = el.type.toLowerCase()
    const isArrow = el.visualShape === 'arrow' || t.includes('force') || t.includes('vector') || t.includes('arrow') || t.includes('ray')
    if (isArrow) return

    const pos = positions.get(el.id)!
    const marker = String(markerIdx++)
    const label = elementLabel(el)

    objects.push({
      id: `obj-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: resolveShape(el.visualShape),
      xMm: pos.xMm,
      yMm: pos.yMm,
      widthMm: 32,
      heightMm: 22,
      label,
      marker,
    })
    objects.push({ id: `marker-obj-${el.id}`, role: 'marker', shape: 'marker-label', xMm: pos.xMm + 14, yMm: pos.yMm - 14, label, marker })
    key.push(buildKeyEntry(marker, el))
  })

  // Arrow/vector elements (from relationships with direction info)
  for (const rel of relationships) {
    const from = positions.get(rel.from)
    if (!from) continue

    const dirKey = (rel.label ?? rel.type ?? '').toLowerCase().trim()
    const dir = DIRECTION_MAP[dirKey] ?? [1, 0]

    // If the relationship has waypoints, use those for the arrow path
    let ex: number, ey: number
    if (rel.waypoints && rel.waypoints.length > 0) {
      const last = rel.waypoints[rel.waypoints.length - 1]
      ex = DRAW_X + last.x * DRAW_W
      ey = DRAW_Y + last.y * DRAW_H
    } else {
      const toEl = meaningful.find(e => e.id === rel.to)
      const rawMag = parseFloat(toEl?.value ?? meaningful.find(e => e.id === rel.from)?.value ?? '50')
      const mag = isNaN(rawMag) ? 50 : Math.min(Math.max(rawMag * 2.5, 25), 80)
      ex = from.xMm + dir[0] * mag
      ey = from.yMm + dir[1] * mag
    }

    const marker = String(markerIdx++)
    const forceEl = meaningful.find(e => e.id === rel.to) ?? meaningful.find(e => e.id === rel.from)
    const label = forceEl ? elementLabel(forceEl) : rel.label ?? rel.type

    objects.push({
      id: `arrow-${rel.from}-${rel.to}`,
      role: 'component',
      shape: 'arrow',
      xMm: from.xMm,
      yMm: from.yMm,
      points: [{ xMm: from.xMm, yMm: from.yMm }, { xMm: ex, yMm: ey }],
      label,
      marker,
    })
    if (forceEl) key.push(buildKeyEntry(marker, forceEl))
  }

  return { layout: 'positional', objects, connections: [], key, transcriberNotes: [] }
}

// ── Layout: directional (flow / DAG) ──────────────────────────────────────────

function planDirectional(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const { elements, relationships } = analysis
  const meaningful = elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  // Sort left-to-right by position.x if available
  const sorted = [...meaningful].sort((a, b) => (a.position?.x ?? 0.5) - (b.position?.x ?? 0.5))

  const posMap = new Map<string, { xMm: number; yMm: number }>()
  sorted.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(idx, sorted.length)
    posMap.set(el.id, pos)

    const marker = String(idx + 1)
    const label = elementLabel(el)
    objects.push({
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: resolveShape(el.visualShape),
      xMm: pos.xMm,
      yMm: pos.yMm,
      label,
      marker,
    })
    objects.push({
      id: `marker-${el.id}`,
      role: 'marker',
      shape: 'marker-label',
      xMm: pos.xMm + 14,
      yMm: pos.yMm - 10,
      label,
      marker,
    })
    key.push(buildKeyEntry(marker, el))
  })

  const connections: TactileConnection[] = []
  for (const rel of relationships) {
    const fp = posMap.get(rel.from)
    const tp = posMap.get(rel.to)
    if (!fp || !tp) continue

    const path = rel.waypoints && rel.waypoints.length > 0
      ? [fp, ...rel.waypoints.map(w => ({ xMm: DRAW_X + w.x * DRAW_W, yMm: DRAW_Y + w.y * DRAW_H })), tp]
      : [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp]

    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path })
  }

  return { layout: 'directional', objects, connections, key, transcriberNotes: [] }
}

// ── Layout: grid fallback ─────────────────────────────────────────────────────

function planGrid(analysis: DiagramAnalysis): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = analysis.elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  meaningful.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: DRAW_Y + el.position.y * DRAW_H }
      : gridPosMm(idx, meaningful.length)
    const marker = String(idx + 1)
    const label = elementLabel(el)

    objects.push({
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape: resolveShape(el.visualShape),
      xMm: pos.xMm,
      yMm: pos.yMm,
      label,
      marker,
    })
    objects.push({
      id: `marker-${el.id}`,
      role: 'marker',
      shape: 'marker-label',
      xMm: pos.xMm + 14,
      yMm: pos.yMm - 10,
      label,
      marker,
    })
    key.push(buildKeyEntry(marker, el))
  })

  const connections: TactileConnection[] = []
  for (const rel of analysis.relationships) {
    const fi = meaningful.findIndex(e => e.id === rel.from)
    const ti = meaningful.findIndex(e => e.id === rel.to)
    if (fi < 0 || ti < 0) continue
    const fp = meaningful[fi].position ? { xMm: DRAW_X + meaningful[fi].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[fi].position!.y * DRAW_H } : gridPosMm(fi, meaningful.length)
    const tp = meaningful[ti].position ? { xMm: DRAW_X + meaningful[ti].position!.x * DRAW_W, yMm: DRAW_Y + meaningful[ti].position!.y * DRAW_H } : gridPosMm(ti, meaningful.length)
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  return { layout: 'grid', objects, connections, key, transcriberNotes: [] }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function buildTactilePlan(analysis: DiagramAnalysis): TactilePlan {
  const warnings: TactileValidationIssue[] = []

  let partial: Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'>

  switch (analysis.layoutHint) {
    case 'cyclic':      partial = planCyclic(analysis, warnings);   break
    case 'axial':       partial = planAxial(analysis);              break
    case 'positional':  partial = planPositional(analysis);         break
    case 'directional': partial = planDirectional(analysis);        break
    default:            partial = planGrid(analysis);               break
  }

  const plan: TactilePlan = {
    page: { widthMm: PAGE_W, heightMm: PAGE_H, marginMm: MARGIN, orientation: 'portrait' },
    drawingArea: { xMm: DRAW_X, yMm: DRAW_Y, widthMm: DRAW_W, heightMm: DRAW_H },
    layoutHint: analysis.layoutHint,
    title: analysis.title,
    ...partial,
    warnings,
  }

  validate(plan, warnings)
  return plan
}

export { KEY_START_Y, KEY_LINE_H, KEY_MAX_LINES, KEY_SEP_Y, TITLE_Y, MARGIN, PAGE_W, PAGE_H, WIRE_SW }
