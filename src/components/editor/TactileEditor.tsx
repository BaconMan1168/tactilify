'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SvgEditorCanvas, type SvgEditorCanvasHandle } from './SvgEditorCanvas'
import { EditorToolbar, type EditorTool } from './EditorToolbar'
import { PageNav } from './PageNav'
import { PropertiesPanel, type PropertiesPanelHandle } from './PropertiesPanel'
import { AIFixPopover } from './AIFixPopover'
import type { BBox, PatternType } from '@/types/editor'
import { extractSpeechScript } from '@/lib/speechScript'
import { exportEditorPages } from '@/lib/editorPages'
import { renderBrailleGroupSvg, braillePreviewLines } from '@/lib/brailleGeometry'

interface TactileEditorProps {
  pages: string[]
  imageBase64?: string
  imageMimeType?: string
  onDone: (result: { pages: string[]; speechScript: string | null }) => void
  onCancel: () => void
}

export function TactileEditor({ pages, imageBase64, imageMimeType, onDone, onCancel }: TactileEditorProps) {
  const originalPages = useRef<string[]>([...pages])
  const [currentPage, setCurrentPage] = useState(0)
  const [activeTool, setActiveTool] = useState<EditorTool>('select')
  const [selectedElement, setSelectedElement] = useState<SVGElement | null>(null)
  const [selectionBbox, setSelectionBbox] = useState<BBox | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [dirtyPages, setDirtyPages] = useState<Set<number>>(new Set())

  const [aiAnchor, setAiAnchor] = useState<{ x: number; y: number; bbox: BBox } | null>(null)
  const [aiFixLoading, setAiFixLoading] = useState(false)
  const [brailleOrigin, setBrailleOrigin] = useState<{ x: number; y: number } | null>(null)
  const [brailleText, setBrailleText] = useState('')
  const braillePreview = braillePreviewLines(brailleText).join('\n')

  const canvasRefs = useRef<Array<SvgEditorCanvasHandle | null>>(pages.map(() => null))
  const propertiesPanelRef = useRef<PropertiesPanelHandle>(null)
  const currentPageRef = useRef(currentPage)
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  const activeCanvas = canvasRefs.current[currentPage]

  const syncHistoryState = useCallback(() => {
    const c = canvasRefs.current[currentPageRef.current]
    setCanUndo(c?.canUndo ?? false)
    setCanRedo(c?.canRedo ?? false)
    setDirtyPages(prev => {
      const next = new Set(prev)
      canvasRefs.current.forEach((canvas, i) => {
        if (canvas?.isDirty) next.add(i)
        else next.delete(i)
      })
      return next
    })
  }, [])

  useEffect(() => { syncHistoryState() }, [currentPage, syncHistoryState])

  const handleSelectionChange = useCallback((el: SVGElement | null, bbox: BBox | null) => {
    setSelectedElement(el)
    setSelectionBbox(bbox)
  }, [])

  const handleHistoryChange = useCallback(() => {
    syncHistoryState()
  }, [syncHistoryState])

  const handleRevert = useCallback(() => {
    canvasRefs.current.forEach((c, i) => {
      c?.revert(originalPages.current[i])
    })
    setDirtyPages(new Set())
    setSelectedElement(null)
    setSelectionBbox(null)
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  const handleDone = useCallback(() => {
    const exportedPages = exportEditorPages(pages, canvasRefs.current)
    const speechScript = exportedPages[0] ? extractSpeechScript(exportedPages[0]) : null
    onDone({ pages: exportedPages, speechScript })
  }, [pages, onDone])

  const handleAiRegionSelected = useCallback((bbox: BBox, anchorX: number, anchorY: number) => {
    setAiAnchor({ x: anchorX, y: anchorY, bbox })
  }, [])

  const handleAiFixDismiss = useCallback(() => {
    setAiAnchor(null)
    canvasRefs.current[currentPageRef.current]?.clearAiRegion()
    setActiveTool('select')
  }, [])

  const handleAiFixSubmit = useCallback(async (prompt: string) => {
    if (!aiAnchor || !imageBase64 || !imageMimeType) {
      toast.error('Original image not available for AI fix')
      return
    }
    setAiFixLoading(true)
    try {
      const canvas = canvasRefs.current[currentPageRef.current]
      const currentSvg = canvas?.exportSVG() ?? ''
      const res = await fetch('/api/region-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          svg: currentSvg,
          imageBase64,
          imageMimeType,
          bbox: aiAnchor.bbox,
          prompt,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Server error ${res.status}`)
      }
      const { svg } = (await res.json()) as { svg: string }
      canvas?.applySvgUpdate(svg)
      canvas?.clearAiRegion()
      setAiAnchor(null)
      setAiFixLoading(false)
      setActiveTool('select')
      syncHistoryState()
      toast.success('Region updated')
    } catch (err) {
      setAiFixLoading(false)
      toast.error(err instanceof Error ? err.message : 'AI fix failed')
    }
  }, [aiAnchor, imageBase64, imageMimeType, syncHistoryState])

  const handleBraillePlaceAt = useCallback((x: number, y: number) => {
    setBrailleOrigin({ x, y })
  }, [])

  const handleBraillePlace = useCallback((text: string) => {
    const canvas = canvasRefs.current[currentPageRef.current]
    if (!canvas || !brailleOrigin) return
    const { x, y } = brailleOrigin
    const maxW = Math.max(20, 210 - x - 5)
    const groupSvg = renderBrailleGroupSvg(text, x, y, maxW)
    canvas.insertBrailleGroup(groupSvg)
    setBrailleOrigin(null)
    syncHistoryState()
  }, [brailleOrigin, syncHistoryState])

  const handleBrailleUpdate = useCallback((text: string) => {
    if (!selectedElement) return
    const canvas = canvasRefs.current[currentPageRef.current]
    if (!canvas) return
    const trimmed = text.trim()
    if (!trimmed) return
    // Determine local-space origin from the group's circles
    let minCx = Infinity, minCy = Infinity
    selectedElement.querySelectorAll('circle').forEach(c => {
      const cx = parseFloat(c.getAttribute('cx') ?? 'NaN')
      const cy = parseFloat(c.getAttribute('cy') ?? 'NaN')
      if (!isNaN(cx)) minCx = Math.min(minCx, cx)
      if (!isNaN(cy)) minCy = Math.min(minCy, cy)
    })
    const x = isFinite(minCx) ? minCx : 0
    const y = isFinite(minCy) ? minCy : 0
    // Account for group translate transform when computing available width
    const t = selectedElement.getAttribute('transform') ?? ''
    const tm = /translate\(\s*([+-]?\d*\.?\d+)/.exec(t)
    const tx = tm ? parseFloat(tm[1]) : 0
    const maxW = Math.max(20, 210 - (x + tx) - 5)
    const newGroupSvg = renderBrailleGroupSvg(trimmed, x, y, maxW)
    const tmp = document.createElement('div')
    tmp.innerHTML = newGroupSvg
    const newGroup = tmp.firstElementChild
    if (!newGroup) return
    selectedElement.innerHTML = newGroup.innerHTML
    selectedElement.setAttribute('data-braille-source', trimmed)
    canvas.commitMutation()
  }, [selectedElement])

  // After placing a shape, auto-return to select so the user can move/resize it
  const handleShapePlaced = useCallback(() => {
    setActiveTool('select')
  }, [])

  // Double-clicking a text element focuses the text input in the properties panel
  const handleTextEditRequest = useCallback(() => {
    propertiesPanelRef.current?.focusTextInput()
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        key="tactile-editor"
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: '#010102' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Topbar */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: '#0f1011', borderBottom: '1px solid #23252a', height: 52 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            aria-label="Back to results without saving"
            style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6, cursor: 'pointer' }}
          >
            Back
          </Button>

          <span style={{ fontSize: 14, fontWeight: 500, color: '#f7f8f8', letterSpacing: '-0.2px' }}>
            Edit tactile diagram
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              aria-label="Revert all pages to original Claude output"
              style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3d44'; (e.currentTarget as HTMLButtonElement).style.color = '#c8ccd3' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#23252a'; (e.currentTarget as HTMLButtonElement).style.color = '#8a8f98' }}
            >
              Revert
            </Button>
            <Button
              size="sm"
              onClick={handleDone}
              aria-label="Save changes and return to results"
              style={{ background: '#5e6ad2', color: '#ffffff', fontSize: 13, borderRadius: 6, border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
            >
              Done
            </Button>
          </div>
        </div>

        {/* Body: toolbar + canvases + properties panel */}
        <div className="flex flex-1 overflow-hidden">
          <EditorToolbar
            activeTool={activeTool}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolChange={tool => { setActiveTool(tool); setSelectedElement(null); setSelectionBbox(null); setBrailleOrigin(null); if (tool !== 'braille') setBrailleText('') }}
            onUndo={() => activeCanvas?.undo()}
            onRedo={() => activeCanvas?.redo()}
            onDelete={() => activeCanvas?.deleteSelected()}
          />

          {/* Canvas area — all pages rendered, only current visible */}
          <div className="flex-1 flex overflow-hidden relative">
            {pages.map((svgString, i) => (
              <SvgEditorCanvas
                key={i}
                ref={el => { canvasRefs.current[i] = el }}
                svgString={svgString}
                pageIndex={i}
                activeTool={activeTool}
                isVisible={i === currentPage}
                onSelectionChange={handleSelectionChange}
                onHistoryChange={handleHistoryChange}
                onShapePlaced={handleShapePlaced}
                onTextEditRequest={handleTextEditRequest}
                onAiRegionSelected={handleAiRegionSelected}
                onBraillePlaceAt={handleBraillePlaceAt}
                brailleOrigin={activeTool === 'braille' ? brailleOrigin : null}
                braillePreview={braillePreview}
              />
            ))}
          </div>

          <PropertiesPanel
            ref={propertiesPanelRef}
            activeTool={activeTool}
            selectedElement={selectedElement}
            selectionBbox={selectionBbox}
            brailleOrigin={brailleOrigin}
            onCommit={() => activeCanvas?.commitMutation()}
            onDelete={() => activeCanvas?.deleteSelected()}
            onPatternChange={(type: PatternType) => activeCanvas?.applyPatternToSelected(type)}
            onBraillePlace={handleBraillePlace}
            onBrailleUpdate={handleBrailleUpdate}
            onBrailleTextChange={setBrailleText}
          />
        </div>

        {/* AI Fix popover — rendered fixed over the whole editor */}
        {aiAnchor && (
          <AIFixPopover
            anchorX={aiAnchor.x}
            anchorY={aiAnchor.y}
            status={aiFixLoading ? 'loading' : 'idle'}
            onFix={handleAiFixSubmit}
            onDismiss={handleAiFixDismiss}
          />
        )}

        <PageNav
          pages={pages}
          currentPage={currentPage}
          dirtyPages={dirtyPages}
          onPageChange={index => {
            setCurrentPage(index)
            setSelectedElement(null)
            setSelectionBbox(null)
          }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
