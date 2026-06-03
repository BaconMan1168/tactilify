// Server-only — do not import from client components
import ELK from 'elkjs'
import type { Relationship } from '@/types/diagram'
import type {
  TactilePlan,
  TactileObject,
  TactileConnection,
  TactileKeyEntry,
  TactileValidationIssue,
  ComponentShape,
  Bbox,
  TactileDomain,
  TactileStrategy,
  AdaptedDiagramElement,
  TactilePageSpec,
  ZoneRect,
} from '@/types/tactile'
import { normalizeStemText } from '@/lib/braille'
import { brailleFootprintMm, CELL_W, LINE_H } from '@/lib/brailleMetrics'
import { normalizeSymbolHint } from '@/lib/svg/tactileAdaptor'

// ── Page constants (A4 portrait, all in mm) ───────────────────────────────────

export const PAGE_W = 210
export const PAGE_H = 297
export const MARGIN = 15
export const WIRE_SW = 0.5

const DRAW_X = MARGIN
const DRAW_W = PAGE_W - 2 * MARGIN  // 180mm

const CORNER_GUARD = 14
const HALF_ALONG = 13
const KEY_LINE_H = LINE_H
const INSTRUCTIONS_MAX_LINES_SINGLE = 2
const INSTRUCTIONS_MAX_LINES_OVERVIEW = 4

// ── Dynamic layout context ────────────────────────────────────────────────────

type DynLayout = { drawY: number; drawH: number }

// ── Noise filter ──────────────────────────────────────────────────────────────

const NOISE_TYPES = ['wire', 'node', 'junction', 'connector', 'terminal', 'label', 'annotation', 'text']

function isNoise(type: string): boolean {
  const t = type.toLowerCase()
  return NOISE_TYPES.some(k => t === k || t.startsWith(k))
}

// ── Shape resolver ────────────────────────────────────────────────────────────

function resolveShape(el: AdaptedDiagramElement): ComponentShape {
  if (el.componentShape) return el.componentShape
  switch (el.visualShape) {
    case 'circle':  return 'circle'
    case 'diamond': return 'diamond'
    case 'ellipse': return 'ellipse'
    case 'arrow':   return 'arrow'
    default:        return 'rect'
  }
}

// ── Label builder ─────────────────────────────────────────────────────────────

function elementLabel(el: AdaptedDiagramElement): string {
  const v = el.value?.trim()
  return v ? `${el.label.trim()} ${v}` : el.label.trim()
}

// ── Bbox helpers ──────────────────────────────────────────────────────────────

function bboxOverlaps(a: Bbox, b: Bbox, pad = 2): boolean {
  return (
    a.x - pad < b.x + b.w + pad &&
    a.x + a.w + pad > b.x - pad &&
    a.y - pad < b.y + b.h + pad &&
    a.y + a.h + pad > b.y - pad
  )
}

function pathBbox(path: { xMm: number; yMm: number }[], pad = 1): Bbox {
  const xs = path.map(p => p.xMm)
  const ys = path.map(p => p.yMm)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY }
}

function componentBboxMm(obj: TactileObject): Bbox {
  const x = obj.xMm, y = obj.yMm
  switch (obj.shape) {
    case 'circle':  return { x: x - 10, y: y - 10, w: 20, h: 20 }
    case 'diamond': return { x: x - 14, y: y - 9,  w: 28, h: 18 }
    case 'ellipse': return { x: x - 14, y: y - 8,  w: 28, h: 16 }
    case 'wire':
    case 'axis':
    case 'arrow':
    case 'force-arrow-scaled': {
      const pts = obj.points ?? [{ xMm: x, yMm: y }]
      return pathBbox(pts, 1)
    }
    // Domain symbols — approximate footprint
    case 'battery-symbol':   return { x: x - 10, y: y - 5,  w: 20, h: 10 }
    case 'resistor-symbol':  return { x: x - 10, y: y - 4,  w: 20, h: 8  }
    case 'capacitor-symbol': return { x: x - 6,  y: y - 8,  w: 12, h: 16 }
    case 'switch-symbol':    return { x: x - 10, y: y - 5,  w: 20, h: 10 }
    case 'lamp-symbol':      return { x: x - 8,  y: y - 8,  w: 16, h: 16 }
    case 'inductor-symbol':  return { x: x - 10, y: y - 4,  w: 20, h: 8  }
    case 'diode-symbol':     return { x: x - 8,  y: y - 6,  w: 16, h: 12 }
    case 'atom-circle':      return { x: x - 8,  y: y - 8,  w: 16, h: 16 }
    case 'bond-line':        return { x: x - 10, y: y - 3,  w: 20, h: 6  }
    case 'angle-arc':        return { x: x - 8,  y: y - 8,  w: 16, h: 16 }
    case 'right-angle-mark': return { x: x - 3,  y: y - 3,  w: 6,  h: 6  }
    default:                 return { x: x - 14, y: y - 7,  w: 28, h: 14 }
  }
}

