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

// 1 CSS px = 1/96 inch; 1 mm = 1/25.4 inch → 1mm = 96/25.4 CSS px ≈ 3.779
const MM_TO_CSS_PX = 96 / 25.4

function normalizeSvgDimensions(svgEl: SVGSVGElement): { w: number; h: number } {
  const origW = svgEl.getAttribute('width') || ''
  const origH = svgEl.getAttribute('height') || ''
  const hasMm = origW.includes('mm') || origH.includes('mm')

  const vb = svgEl.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      let w = parts[2]
      let h = parts[3]
      // viewBox in mm-scale (e.g. 0 0 210 297) — scale to CSS px so content fills canvas
      if (hasMm && w <= 300) {
        w = Math.round(w * MM_TO_CSS_PX)
        h = Math.round(h * MM_TO_CSS_PX)
      }
      svgEl.setAttribute('width', String(w))
      svgEl.setAttribute('height', String(h))
      return { w, h }
    }
  }
  // No viewBox: convert mm numeric value to CSS px, or use raw number
  const rawW = parseFloat(origW) || 794
  const rawH = parseFloat(origH) || 1123
  if (hasMm && rawW <= 300) {
    const w = Math.round(rawW * MM_TO_CSS_PX)
    const h = Math.round(rawH * MM_TO_CSS_PX)
    svgEl.setAttribute('viewBox', `0 0 ${rawW} ${rawH}`)
    svgEl.setAttribute('width', String(w))
    svgEl.setAttribute('height', String(h))
    return { w, h }
  }
  return { w: rawW, h: rawH }
}

// Walk from clicked element up to the first direct child of the SVG root
function findSelectableAncestor(target: Element, svgEl: SVGSVGElement): SVGElement | null {
  let el: Element | null = target
  while (el && el !== svgEl) {
    if (el.parentNode === (svgEl as Node) && !NON_SELECTABLE.has(el.tagName.toLowerCase())) {
      return el as SVGElement
    }
    el = el.parentElement
  }
  return null
}

// Convert client coordinates to SVG user units
function clientToSvgCoords(
  clientX: number,
  clientY: number,
  svgEl: SVGSVGElement,
  svgW: number,
  svgH: number,
): { x: number; y: number } {
  const r = svgEl.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return { x: 0, y: 0 }
  return {
    x: (clientX - r.left) * (svgW / r.width),
    y: (clientY - r.top)  * (svgH / r.height),
  }
}

// Get rendered bounding box of any SVG element in SVG user units
function getRenderedBBox(el: SVGElement, svgEl: SVGSVGElement, svgW: number, svgH: number): BBox {
  const er = el.getBoundingClientRect()
  const sr = svgEl.getBoundingClientRect()
  if (sr.width === 0 || sr.height === 0) return { x: 0, y: 0, width: 0, height: 0 }
  const sx = svgW / sr.width
  const sy = svgH / sr.height
  return {
    x: (er.left - sr.left) * sx,
    y: (er.top  - sr.top)  * sy,
    width:  er.width  * sx,
    height: er.height * sy,
  }
}

// Bake a leading translate() into the element's native positional attributes.
// For element types that lack native x/y (path, g, etc.) the transform is kept.
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
      el.setAttribute('x', String(Math.round(parseFloat(el.getAttribute('x') || '0') + dx)))
      el.setAttribute('y', String(Math.round(parseFloat(el.getAttribute('y') || '0') + dy)))
      break
    case 'ellipse':
      el.setAttribute('cx', String(Math.round(parseFloat(el.getAttribute('cx') || '0') + dx)))
      el.setAttribute('cy', String(Math.round(parseFloat(el.getAttribute('cy') || '0') + dy)))
      break
    case 'circle':
      el.setAttribute('cx', String(Math.round(parseFloat(el.getAttribute('cx') || '0') + dx)))
      el.setAttribute('cy', String(Math.round(parseFloat(el.getAttribute('cy') || '0') + dy)))
      break
    case 'line':
      el.setAttribute('x1', String(Math.round(parseFloat(el.getAttribute('x1') || '0') + dx)))
      el.setAttribute('y1', String(Math.round(parseFloat(el.getAttribute('y1') || '0') + dy)))
      el.setAttribute('x2', String(Math.round(parseFloat(el.getAttribute('x2') || '0') + dx)))
      el.setAttribute('y2', String(Math.round(parseFloat(el.getAttribute('y2') || '0') + dy)))
      break
    case 'text':
      el.setAttribute('x', String(Math.round(parseFloat(el.getAttribute('x') || '0') + dx)))
      el.setAttribute('y', String(Math.round(parseFloat(el.getAttribute('y') || '0') + dy)))
      break
    default:
      return // keep transform for g, path, polygon, etc.
  }
  if (rest) el.setAttribute('transform', rest)
  else el.removeAttribute('transform')
}

