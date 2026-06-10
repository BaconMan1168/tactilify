'use client'
import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import { useSvgHistory } from '@/hooks/useSvgHistory'
import { exportSvgFromContainer } from '@/lib/svgDomExport'
import { SelectionOverlay, type HandlePosition } from './SelectionOverlay'
import type { BBox, PatternType } from '@/types/editor'
import type { EditorTool } from './EditorToolbar'

// Tags that cannot be independently selected
const NON_SELECTABLE = new Set([
  'svg', 'defs', 'pattern', 'lineargradient', 'radialgradient',
  'marker', 'symbol', 'clippath', 'mask', 'title', 'desc', 'style',
])

const PATTERN_CONTENT: Record<string, string> = {
  diagonal:  '<line x1="0" y1="0" x2="8" y2="8" stroke="#000" stroke-width="0.5"/>',
  horizontal:'<line x1="0" y1="4" x2="8" y2="4" stroke="#000" stroke-width="0.5"/>',
  vertical:  '<line x1="4" y1="0" x2="4" y2="8" stroke="#000" stroke-width="0.5"/>',
  crosshatch:'<line x1="0" y1="0" x2="8" y2="8" stroke="#000" stroke-width="0.5"/><line x1="8" y1="0" x2="0" y2="8" stroke="#000" stroke-width="0.5"/>',
}

// 1 CSS px = 1/96 inch; 1 mm = 1/25.4 inch → 1mm ≈ 3.779 CSS px
const MM_TO_CSS_PX = 96 / 25.4

function normalizeSvgDimensions(svgEl: SVGSVGElement): { cssW: number; cssH: number; vbW: number; vbH: number } {
  const origW = svgEl.getAttribute('width') || ''
  const origH = svgEl.getAttribute('height') || ''

  const vb = svgEl.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const vbW = parts[2]
      const vbH = parts[3]
      let cssW = vbW
      let cssH = vbH
      // All Tactilify SVGs use viewBox="0 0 210 297" (A4 mm). Scale to CSS px.
      if (vbW <= 300) {
        cssW = Math.round(vbW * MM_TO_CSS_PX)
        cssH = Math.round(vbH * MM_TO_CSS_PX)
      }
      svgEl.setAttribute('width', String(cssW))
      svgEl.setAttribute('height', String(cssH))
      return { cssW, cssH, vbW, vbH }
    }
  }
  // No viewBox: parse width/height (strip mm if present) and scale if in mm range
  const rawW = parseFloat(origW) || 794
  const rawH = parseFloat(origH) || 1123
  if (rawW <= 300) {
    const cssW = Math.round(rawW * MM_TO_CSS_PX)
    const cssH = Math.round(rawH * MM_TO_CSS_PX)
    svgEl.setAttribute('viewBox', `0 0 ${rawW} ${rawH}`)
    svgEl.setAttribute('width', String(cssW))
    svgEl.setAttribute('height', String(cssH))
    return { cssW, cssH, vbW: rawW, vbH: rawH }
  }
  return { cssW: rawW, cssH: rawH, vbW: rawW, vbH: rawH }
}

// Skip the full-page white background rect Claude always generates as first SVG child
function isPageBackgroundRect(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'rect') return false
  const x = parseFloat(el.getAttribute('x') || '0')
  const y = parseFloat(el.getAttribute('y') || '0')
  const w = parseFloat(el.getAttribute('width') || '0')
  const h = parseFloat(el.getAttribute('height') || '0')
  // Matches A4 in mm (210×297) or scaled CSS px (~794×1123) with some tolerance
  return x <= 1 && y <= 1 && w >= 200 && h >= 280
}

// Walk from clicked element up to the first direct child of the SVG root
function findSelectableAncestor(target: Element, svgEl: SVGSVGElement): SVGElement | null {
  let el: Element | null = target
  while (el && el !== svgEl) {
    if (el.parentNode === (svgEl as Node) && !NON_SELECTABLE.has(el.tagName.toLowerCase())) {
      if (isPageBackgroundRect(el)) return null
      return el as SVGElement
    }
    el = el.parentElement
  }
  return null
}

// Convert client coordinates to SVG user units (mm)
function clientToSvgCoords(
  clientX: number,
  clientY: number,
  svgEl: SVGSVGElement,
  vbW: number,
  vbH: number,
): { x: number; y: number } {
  const r = svgEl.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return { x: 0, y: 0 }
  return {
    x: (clientX - r.left) * (vbW / r.width),
    y: (clientY - r.top)  * (vbH / r.height),
  }
}