type Dir = 'top' | 'right' | 'bottom' | 'left'

const CANDIDATE_ORDER: Record<Dir, Dir[]> = {
  top:    ['top', 'right', 'left', 'bottom'],
  right:  ['right', 'top', 'bottom', 'left'],
  bottom: ['bottom', 'right', 'left', 'top'],
  left:   ['left', 'top', 'bottom', 'right'],
}

function markerCandidatePos(
  dir: Dir,
  compBbox: Bbox,
  fw: number,
  fh: number,
  clearance: number,
): { xMm: number; yMm: number } {
  const cx = compBbox.x + compBbox.w / 2
  const cy = compBbox.y + compBbox.h / 2
  switch (dir) {
    case 'top':    return { xMm: cx - fw / 2, yMm: compBbox.y - clearance - fh }
    case 'bottom': return { xMm: cx - fw / 2, yMm: compBbox.y + compBbox.h + clearance }
    case 'right':  return { xMm: compBbox.x + compBbox.w + clearance, yMm: cy - fh / 2 }
    case 'left':   return { xMm: compBbox.x - clearance - fw, yMm: cy - fh / 2 }
  }
}

function placeMarkerLabel(
  side: Dir,
  compBbox: Bbox,
  footprint: { widthMm: number; heightMm: number },
  occupied: Bbox[],
  clearance = 10,
): { xMm: number; yMm: number; bboxMm: Bbox } | null {
  const { widthMm: fw, heightMm: fh } = footprint
  for (const dir of CANDIDATE_ORDER[side]) {
    const { xMm, yMm } = markerCandidatePos(dir, compBbox, fw, fh, clearance)
    const bboxMm: Bbox = { x: xMm, y: yMm, w: fw, h: fh }
    if (!occupied.some(o => bboxOverlaps(o, bboxMm))) {
      return { xMm, yMm, bboxMm }
    }
  }
  return null
}

// ── Universal marker post-processor ──────────────────────────────────────────

function placeAllMarkers(
  objects: TactileObject[],
  connections: TactileConnection[],
  initialOccupied: Bbox[],
  pageW: number,
  pageMm: number,
): TactileObject[] {
  const occupied: Bbox[] = [...initialOccupied]
  for (const obj of objects) {
    if (obj.bboxMm) occupied.push(obj.bboxMm)
    else if (obj.points && obj.points.length >= 2) occupied.push(pathBbox(obj.points))
  }
  for (const conn of connections) {
    if (conn.path.length >= 2) occupied.push(pathBbox(conn.path))
  }

  const markers: TactileObject[] = []
  for (const obj of objects) {
    if (!obj.marker || !obj.bboxMm) continue

    const labelText = obj.labelMethod === 'lead-line' || obj.labelMethod === 'direct'
      ? (obj.label ?? obj.marker)
      : obj.marker

    const { normalized: normMarker } = normalizeStemText(labelText)
    const footprint = brailleFootprintMm(normMarker, pageW - 2 * pageMm)
    const side: Dir = (obj.markerSide as Dir | undefined) ?? 'top'

    const placed = placeMarkerLabel(side, obj.bboxMm, footprint, occupied)
    if (placed) {
      const markerObj: TactileObject = {
        id: `marker-${obj.id}`,
        role: 'marker',
        shape: 'marker-label',
        xMm: placed.xMm,
        yMm: placed.yMm,
        marker: labelText,
        bboxMm: placed.bboxMm,
        labelMethod: obj.labelMethod,
      }
      // Set lead-line target for lead-line labels
      if (obj.labelMethod === 'lead-line' && obj.bboxMm) {
        const cx = obj.bboxMm.x + obj.bboxMm.w / 2
        const cy = obj.bboxMm.y + obj.bboxMm.h / 2
        markerObj.leadLineTo = { xMm: cx, yMm: cy }
      }
      markers.push(markerObj)
      occupied.push(placed.bboxMm)
    }
  }

  return markers
}

// ── Key entry builder ─────────────────────────────────────────────────────────

function buildKeyEntry(marker: string, el: AdaptedDiagramElement): TactileKeyEntry {
  const rawText = elementLabel(el)
  const { normalized } = normalizeStemText(rawText)
  return { marker, elementId: el.id, text: rawText, normalizedText: normalized, heightMm: KEY_LINE_H }
}

// ── Grid position fallback ────────────────────────────────────────────────────

function gridPosMm(index: number, total: number, drawY: number, drawH: number): { xMm: number; yMm: number } {
  const cols = Math.min(4, Math.max(1, total))
  const col  = index % cols
  const row  = Math.floor(index / cols)
  const rows = Math.ceil(total / cols)
  return {
    xMm: DRAW_X + (col + 0.5) * (DRAW_W / cols),
    yMm: drawY + (row + 0.5) * (drawH / rows),
  }
}