function computeResizedBBox(pos: HandlePosition, init: BBox, dx: number, dy: number): BBox {
  const MIN = 10
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
  }
}

function applyResizeToDom(el: SVGElement, pos: HandlePosition, init: BBox, dx: number, dy: number): void {
  const nb = computeResizedBBox(pos, init, dx, dy)
  const tag = el.tagName.toLowerCase()
  if (tag === 'rect') {
    el.setAttribute('x', String(Math.round(nb.x)))
    el.setAttribute('y', String(Math.round(nb.y)))
    el.setAttribute('width', String(Math.round(nb.width)))
    el.setAttribute('height', String(Math.round(nb.height)))
    el.removeAttribute('transform')
  } else if (tag === 'ellipse') {
    el.setAttribute('cx', String(Math.round(nb.x + nb.width / 2)))
    el.setAttribute('cy', String(Math.round(nb.y + nb.height / 2)))
    el.setAttribute('rx', String(Math.round(nb.width / 2)))
    el.setAttribute('ry', String(Math.round(nb.height / 2)))
    el.removeAttribute('transform')
  } else if (tag === 'circle') {
    const r = Math.round(Math.min(nb.width, nb.height) / 2)
    el.setAttribute('cx', String(Math.round(nb.x + nb.width / 2)))
    el.setAttribute('cy', String(Math.round(nb.y + nb.height / 2)))
    el.setAttribute('r', String(r))
    el.removeAttribute('transform')
  } else {
    // path, g, polyline, etc.: use scale transform anchored at init origin
    if (init.width === 0 || init.height === 0) return
    const sx = nb.width  / init.width
    const sy = nb.height / init.height
    el.setAttribute('transform',
      `translate(${nb.x.toFixed(1)},${nb.y.toFixed(1)}) scale(${sx.toFixed(4)},${sy.toFixed(4)}) translate(${(-init.x).toFixed(1)},${(-init.y).toFixed(1)})`)
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
  activeTool: EditorTool
  isVisible: boolean
  onSelectionChange: (el: SVGElement | null, bbox: BBox | null) => void
  onHistoryChange: () => void
}

type DragState = {
  type: 'move' | 'resize'
  element: SVGElement
  startSvgX: number
  startSvgY: number
  baseTransform: string
  initialBBox: BBox
  handlePos?: HandlePosition
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SvgEditorCanvas = forwardRef<SvgEditorCanvasHandle, SvgEditorCanvasProps>(
  function SvgEditorCanvas({ svgString, activeTool, isVisible, onSelectionChange, onHistoryChange }, ref) {
    const wrapperRef    = useRef<HTMLDivElement>(null) // the injected SVG lives here
    const activeToolRef = useRef(activeTool)
    activeToolRef.current = activeTool

    const history = useSvgHistory()
    const [selection, setSelection] = useState<{ element: SVGElement; bbox: BBox } | null>(null)
    const selectionRef = useRef(selection)
    selectionRef.current = selection
    const [svgDims, setSvgDims] = useState({ w: 794, h: 1123 })
    const svgDimsRef = useRef(svgDims)
    svgDimsRef.current = svgDims

    const dragRef = useRef<DragState | null>(null)

    // ── Helpers ──────────────────────────────────────────────────────────────

    const getSvgEl = useCallback((): SVGSVGElement | null =>
      wrapperRef.current?.querySelector('svg') as SVGSVGElement | null, [])

    const toSvg = useCallback((cx: number, cy: number) => {
      const svgEl = getSvgEl()
      if (!svgEl) return { x: 0, y: 0 }
      return clientToSvgCoords(cx, cy, svgEl, svgDimsRef.current.w, svgDimsRef.current.h)
    }, [getSvgEl])

    const getBBox = useCallback((el: SVGElement): BBox => {
      const svgEl = getSvgEl()
      if (!svgEl) return { x: 0, y: 0, width: 0, height: 0 }
      return getRenderedBBox(el, svgEl, svgDimsRef.current.w, svgDimsRef.current.h)
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
        setSvgDims(dims)
        svgDimsRef.current = dims
      }
      history.reset(svgString)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!isVisible) return
        const isMeta = e.metaKey || e.ctrlKey
        const tag = (document.activeElement as HTMLElement)?.tagName

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
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'TEXTAREA') {
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
      bakeTranslate(selectable) // ensure any prior translate is absorbed first
      const bbox  = getBBox(selectable)
      const base  = selectable.getAttribute('transform') || ''
      selectable.setAttribute('data-base-transform', base)
      const svgPos = toSvg(e.clientX, e.clientY)
      dragRef.current = { type: 'move', element: selectable, startSvgX: svgPos.x, startSvgY: svgPos.y, baseTransform: base, initialBBox: bbox }
      setSelection({ element: selectable, bbox })
      onSelectionChange(selectable, bbox)
    }, [getSvgEl, getBBox, toSvg, onSelectionChange]) // eslint-disable-line react-hooks/exhaustive-deps

    function placeShape(tool: EditorTool, x: number, y: number, svgEl: SVGSVGElement) {
      if (tool === 'select') return
      const ns = 'http://www.w3.org/2000/svg'
      let newEl: SVGElement | null = null
      switch (tool) {
        case 'rect': {
          const el = document.createElementNS(ns, 'rect') as SVGRectElement
          el.setAttribute('x', String(Math.round(x - 40))); el.setAttribute('y', String(Math.round(y - 25)))
          el.setAttribute('width', '80'); el.setAttribute('height', '50')
          el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '2.5')
          newEl = el; break
        }
        case 'circle': {
          const el = document.createElementNS(ns, 'ellipse') as SVGEllipseElement
          el.setAttribute('cx', String(Math.round(x))); el.setAttribute('cy', String(Math.round(y)))
          el.setAttribute('rx', '30'); el.setAttribute('ry', '30')
          el.setAttribute('fill', 'none'); el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '2.5')
          newEl = el; break
        }
        case 'arrow': {
          const el = document.createElementNS(ns, 'line') as SVGLineElement
          el.setAttribute('x1', String(Math.round(x))); el.setAttribute('y1', String(Math.round(y)))
          el.setAttribute('x2', String(Math.round(x + 80))); el.setAttribute('y2', String(Math.round(y)))
          el.setAttribute('stroke', 'black'); el.setAttribute('stroke-width', '2.5')
          el.setAttribute('marker-end', 'url(#svg-editor-arrow)')
          ensureArrowMarker(svgEl)
          newEl = el; break
        }
        case 'text': {
          const el = document.createElementNS(ns, 'text') as SVGTextElement
          el.setAttribute('x', String(Math.round(x))); el.setAttribute('y', String(Math.round(y)))
          el.setAttribute('font-size', '14'); el.setAttribute('fill', 'black')
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
      }
    }

    // ── Resize start (from SelectionOverlay handles) ──────────────────────────

    const handleResizeStart = useCallback((pos: HandlePosition, clientX: number, clientY: number) => {
      const sel = selectionRef.current
      if (!sel) return
      const svgEl = getSvgEl()
      if (!svgEl) return
      // Bake any existing translate before resize so native attrs are clean
      bakeTranslate(sel.element)
      const freshBBox = getBBox(sel.element)
      const svgPos = toSvg(clientX, clientY)
      dragRef.current = {
        type: 'resize',
        element: sel.element,
        startSvgX: svgPos.x,
        startSvgY: svgPos.y,
        baseTransform: sel.element.getAttribute('transform') || '',
        initialBBox: freshBBox,
        handlePos: pos,
      }
    }, [getSvgEl, getBBox, toSvg])

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
          drag.element.setAttribute('transform', `translate(${dx.toFixed(1)},${dy.toFixed(1)})${t ? ' ' + t : ''}`)
        } else if (drag.type === 'resize' && drag.handlePos) {
          applyResizeToDom(drag.element, drag.handlePos, drag.initialBBox, dx, dy)
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
          setSvgDims(dims)
          svgDimsRef.current = dims
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
    }), [history, getSvgEl, getBBox, onSelectionChange, onHistoryChange, takeSnapshot])

    // ── Render ────────────────────────────────────────────────────────────────

    const { w, h } = svgDims

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
        <div style={{ position: 'relative', flexShrink: 0, boxShadow: '0 0 0 1px #23252a', background: '#ffffff', width: w, height: h }}>
          {/* Injected live SVG */}
          <div
            ref={wrapperRef}
            style={{ position: 'absolute', inset: 0, lineHeight: 0 }}
            onMouseDown={handleCanvasMouseDown}
          />
          {/* Selection overlay — handles only have pointer events */}
          {selection && (
            <SelectionOverlay
              bbox={selection.bbox}
              svgW={w}
              svgH={h}
              onResizeStart={handleResizeStart}
            />
          )}
        </div>
      </div>
    )
  }
)