// Get rendered bounding box of any SVG element in SVG user units (mm)
function getRenderedBBox(el: SVGElement, svgEl: SVGSVGElement, vbW: number, vbH: number): BBox {
  const er = el.getBoundingClientRect()
  const sr = svgEl.getBoundingClientRect()
  if (sr.width === 0 || sr.height === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const sx = vbW / sr.width
  const sy = vbH / sr.height
  return {
    x: (er.left - sr.left) * sx,
    y: (er.top  - sr.top)  * sy,
    width:  er.width  * sx,
    height: er.height * sy,
  }
}

// Bake a leading translate() into the element's native positional attributes.
function bakeTranslate(el: SVGElement): void {
  const t = el.getAttribute('transform') || ''
  const m = /^translate\(\s*([+-]?\d*\.?\d+)\s*[,\s]\s*([+-]?\d*\.?\d+)\s*\)(.*)/i.exec(t.trim())
  if (!m) return
  const dx = parseFloat(m[1])
  const dy = parseFloat(m[2])
  const rest = m[3].trim()
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'rect':
      el.setAttribute('x', String((parseFloat(el.getAttribute('x') || '0') + dx).toFixed(2)))
      el.setAttribute('y', String((parseFloat(el.getAttribute('y') || '0') + dy).toFixed(2)))
      break
    case 'ellipse':
      el.setAttribute('cx', String((parseFloat(el.getAttribute('cx') || '0') + dx).toFixed(2)))
      el.setAttribute('cy', String((parseFloat(el.getAttribute('cy') || '0') + dy).toFixed(2)))
      break
    case 'circle':
      el.setAttribute('cx', String((parseFloat(el.getAttribute('cx') || '0') + dx).toFixed(2)))
      el.setAttribute('cy', String((parseFloat(el.getAttribute('cy') || '0') + dy).toFixed(2)))
      break
    case 'line':
      el.setAttribute('x1', String((parseFloat(el.getAttribute('x1') || '0') + dx).toFixed(2)))
      el.setAttribute('y1', String((parseFloat(el.getAttribute('y1') || '0') + dy).toFixed(2)))
      el.setAttribute('x2', String((parseFloat(el.getAttribute('x2') || '0') + dx).toFixed(2)))
      el.setAttribute('y2', String((parseFloat(el.getAttribute('y2') || '0') + dy).toFixed(2)))
      break
    case 'text':
      el.setAttribute('x', String((parseFloat(el.getAttribute('x') || '0') + dx).toFixed(2)))
      el.setAttribute('y', String((parseFloat(el.getAttribute('y') || '0') + dy).toFixed(2)))
      break
    default:
      return // keep transform for g, path, polygon, etc.
  }
  if (rest) el.setAttribute('transform', rest)
  else el.removeAttribute('transform')
}

// Constrain dx/dy to preserve initial aspect ratio for corner handles (shift-drag)
function constrainAspect(pos: HandlePosition, dx: number, dy: number, init: BBox): { dx: number; dy: number } {
  if (!['nw', 'ne', 'sw', 'se'].includes(pos)) return { dx, dy }
  // Sign maps: how dx/dy map to "growing" in each direction
  const sx = (pos === 'nw' || pos === 'sw') ? -1 : 1  // left handles: negative dx = grow
  const sy = (pos === 'nw' || pos === 'ne') ? -1 : 1  // top handles: negative dy = grow
  const growX = dx * sx   // positive = element growing wider
  const growY = dy * sy   // positive = element growing taller
  // Use whichever axis has the larger relative change to drive uniform scale
  const relX = Math.abs(growX) / (init.width  || 1)
  const relY = Math.abs(growY) / (init.height || 1)
  const dSize = relX >= relY
    ? growX / (init.width  || 1)
    : growY / (init.height || 1)
  const newW = Math.max(1, init.width  * (1 + dSize))
  const newH = Math.max(1, init.height * (1 + dSize))
  return {
    dx: (newW - init.width)  * sx,
    dy: (newH - init.height) * sy,
  }
}