// ── Topology detection ────────────────────────────────────────────────────────

function detectTopology(elements: AdaptedDiagramElement[], relationships: Relationship[]): 'series' | 'parallel' | 'unknown' {
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

function orderLoopComponents(elements: AdaptedDiagramElement[], relationships: Relationship[]): AdaptedDiagramElement[] {
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
  const ordered: AdaptedDiagramElement[] = []
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

type LoopPoint = { xMm: number; yMm: number; side: Dir }

function distributeOnLoop(
  n: number,
  loopL: number,
  loopT: number,
  loopR: number,
  loopB: number,
): LoopPoint[] {
  const W = loopR - loopL
  const H = loopB - loopT
  const safeT = W - 2 * CORNER_GUARD
  const safeR = H - 2 * CORNER_GUARD
  const safeB = W - 2 * CORNER_GUARD
  const safeL = H - 2 * CORNER_GUARD
  const total = safeT + safeR + safeB + safeL
  const spacing = total / n
  const points: LoopPoint[] = []

  for (let i = 0; i < n; i++) {
    let d = i * spacing + spacing / 2
    if (d < safeT) { points.push({ xMm: loopL + CORNER_GUARD + d, yMm: loopT, side: 'top' }); continue }
    d -= safeT
    if (d < safeR) { points.push({ xMm: loopR, yMm: loopT + CORNER_GUARD + d, side: 'right' }); continue }
    d -= safeR
    if (d < safeB) { points.push({ xMm: loopR - CORNER_GUARD - d, yMm: loopB, side: 'bottom' }); continue }
    d -= safeB
    points.push({ xMm: loopL, yMm: loopB - CORNER_GUARD - d, side: 'left' })
  }
  return points
}

// ── Wire segments for series loop ─────────────────────────────────────────────

type CompOnSide = { xMm: number; yMm: number; side: Dir; id: string }

function buildLoopWires(
  comps: CompOnSide[],
  loopL: number,
  loopT: number,
  loopR: number,
  loopB: number,
): TactileObject[] {
  const wires: TactileObject[] = []
  let wIdx = 0

  function addWire(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1)
    if (dx < 0.5 && dy < 0.5) return
    const pts = [{ xMm: x1, yMm: y1 }, { xMm: x2, yMm: y2 }]
    wires.push({
      id: `wire-${wIdx++}`,
      role: 'wire',
      shape: 'wire',
      xMm: x1,
      yMm: y1,
      points: pts,
      bboxMm: pathBbox(pts, 1),
    })
  }

  const top    = comps.filter(c => c.side === 'top').sort((a, b) => a.xMm - b.xMm)
  const right  = comps.filter(c => c.side === 'right').sort((a, b) => a.yMm - b.yMm)
  const bottom = comps.filter(c => c.side === 'bottom').sort((a, b) => b.xMm - a.xMm)
  const left   = comps.filter(c => c.side === 'left').sort((a, b) => b.yMm - a.yMm)

  let cur = loopL
  for (const c of top)    { addWire(cur, loopT, c.xMm - HALF_ALONG, loopT); cur = c.xMm + HALF_ALONG }
  addWire(cur, loopT, loopR, loopT)

  cur = loopT
  for (const c of right)  { addWire(loopR, cur, loopR, c.yMm - HALF_ALONG); cur = c.yMm + HALF_ALONG }
  addWire(loopR, cur, loopR, loopB)

  cur = loopR
  for (const c of bottom) { addWire(cur, loopB, c.xMm + HALF_ALONG, loopB); cur = c.xMm - HALF_ALONG }
  addWire(cur, loopB, loopL, loopB)

  cur = loopB
  for (const c of left)   { addWire(loopL, cur, loopL, c.yMm + HALF_ALONG); cur = c.yMm - HALF_ALONG }
  addWire(loopL, cur, loopL, loopT)

  return wires
}

// ── Layout: cyclic (loop perimeter) ───────────────────────────────────────────

function planCyclic(
  elements: AdaptedDiagramElement[],
  relationships: Relationship[],
  warnings: TactileValidationIssue[],
  { drawY, drawH }: DynLayout,
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const loopL = DRAW_X + 20
  const loopT = drawY + 10
  const loopR = DRAW_X + DRAW_W - 20
  const loopB = drawY + drawH - 10

  const meaningful = elements.filter(el => !isNoise(el.type))
  const topology = detectTopology(meaningful, relationships)
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  const transcriberNotes: string[] = []

  if (meaningful.length >= 2 && meaningful.length <= 12) {
    const ordered = orderLoopComponents(meaningful, relationships)
    const loopPoints = distributeOnLoop(ordered.length, loopL, loopT, loopR, loopB)

    const compsOnSide: CompOnSide[] = ordered.map((el, idx) => ({
      xMm: loopPoints[idx].xMm,
      yMm: loopPoints[idx].yMm,
      side: loopPoints[idx].side,
      id: el.id,
    }))
    const loopWires = buildLoopWires(compsOnSide, loopL, loopT, loopR, loopB)

    ordered.forEach((el, idx) => {
      const pt = loopPoints[idx]
      const marker = String(idx + 1)
      const label = elementLabel(el)
      const shape = resolveShape(el)

      const compObj: TactileObject = {
        id: `comp-${el.id}`,
        sourceElementId: el.id,
        role: 'component',
        shape,
        xMm: pt.xMm,
        yMm: pt.yMm,
        label,
        marker,
        markerSide: pt.side,
        labelMethod: el.labelMethod,
        bboxMm: undefined,
      }
      if (shape === 'bond-line') {
        const hint = normalizeSymbolHint(el.symbolHint ?? el.type ?? '')
        compObj.extra = { bondOrder: hint === 'bond-triple' ? 3 : hint === 'bond-double' ? 2 : 1 }
      }
      if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
      compObj.bboxMm = componentBboxMm(compObj)
      objects.push(compObj)
      key.push(buildKeyEntry(marker, el))
    })

    objects.push(...loopWires)
    transcriberNotes.push(
      'Diagram rearranged into a rectangle to make the cyclic connection easier to trace by touch. Follow the numbered components in order around the loop.'
    )
    return { layout: 'cyclic-loop', objects, connections: [], key, transcriberNotes }
  }

  if (topology === 'parallel') {
    warnings.push({
      severity: 'warning',
      code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE',
      message: 'Parallel topology detected. Layout approximated — verify with a sighted reviewer.',
    })
  }

  const positions = meaningful.map((el, idx) =>
    el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: drawY + el.position.y * drawH }
      : gridPosMm(idx, meaningful.length, drawY, drawH)
  )

  const connections: TactileConnection[] = []
  for (const rel of relationships) {
    const fi = meaningful.findIndex(e => e.id === rel.from)
    const ti = meaningful.findIndex(e => e.id === rel.to)
    if (fi < 0 || ti < 0) continue
    const fp = positions[fi], tp = positions[ti]
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  meaningful.forEach((el, idx) => {
    const pos = positions[idx]
    const marker = String(idx + 1)
    const shape = resolveShape(el)

    const compObj: TactileObject = {
      id: `comp-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape,
      xMm: pos.xMm,
      yMm: pos.yMm,
      label: elementLabel(el),
      marker,
      markerSide: 'top',
      labelMethod: el.labelMethod,
      bboxMm: undefined,
    }
    if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
    compObj.bboxMm = componentBboxMm(compObj)
    objects.push(compObj)
    key.push(buildKeyEntry(marker, el))
  })

  return { layout: 'cyclic-loop', objects, connections, key, transcriberNotes }
}

// ── Layout: axial (chart with axes) ──────────────────────────────────────────

function planAxial(
  elements: AdaptedDiagramElement[],
  { drawY, drawH }: DynLayout,
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  const axisX = DRAW_X + 15
  const axisY = drawY + drawH - 15
  const axisW = DRAW_W - 25
  const axisH = drawH - 25

  const axisYPts = [{ xMm: axisX, yMm: drawY + 5 }, { xMm: axisX, yMm: axisY }]
  const axisXPts = [{ xMm: axisX, yMm: axisY }, { xMm: axisX + axisW, yMm: axisY }]
  objects.push({ id: 'axis-y', role: 'wire', shape: 'axis', xMm: axisX, yMm: drawY + 5, points: axisYPts, bboxMm: pathBbox(axisYPts, 1) })
  objects.push({ id: 'axis-x', role: 'wire', shape: 'axis', xMm: axisX, yMm: axisY, points: axisXPts, bboxMm: pathBbox(axisXPts, 1) })

  const types = elements.map(e => e.type.toLowerCase())
  const isLine = types.some(t => t.includes('line') || t.includes('point') || t.includes('data'))
  const isPie  = types.some(t => t.includes('sector') || t.includes('slice') || t.includes('pie') || t.includes('segment'))

  if (isPie) {
    const cx = DRAW_X + DRAW_W / 2
    const cy = drawY + drawH / 2
    const r  = Math.min(DRAW_W, drawH) / 2 - 20
    const total = elements.reduce((s, e) => s + (parseFloat(e.value ?? '1') || 1), 0)
    let startAngle = -Math.PI / 2

    elements.forEach((el, idx) => {
      const frac  = (parseFloat(el.value ?? '1') || 1) / total
      const sweep = frac * 2 * Math.PI
      const end   = startAngle + sweep
      const mid   = startAngle + sweep / 2
      const marker = String(idx + 1)

      const deg = (mid * 180 / Math.PI + 360) % 360
      const markerSide: Dir = deg < 45 || deg >= 315 ? 'right' : deg < 135 ? 'bottom' : deg < 225 ? 'left' : 'top'

      const arcX = cx + Math.cos(mid) * r
      const arcY = cy + Math.sin(mid) * r
      const compBbox: Bbox = { x: arcX - 5, y: arcY - 5, w: 10, h: 10 }

      objects.push({
        id: `sector-${idx}`,
        role: 'component',
        shape: 'pie-sector',
        xMm: cx,
        yMm: cy,
        extra: { r, startAngle, endAngle: end, sweep },
        label: elementLabel(el),
        marker,
        markerSide,
        bboxMm: compBbox,
      })
      key.push(buildKeyEntry(marker, el))
      startAngle = end
    })

  } else if (isLine) {
    const vals = elements.map(e => parseFloat(e.value ?? '0') || 0)
    const maxV = Math.max(...vals, 1)
    const step = axisW / Math.max(elements.length - 1, 1)
    const pts  = elements.map((_, i) => ({ xMm: axisX + i * step, yMm: axisY - (vals[i] / maxV) * axisH }))

    objects.push({ id: 'line-chart', role: 'component', shape: 'line-chart', xMm: pts[0]?.xMm ?? axisX, yMm: pts[0]?.yMm ?? axisY, points: pts, bboxMm: pathBbox(pts, 2) })

    elements.forEach((el, i) => {
      const marker = String(i + 1)
      const compBbox: Bbox = { x: pts[i].xMm - 5, y: pts[i].yMm - 5, w: 10, h: 10 }
      objects.push({ id: `data-pt-${i}`, role: 'component', shape: 'anchor', xMm: pts[i].xMm, yMm: pts[i].yMm, label: elementLabel(el), marker, markerSide: 'bottom', bboxMm: compBbox })
      key.push(buildKeyEntry(marker, el))
    })

    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      const tickPts = [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }]
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: tickPts, bboxMm: pathBbox(tickPts, 1) })
    }

  } else {
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
        label: elementLabel(el),
        marker,
        markerSide: 'bottom',
        bboxMm: { x: bx, y: by, w: barW, h: barH },
      })
      key.push(buildKeyEntry(marker, el))
    })

    for (let t = 1; t <= 4; t++) {
      const ty = axisY - (t / 4) * axisH
      const tickPts = [{ xMm: axisX - 3, yMm: ty }, { xMm: axisX, yMm: ty }]
      objects.push({ id: `ytick-${t}`, role: 'wire', shape: 'axis', xMm: axisX - 3, yMm: ty, points: tickPts, bboxMm: pathBbox(tickPts, 1) })
    }
  }

  return { layout: 'axial-chart', objects, connections: [], key, transcriberNotes: [] }
}

// ── Layout: positional ────────────────────────────────────────────────────────

const DIRECTION_MAP: Record<string, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
  upward: [0, -1], downward: [0, 1],
}

function planPositional(
  elements: AdaptedDiagramElement[],
  relationships: Relationship[],
  { drawY, drawH }: DynLayout,
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  let markerIdx = 1

  const positions = new Map<string, { xMm: number; yMm: number }>()
  meaningful.forEach((el, i) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: drawY + el.position.y * drawH }
      : gridPosMm(i, meaningful.length, drawY, drawH)
    positions.set(el.id, pos)
  })

  meaningful.forEach(el => {
    const t = el.type.toLowerCase()
    const isArrow = el.visualShape === 'arrow' || el.componentShape === 'force-arrow-scaled' || t.includes('force') || t.includes('vector') || t.includes('arrow') || t.includes('ray')
    if (isArrow) return

    const pos = positions.get(el.id)!
    const marker = String(markerIdx++)
    const shape = resolveShape(el)

    const compObj: TactileObject = {
      id: `obj-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape,
      xMm: pos.xMm,
      yMm: pos.yMm,
      widthMm: 32,
      heightMm: 22,
      label: elementLabel(el),
      marker,
      markerSide: 'top',
      labelMethod: el.labelMethod,
      bboxMm: undefined,
    }
    if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
    compObj.bboxMm = componentBboxMm(compObj)
    objects.push(compObj)
    key.push(buildKeyEntry(marker, el))
  })

  for (const rel of relationships) {
    const from = positions.get(rel.from)
    if (!from) continue

    const dirKey = (rel.label ?? rel.type ?? '').toLowerCase().trim()
    const dir = DIRECTION_MAP[dirKey] ?? [1, 0]

    let ex: number, ey: number
    if (rel.waypoints && rel.waypoints.length > 0) {
      const last = rel.waypoints[rel.waypoints.length - 1]
      ex = DRAW_X + last.x * DRAW_W
      ey = drawY + last.y * drawH
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

    // Determine if force-arrow-scaled should be used
    const fromEl = meaningful.find(e => e.id === rel.from)
    const useScaledArrow = fromEl?.componentShape === 'force-arrow-scaled' || rel.type === 'force-arrow'

    const arrowPts = [{ xMm: from.xMm, yMm: from.yMm }, { xMm: ex, yMm: ey }]
    const arrowObj: TactileObject = {
      id: `arrow-${rel.from}-${rel.to}`,
      role: 'component',
      shape: useScaledArrow ? 'force-arrow-scaled' : 'arrow',
      xMm: from.xMm,
      yMm: from.yMm,
      points: arrowPts,
      label,
      marker,
      markerSide: 'right',
      bboxMm: pathBbox(arrowPts, 2),
    }
    if (useScaledArrow && forceEl) {
      const mag = parseFloat(forceEl.value ?? '50') || 50
      arrowObj.extra = { magnitude: mag, maxMagnitude: 100 }
    }
    objects.push(arrowObj)
    if (forceEl) key.push(buildKeyEntry(marker, forceEl))
  }

  return { layout: 'positional', objects, connections: [], key, transcriberNotes: [] }
}

// ── Layout: directional (flow / DAG) ─────────────────────────────────────────

function planDirectional(
  elements: AdaptedDiagramElement[],
  relationships: Relationship[],
  { drawY, drawH }: DynLayout,
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  const sorted = [...meaningful].sort((a, b) => (a.position?.x ?? 0.5) - (b.position?.x ?? 0.5))

  const posMap = new Map<string, { xMm: number; yMm: number }>()
  sorted.forEach((el, idx) => {
    const pos = el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: drawY + el.position.y * drawH }
      : gridPosMm(idx, sorted.length, drawY, drawH)
    posMap.set(el.id, pos)
  })

  const connections: TactileConnection[] = []
  for (const rel of relationships) {
    const fp = posMap.get(rel.from)
    const tp = posMap.get(rel.to)
    if (!fp || !tp) continue
    const path = rel.waypoints && rel.waypoints.length > 0
      ? [fp, ...rel.waypoints.map(w => ({ xMm: DRAW_X + w.x * DRAW_W, yMm: drawY + w.y * drawH })), tp]
      : [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp]
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path })
  }

  sorted.forEach((el, idx) => {
    const pos = posMap.get(el.id)!
    const marker = String(idx + 1)
    const shape = resolveShape(el)

    const compObj: TactileObject = {
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape,
      xMm: pos.xMm,
      yMm: pos.yMm,
      label: elementLabel(el),
      marker,
      markerSide: 'top',
      labelMethod: el.labelMethod,
      bboxMm: undefined,
    }
    if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
    compObj.bboxMm = componentBboxMm(compObj)
    objects.push(compObj)
    key.push(buildKeyEntry(marker, el))
  })

  return { layout: 'directional', objects, connections, key, transcriberNotes: [] }
}