function computeResizedBBox(pos: HandlePosition, init: BBox, dx: number, dy: number): BBox {
  const MIN = 2 // min size in mm
  const { x, y, width: w, height: h } = init
  switch (pos) {
    case 'se': return { x, y, width: Math.max(MIN, w + dx), height: Math.max(MIN, h + dy) }
    case 'sw': { const nw = Math.max(MIN, w - dx); return { x: x + w - nw, y, width: nw, height: Math.max(MIN, h + dy) } }
    case 'ne': { const nh = Math.max(MIN, h - dy); return { x, y: y + h - nh, width: Math.max(MIN, w + dx), height: nh } }
    case 'nw': { const nw = Math.max(MIN, w - dx); const nh = Math.max(MIN, h - dy); return { x: x + w - nw, y: y + h - nh, width: nw, height: nh } }
    case 'e':  return { x, y, width: Math.max(MIN, w + dx), height: h }
    case 'w':  { const nw = Math.max(MIN, w - dx); return { x: x + w - nw, y, width: nw, height: h } }
    case 's':  return { x, y, width: w, height: Math.max(MIN, h + dy) }
    case 'n':  { const nh = Math.max(MIN, h - dy); return { x, y: y + h - nh, width: w, height: nh } }
    default:   return init
  }
}

function applyResizeToDom(el: SVGElement, pos: HandlePosition, init: BBox, dx: number, dy: number, constrain: boolean): void {
  if (pos === 'p1' || pos === 'p2') return // handled separately
  const { dx: cdx, dy: cdy } = constrain ? constrainAspect(pos, dx, dy, init) : { dx, dy }
  const nb = computeResizedBBox(pos, init, cdx, cdy)
  const tag = el.tagName.toLowerCase()
  if (tag === 'rect') {
    el.setAttribute('x', nb.x.toFixed(2))
    el.setAttribute('y', nb.y.toFixed(2))
    el.setAttribute('width', nb.width.toFixed(2))
    el.setAttribute('height', nb.height.toFixed(2))
    el.removeAttribute('transform')
  } else if (tag === 'ellipse') {
    el.setAttribute('cx', (nb.x + nb.width / 2).toFixed(2))
    el.setAttribute('cy', (nb.y + nb.height / 2).toFixed(2))
    el.setAttribute('rx', (nb.width / 2).toFixed(2))
    el.setAttribute('ry', (nb.height / 2).toFixed(2))
    el.removeAttribute('transform')
  } else if (tag === 'circle') {
    const r = Math.min(nb.width, nb.height) / 2
    el.setAttribute('cx', (nb.x + nb.width / 2).toFixed(2))
    el.setAttribute('cy', (nb.y + nb.height / 2).toFixed(2))
    el.setAttribute('r', r.toFixed(2))
    el.removeAttribute('transform')
  } else {
    // path, g, polyline, etc.: use scale transform anchored at init origin
    if (init.width === 0 || init.height === 0) return
    const sx = nb.width  / init.width
    const sy = nb.height / init.height
    el.setAttribute('transform',
      `translate(${nb.x.toFixed(2)},${nb.y.toFixed(2)}) scale(${sx.toFixed(4)},${sy.toFixed(4)}) translate(${(-init.x).toFixed(2)},${(-init.y).toFixed(2)})`)
  }
}

function ensureArrowMarker(svgEl: SVGSVGElement): void {
  if (svgEl.querySelector('#svg-editor-arrow')) return
  let defs = svgEl.querySelector('defs') as SVGDefsElement | null
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement
    svgEl.insertBefore(defs, svgEl.firstChild)
  }
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
  marker.setAttribute('id', 'svg-editor-arrow')
  marker.setAttribute('markerWidth', '10')
  marker.setAttribute('markerHeight', '7')
  marker.setAttribute('refX', '9')
  marker.setAttribute('refY', '3.5')
  marker.setAttribute('orient', 'auto')
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  poly.setAttribute('points', '0 0, 10 3.5, 0 7')
  poly.setAttribute('fill', 'black')
  marker.appendChild(poly)
  defs.appendChild(marker)
}

function ensurePatternDef(svgEl: SVGSVGElement, type: PatternType): void {
  if (type === 'none') return
  const id = `pattern-${type}`
  if (svgEl.querySelector(`#${id}`)) return
  let defs = svgEl.querySelector('defs') as SVGDefsElement | null
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs') as SVGDefsElement
    svgEl.insertBefore(defs, svgEl.firstChild)
  }
  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
  pat.setAttribute('id', id)
  pat.setAttribute('patternUnits', 'userSpaceOnUse')
  pat.setAttribute('width', '8')
  pat.setAttribute('height', '8')
  pat.innerHTML = PATTERN_CONTENT[type] ?? ''
  defs.appendChild(pat)
}