// ── Layout: elkjs flow-sequence ───────────────────────────────────────────────

async function planFlowSequence(
  elements: AdaptedDiagramElement[],
  relationships: Relationship[],
  { drawY, drawH }: DynLayout,
): Promise<Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'>> {
  const meaningful = elements.filter(el => !isNoise(el.type))
  if (meaningful.length === 0) {
    return planDirectional(meaningful, relationships, { drawY, drawH })
  }

  const elk = new ELK()
  const NODE_W = 28
  const NODE_H = 14

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '8',
      'elk.layered.spacing.nodeNodeBetweenLayers': '15',
    },
    children: meaningful.map(el => ({ id: el.id, width: NODE_W, height: NODE_H })),
    edges: relationships
      .filter(r => meaningful.some(e => e.id === r.from) && meaningful.some(e => e.id === r.to))
      .map((rel, i) => ({ id: `e${i}`, sources: [rel.from], targets: [rel.to] })),
  }

  type LaidNode = { id: string; x?: number; y?: number; width?: number; height?: number }
  type LaidGraph = { children?: LaidNode[] }

  let laidChildren: LaidNode[]
  try {
    const result = await elk.layout(elkGraph) as LaidGraph
    laidChildren = result.children ?? []
  } catch {
    // Fallback to directional layout if elkjs fails
    return planDirectional(meaningful, relationships, { drawY, drawH })
  }

  // Scale elk coords to our drawing area
  const nodes = laidChildren
  const maxElkX = Math.max(...nodes.map(n => (n.x ?? 0) + NODE_W), 1)
  const maxElkY = Math.max(...nodes.map(n => (n.y ?? 0) + NODE_H), 1)
  const scaleX = DRAW_W / (maxElkX + 20)
  const scaleY = drawH / (maxElkY + 20)

  const posMap = new Map<string, { xMm: number; yMm: number }>()
  for (const node of nodes) {
    posMap.set(node.id, {
      xMm: DRAW_X + ((node.x ?? 0) + NODE_W / 2) * scaleX,
      yMm: drawY + ((node.y ?? 0) + NODE_H / 2) * scaleY,
    })
  }

  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []
  const connections: TactileConnection[] = []

  meaningful.forEach((el, idx) => {
    const pos = posMap.get(el.id) ?? gridPosMm(idx, meaningful.length, drawY, drawH)
    const marker = String(idx + 1)
    const shape = resolveShape(el)

    const compObj: TactileObject = {
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape,
      xMm: pos.xMm,
      yMm: pos.yMm,
      label: elementLabel(el),
      marker,
      markerSide: 'top',
      labelMethod: el.labelMethod,
      bboxMm: undefined,
    }
    if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
    compObj.bboxMm = componentBboxMm(compObj)
    objects.push(compObj)
    key.push(buildKeyEntry(marker, el))
  })

  for (const rel of relationships) {
    const fp = posMap.get(rel.from)
    const tp = posMap.get(rel.to)
    if (!fp || !tp) continue
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  return { layout: 'directional', objects, connections, key, transcriberNotes: [] }
}

// ── Layout: grid fallback ─────────────────────────────────────────────────────

function planGrid(
  elements: AdaptedDiagramElement[],
  relationships: Relationship[],
  { drawY, drawH }: DynLayout,
): Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'> {
  const meaningful = elements.filter(el => !isNoise(el.type))
  const objects: TactileObject[] = []
  const key: TactileKeyEntry[] = []

  const positions = meaningful.map((el, idx) =>
    el.position
      ? { xMm: DRAW_X + el.position.x * DRAW_W, yMm: drawY + el.position.y * drawH }
      : gridPosMm(idx, meaningful.length, drawY, drawH)
  )

  const connections: TactileConnection[] = []
  for (const rel of relationships) {
    const fi = meaningful.findIndex(e => e.id === rel.from)
    const ti = meaningful.findIndex(e => e.id === rel.to)
    if (fi < 0 || ti < 0) continue
    const fp = positions[fi], tp = positions[ti]
    connections.push({ from: rel.from, to: rel.to, directed: rel.directed, path: [fp, { xMm: tp.xMm, yMm: fp.yMm }, tp] })
  }

  meaningful.forEach((el, idx) => {
    const pos = positions[idx]
    const marker = String(idx + 1)
    const shape = resolveShape(el)

    const compObj: TactileObject = {
      id: `el-${el.id}`,
      sourceElementId: el.id,
      role: 'component',
      shape,
      xMm: pos.xMm,
      yMm: pos.yMm,
      label: elementLabel(el),
      marker,
      markerSide: 'top',
      labelMethod: el.labelMethod,
      bboxMm: undefined,
    }
    if (el.tactileSymbolRecipe) compObj.recipe = el.tactileSymbolRecipe
    compObj.bboxMm = componentBboxMm(compObj)
    objects.push(compObj)
    key.push(buildKeyEntry(marker, el))
  })

  return { layout: 'grid', objects, connections, key, transcriberNotes: [] }
}