// Prefix all pattern IDs in this SVG's defs to prevent cross-page collisions in the HTML document.
function scopePatternIds(svgEl: SVGSVGElement, pageIndex: number): void {
  const prefix = `pg${pageIndex}-`
  const renames = new Map<string, string>()
  svgEl.querySelectorAll('defs pattern[id]').forEach(p => {
    const oldId = p.getAttribute('id')!
    if (oldId.startsWith(prefix)) return // already scoped
    const newId = prefix + oldId
    p.setAttribute('id', newId)
    renames.set(oldId, newId)
  })
  if (!renames.size) return
  svgEl.querySelectorAll('[fill]').forEach(el => {
    const fill = el.getAttribute('fill')!
    const m = /^url\(#(.+)\)$/.exec(fill)
    if (m && renames.has(m[1])) {
      el.setAttribute('fill', `url(#${renames.get(m[1])})`)
    }
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SvgEditorCanvasHandle {
  exportSVG: () => string
  revert: (svgString: string) => void
  deleteSelected: () => void
  applyPatternToSelected: (type: PatternType) => void
  commitMutation: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

interface SvgEditorCanvasProps {
  svgString: string
  pageIndex: number
  activeTool: EditorTool
  isVisible: boolean
  onSelectionChange: (el: SVGElement | null, bbox: BBox | null) => void
  onHistoryChange: () => void
  onShapePlaced?: () => void
  onTextEditRequest?: () => void
}

type LineCoords = { x1: number; y1: number; x2: number; y2: number }

type DragState = {
  type: 'move' | 'resize'
  element: SVGElement
  startSvgX: number
  startSvgY: number
  baseTransform: string
  initialBBox: BBox
  handlePos?: HandlePosition
  lineEndpoints?: LineCoords
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SvgEditorCanvas = forwardRef<SvgEditorCanvasHandle, SvgEditorCanvasProps>(
  function SvgEditorCanvas({ svgString, pageIndex, activeTool, isVisible, onSelectionChange, onHistoryChange, onShapePlaced, onTextEditRequest }, ref) {
    const wrapperRef    = useRef<HTMLDivElement>(null)
    const activeToolRef = useRef(activeTool)
    activeToolRef.current = activeTool

    const history = useSvgHistory()
    const [selection, setSelection] = useState<{ element: SVGElement; bbox: BBox } | null>(null)
    const selectionRef = useRef(selection)
    selectionRef.current = selection

    // CSS pixel dims (for the container div and overlay physical size)
    const [svgCss, setSvgCss] = useState({ w: 794, h: 1123 })
    // ViewBox dims in SVG user units (mm) — used for all coordinate math
    const [svgVb, setSvgVb] = useState({ w: 210, h: 297 })
    const svgVbRef = useRef({ w: 210, h: 297 })

    const dragRef = useRef<DragState | null>(null)

    // ── Helpers ──────────────────────────────────────────────────────────────

    const getSvgEl = useCallback((): SVGSVGElement | null =>
      wrapperRef.current?.querySelector('svg') as SVGSVGElement | null, [])

    const toSvg = useCallback((cx: number, cy: number) => {
      const svgEl = getSvgEl()
      if (!svgEl) return { x: 0, y: 0 }
      return clientToSvgCoords(cx, cy, svgEl, svgVbRef.current.w, svgVbRef.current.h)
    }, [getSvgEl])

    const getBBox = useCallback((el: SVGElement): BBox => {
      const svgEl = getSvgEl()
      if (!svgEl) return { x: 0, y: 0, width: 0, height: 0 }
      return getRenderedBBox(el, svgEl, svgVbRef.current.w, svgVbRef.current.h)
    }, [getSvgEl])

    const selectEl = useCallback((el: SVGElement | null) => {
      if (!el) {
        setSelection(null)
        onSelectionChange(null, null)
        return
      }
      const bbox = getBBox(el)
      setSelection({ element: el, bbox })
      onSelectionChange(el, bbox)
    }, [getBBox, onSelectionChange])

    const takeSnapshot = useCallback(() => {
      const w = wrapperRef.current
      if (w) history.commitMutation(w)
      onHistoryChange()
    }, [history, onHistoryChange])

    // ── Inject SVG on mount ───────────────────────────────────────────────────

    useEffect(() => {
      const w = wrapperRef.current
      if (!w) return
      w.innerHTML = svgString
      const svgEl = getSvgEl()
      if (svgEl) {
        const dims = normalizeSvgDimensions(svgEl)
        setSvgCss({ w: dims.cssW, h: dims.cssH })
        setSvgVb({ w: dims.vbW, h: dims.vbH })
        svgVbRef.current = { w: dims.vbW, h: dims.vbH }
        scopePatternIds(svgEl, pageIndex)
      }
      history.reset(svgString)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!isVisible) return
        const isMeta = e.metaKey || e.ctrlKey
        // Don't fire editor shortcuts when user is typing in an input / textarea
        const active = document.activeElement as HTMLElement | null
        const inField = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable

        if (isMeta && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
          e.preventDefault()
          const next = history.redo()
          if (next && wrapperRef.current) {
            wrapperRef.current.innerHTML = next
            setSelection(null); onSelectionChange(null, null); onHistoryChange()
          }
        } else if (isMeta && e.key === 'z') {
          e.preventDefault()
          const prev = history.undo()
          if (prev && wrapperRef.current) {
            wrapperRef.current.innerHTML = prev
            setSelection(null); onSelectionChange(null, null); onHistoryChange()
          }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
          const sel = selectionRef.current
          if (sel) {
            sel.element.remove()
            setSelection(null); onSelectionChange(null, null)
            takeSnapshot()
          }
        } else if (e.key === 'Escape') {
          setSelection(null); onSelectionChange(null, null)
        }
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [isVisible, history, onSelectionChange, onHistoryChange, takeSnapshot])

    // ── Canvas mouse down ─────────────────────────────────────────────────────

    const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const svgEl = getSvgEl()
      if (!svgEl) return
      const tool = activeToolRef.current

      if (tool !== 'select') {
        const pos = toSvg(e.clientX, e.clientY)
        placeShape(tool, pos.x, pos.y, svgEl)
        return
      }

      const selectable = findSelectableAncestor(e.target as Element, svgEl)
      if (!selectable) {
        setSelection(null); onSelectionChange(null, null)
        return
      }

      // Start move drag
      bakeTranslate(selectable)
      const bbox  = getBBox(selectable)
      const base  = selectable.getAttribute('transform') || ''
      selectable.setAttribute('data-base-transform', base)
      const svgPos = toSvg(e.clientX, e.clientY)
      dragRef.current = { type: 'move', element: selectable, startSvgX: svgPos.x, startSvgY: svgPos.y, baseTransform: base, initialBBox: bbox }
      setSelection({ element: selectable, bbox })
      onSelectionChange(selectable, bbox)
    }, [getSvgEl, getBBox, toSvg, onSelectionChange]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Double-click: enter text edit mode ───────────────────────────────────

    const handleCanvasDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      const svgEl = getSvgEl()
      if (!svgEl) return
      const selectable = findSelectableAncestor(e.target as Element, svgEl)
      if (!selectable) return
      if (selectable.tagName.toLowerCase() === 'text') {
        onTextEditRequest?.()
      }
    }, [getSvgEl, onTextEditRequest])

    function placeShape(tool: EditorTool, x: number, y: number, svgEl: SVGSVGElement) {
      if (tool === 'select') return
      const ns = 'http://www.w3.org/2000/svg'
      let newEl: SVGElement | null = null
      switch (tool) {
        case 'rect': {
          const el = document.createElementNS(ns, 'rect') as SVGRectElement
          el.setAttribute('x', (x - 15).toFixed(2)); el.setAttribute('y', (y - 10).toFixed(2))
          el.setAttribute('width', '30'); el.setAttribute('height', '20')
          el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '0.7')
          newEl = el; break
        }
        case 'circle': {
          const el = document.createElementNS(ns, 'ellipse') as SVGEllipseElement
          el.setAttribute('cx', x.toFixed(2)); el.setAttribute('cy', y.toFixed(2))
          el.setAttribute('rx', '15'); el.setAttribute('ry', '15')
          el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '0.7')
          newEl = el; break
        }
        case 'arrow': {
          const el = document.createElementNS(ns, 'line') as SVGLineElement
          el.setAttribute('x1', x.toFixed(2)); el.setAttribute('y1', y.toFixed(2))
          el.setAttribute('x2', (x + 30).toFixed(2)); el.setAttribute('y2', y.toFixed(2))
          el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '0.7')
          el.setAttribute('marker-end', 'url(#svg-editor-arrow)')
          ensureArrowMarker(svgEl)
          newEl = el; break
        }
        case 'line': {
          const el = document.createElementNS(ns, 'line') as SVGLineElement
          el.setAttribute('x1', x.toFixed(2)); el.setAttribute('y1', y.toFixed(2))
          el.setAttribute('x2', (x + 30).toFixed(2)); el.setAttribute('y2', y.toFixed(2))
          el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '0.7')
          newEl = el; break
        }
        case 'text': {
          const el = document.createElementNS(ns, 'text') as SVGTextElement
          el.setAttribute('x', x.toFixed(2)); el.setAttribute('y', y.toFixed(2))
          el.setAttribute('font-size', '5'); el.setAttribute('fill', 'black')
          el.textContent = 'Label'
          newEl = el; break
        }
      }
      if (newEl) {
        svgEl.appendChild(newEl)
        const bbox = getBBox(newEl)
        setSelection({ element: newEl, bbox })
        onSelectionChange(newEl, bbox)
        takeSnapshot()
        // Return to select mode so the next click moves rather than creates
        onShapePlaced?.()
      }
    }

    // ── Resize start (from SelectionOverlay handles) ──────────────────────────

    const handleResizeStart = useCallback((pos: HandlePosition, clientX: number, clientY: number) => {
      const sel = selectionRef.current
      if (!sel) return
      bakeTranslate(sel.element)
      const freshBBox = getBBox(sel.element)
      const svgPos = toSvg(clientX, clientY)

      // For line endpoint handles, capture initial endpoint coords
    let lineEndpoints: LineCoords | undefined
      if (pos === 'p1' || pos === 'p2') {
        const el = sel.element
        lineEndpoints = {
          x1: parseFloat(el.getAttribute('x1') || '0'),
          y1: parseFloat(el.getAttribute('y1') || '0'),
          x2: parseFloat(el.getAttribute('x2') || '0'),
          y2: parseFloat(el.getAttribute('y2') || '0'),
        }
      }

      dragRef.current = {
        type: 'resize',
        element: sel.element,
        startSvgX: svgPos.x,
        startSvgY: svgPos.y,
        baseTransform: sel.element.getAttribute('transform') || '',
        initialBBox: freshBBox,
        handlePos: pos,
        lineEndpoints,
      }
    }, [getBBox, toSvg])

    // ── Global mouse move / up ────────────────────────────────────────────────

    useEffect(() => {
      const onMove = (e: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const svgPos = toSvg(e.clientX, e.clientY)
        const dx = svgPos.x - drag.startSvgX
        const dy = svgPos.y - drag.startSvgY

        if (drag.type === 'move') {
          const t = drag.baseTransform
          drag.element.setAttribute('transform', `translate(${dx.toFixed(2)},${dy.toFixed(2)})${t ? ' ' + t : ''}`)
        } else if (drag.type === 'resize' && drag.handlePos) {
          if ((drag.handlePos === 'p1' || drag.handlePos === 'p2') && drag.lineEndpoints) {
            // Move individual line endpoint
            if (drag.handlePos === 'p1') {
              drag.element.setAttribute('x1', (drag.lineEndpoints.x1 + dx).toFixed(2))
              drag.element.setAttribute('y1', (drag.lineEndpoints.y1 + dy).toFixed(2))
            } else {
              drag.element.setAttribute('x2', (drag.lineEndpoints.x2 + dx).toFixed(2))
              drag.element.setAttribute('y2', (drag.lineEndpoints.y2 + dy).toFixed(2))
            }
          } else {
            applyResizeToDom(drag.element, drag.handlePos, drag.initialBBox, dx, dy, e.shiftKey)
          }
        }

        const bbox = getBBox(drag.element)
        setSelection({ element: drag.element, bbox })
      }

      const onUp = () => {
        const drag = dragRef.current
        if (!drag) return
        if (drag.type === 'move') {
          bakeTranslate(drag.element)
          drag.element.removeAttribute('data-base-transform')
        }
        dragRef.current = null
        const bbox = getBBox(drag.element)
        setSelection(prev => prev ? { ...prev, bbox } : null)
        takeSnapshot()
        onHistoryChange()
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
    }, [toSvg, getBBox, takeSnapshot, onHistoryChange])

    // ── Imperative handle ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      exportSVG: () => {
        const w = wrapperRef.current
        return w ? exportSvgFromContainer(w) : ''
      },
      revert: (newSvg: string) => {
        const w = wrapperRef.current
        if (!w) return
        w.innerHTML = newSvg
        const svgEl = getSvgEl()
        if (svgEl) {
          const dims = normalizeSvgDimensions(svgEl)
          setSvgCss({ w: dims.cssW, h: dims.cssH })
          setSvgVb({ w: dims.vbW, h: dims.vbH })
          svgVbRef.current = { w: dims.vbW, h: dims.vbH }
          scopePatternIds(svgEl, pageIndex)
        }
        history.reset(newSvg)
        setSelection(null); onSelectionChange(null, null); onHistoryChange()
      },
      deleteSelected: () => {
        const sel = selectionRef.current
        if (!sel) return
        sel.element.remove()
        setSelection(null); onSelectionChange(null, null)
        takeSnapshot()
      },
      applyPatternToSelected: (type: PatternType) => {
        const sel = selectionRef.current
        const svgEl = getSvgEl()
        if (!sel || !svgEl) return
        if (type === 'none') {
          sel.element.setAttribute('fill', 'none')
          sel.element.removeAttribute('data-pattern-type')
        } else {
          ensurePatternDef(svgEl, type)
          sel.element.setAttribute('fill', `url(#pattern-${type})`)
          sel.element.setAttribute('data-pattern-type', type)
        }
        takeSnapshot()
      },
      commitMutation: () => {
        const sel = selectionRef.current
        const w = wrapperRef.current
        if (!w) return
        if (sel) {
          const bbox = getBBox(sel.element)
          setSelection({ element: sel.element, bbox })
          onSelectionChange(sel.element, bbox)
        }
        history.commitMutation(w)
        onHistoryChange()
      },
      undo: () => {
        const prev = history.undo()
        if (prev && wrapperRef.current) {
          wrapperRef.current.innerHTML = prev
          setSelection(null); onSelectionChange(null, null); onHistoryChange()
        }
      },
      redo: () => {
        const next = history.redo()
        if (next && wrapperRef.current) {
          wrapperRef.current.innerHTML = next
          setSelection(null); onSelectionChange(null, null); onHistoryChange()
        }
      },
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      get isDirty() { return history.isDirty },
    }), [history, getSvgEl, getBBox, onSelectionChange, onHistoryChange, takeSnapshot, pageIndex])

    // ── Render ────────────────────────────────────────────────────────────────

    // Compute line endpoint coords for the overlay (read live from DOM for freshness)
    const selectedTag = selection?.element.tagName.toLowerCase()
    const lineCoords: LineCoords | undefined =
      selectedTag === 'line' ? {
        x1: parseFloat(selection!.element.getAttribute('x1') || '0'),
        y1: parseFloat(selection!.element.getAttribute('y1') || '0'),
        x2: parseFloat(selection!.element.getAttribute('x2') || '0'),
        y2: parseFloat(selection!.element.getAttribute('y2') || '0'),
      } : undefined

    return (
      <div
        style={{
          display: isVisible ? 'flex' : 'none',
          flex: 1,
          overflow: 'auto',
          background: '#010102',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 24,
        }}
        role="application"
        aria-label="Tactile diagram editor"
      >
        <div style={{ position: 'relative', flexShrink: 0, boxShadow: '0 0 0 1px #23252a', background: '#ffffff', width: svgCss.w, height: svgCss.h }}>
          {/* Injected live SVG */}
          <div
            ref={wrapperRef}
            style={{ position: 'absolute', inset: 0, lineHeight: 0 }}
            onMouseDown={handleCanvasMouseDown}
            onDoubleClick={handleCanvasDblClick}
          />
          {/* Selection overlay — handles only have pointer events */}
          {selection && (
            <SelectionOverlay
              bbox={selection.bbox}
              cssW={svgCss.w}
              cssH={svgCss.h}
              vbW={svgVb.w}
              vbH={svgVb.h}
              onResizeStart={handleResizeStart}
              lineCoords={lineCoords}
            />
          )}
        </div>
      </div>
    )
  }
)