// ── Strategy → layout inference ───────────────────────────────────────────────

function inferLayoutHint(domain: TactileDomain, strategy: TactileStrategy): 'cyclic' | 'axial' | 'positional' | 'directional' | 'none' {
  if (strategy === 'chart-reconstruction') return 'axial'
  if (strategy === 'flow-sequence') return 'directional'
  if (strategy === 'labelled-region-map' || strategy === 'simplified-spatial-diagram') return 'positional'
  if (strategy === 'fallback-locator-map') return 'none'
  // direct-symbol-diagram: use domain
  if (domain === 'circuit' || domain === 'process') return 'cyclic'
  if (domain === 'fbd' || domain === 'physics' || domain === 'geometry' || domain === 'anatomy' || domain === 'biology' || domain === 'spatial' || domain === 'map') return 'positional'
  return 'directional'
}

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
  objects: TactileObject[],
  key: TactileKeyEntry[],
  warnings: TactileValidationIssue[],
  layout: string,
  keyZone: ZoneRect,
) {
  const usedKeyH = key.reduce((s, e) => s + e.heightMm, 0)
  if (usedKeyH > keyZone.heightMm) {
    warnings.push({ severity: 'warning', code: 'TEXT_OVERFLOW', message: `Key requires ${usedKeyH.toFixed(0)}mm but only ${keyZone.heightMm.toFixed(0)}mm is available.` })
  }
  if (key.length === 0) {
    warnings.push({ severity: 'warning', code: 'NO_LEGEND', message: 'No key entries generated.' })
  }
  if (layout === 'cyclic-loop' && objects.filter(o => o.role === 'component').length === 0) {
    warnings.push({ severity: 'warning', code: 'NORMALIZED_LAYOUT_WITHOUT_NOTE', message: 'Cyclic layout used but no transcriber note was generated.' })
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function buildTactilePlan(pageSpec: TactilePageSpec): Promise<TactilePlan> {
  const warnings: TactileValidationIssue[] = [...(pageSpec.warnings?.map(w => ({ severity: 'warning' as const, code: 'UNKNOWN_SYMBOL' as const, message: w })) ?? [])]

  const { elements, relationships, domain, tactileStrategy, pageType } = pageSpec

  // 1. Compute title zone
  const { normalized: normTitle } = normalizeStemText(pageSpec.title)
  const actualTitleH = brailleFootprintMm(normTitle, PAGE_W - 2 * MARGIN).heightMm
  const titleH = Math.max(actualTitleH, LINE_H)
  const titleZone: ZoneRect = { xMm: MARGIN, yMm: MARGIN, widthMm: PAGE_W - 2 * MARGIN, heightMm: titleH + 4 }

  // 2. Compute instructions zone height
  const maxInstrLines = pageType === 'overview' ? INSTRUCTIONS_MAX_LINES_OVERVIEW : INSTRUCTIONS_MAX_LINES_SINGLE
  const instrH = maxInstrLines * LINE_H

  // 3. Compute key entries to derive key zone height
  const meaningful = elements.filter(el => !isNoise(el.type))
  const keyEntryHeights = meaningful.map((el, idx) => {
    const marker = String(idx + 1)
    const { normalized } = normalizeStemText(elementLabel(el))
    return brailleFootprintMm(`${marker} ${normalized}`, PAGE_W - 2 * MARGIN).heightMm
  })
  const keyH = Math.max(keyEntryHeights.reduce((s, h) => s + h, 0), LINE_H)

  // 4. Compute drawing area height
  const drawY = titleZone.yMm + titleZone.heightMm
  let drawH = PAGE_H - MARGIN - drawY - 5 - instrH - 5 - keyH
  if (drawH < 80) {
    warnings.push({ severity: 'warning', code: 'SYMBOL_TOO_DENSE', message: `Drawing area is only ${drawH.toFixed(0)}mm — diagram may be cramped.` })
    drawH = Math.max(drawH, 80)
  }

  const drawingArea: ZoneRect = { xMm: MARGIN, yMm: drawY, widthMm: DRAW_W, heightMm: drawH }
  const instructionsZone: ZoneRect = { xMm: MARGIN, yMm: drawY + drawH + 5, widthMm: DRAW_W, heightMm: instrH }
  const keyZone: ZoneRect = { xMm: MARGIN, yMm: instructionsZone.yMm + instrH + 5, widthMm: DRAW_W, heightMm: PAGE_H - MARGIN - (instructionsZone.yMm + instrH + 5) }

  // 5. Build initial occupied zones
  const initialOccupied: Bbox[] = [
    { x: 0, y: 0, w: PAGE_W, h: drawY },
    { x: 0, y: drawY + drawH, w: PAGE_W, h: PAGE_H - drawY - drawH },
    { x: 0, y: 0, w: MARGIN, h: PAGE_H },
    { x: PAGE_W - MARGIN, y: 0, w: MARGIN, h: PAGE_H },
  ]

  // 6. Call layout function based on strategy
  const layoutHint = inferLayoutHint(domain, tactileStrategy)
  const dynLayout: DynLayout = { drawY, drawH }

  let partial: Pick<TactilePlan, 'layout' | 'objects' | 'connections' | 'key' | 'transcriberNotes'>

  if (tactileStrategy === 'flow-sequence') {
    partial = await planFlowSequence(elements, relationships, dynLayout)
  } else {
    switch (layoutHint) {
      case 'cyclic':
        partial = planCyclic(elements, relationships, warnings, dynLayout)
        break
      case 'axial':
        partial = planAxial(elements, dynLayout)
        break
      case 'positional':
        partial = planPositional(elements, relationships, dynLayout)
        break
      case 'directional':
        partial = planDirectional(elements, relationships, dynLayout)
        break
      default:
        partial = planGrid(elements, relationships, dynLayout)
    }
  }

  // 7. Universal marker placement
  const markerObjects = placeAllMarkers(partial.objects, partial.connections, initialOccupied, PAGE_W, MARGIN)
  partial.objects.push(...markerObjects)

  // 8. Finalize key entry heights
  for (const entry of partial.key) {
    const lineText = `${entry.marker} ${entry.normalizedText}`
    entry.heightMm = brailleFootprintMm(lineText, PAGE_W - 2 * MARGIN).heightMm
  }

  const plan: TactilePlan = {
    page: { widthMm: PAGE_W, heightMm: PAGE_H, marginMm: MARGIN, orientation: 'portrait' },
    titleZone,
    drawingArea,
    instructionsZone,
    keyZone,
    layoutHint,
    layout: partial.layout,
    title: pageSpec.title,
    explorationInstructions: pageSpec.explorationInstructions,
    objects: partial.objects,
    connections: partial.connections,
    key: partial.key,
    transcriberNotes: partial.transcriberNotes,
    warnings,
  }

  validate(partial.objects, partial.key, warnings, partial.layout, keyZone)
  return plan
}

// Legacy constants still used by tests / renderer
export { KEY_LINE_H, MARGIN as TITLE_Y }
