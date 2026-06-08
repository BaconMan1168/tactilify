'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { EditorCanvas, type EditorCanvasHandle } from './EditorCanvas'
import { EditorToolbar, type EditorTool } from './EditorToolbar'
import { PageNav } from './PageNav'
import { PropertiesPanel } from './PropertiesPanel'
import type * as FabricType from 'fabric'
import type { PatternType } from '@/lib/patternAdapter'
import { extractSpeechScript } from '@/lib/speechScript'

interface TactileEditorProps {
  pages: string[]
  onDone: (result: { pages: string[]; speechScript: string | null }) => void
  onCancel: () => void
}

export function TactileEditor({ pages, onDone, onCancel }: TactileEditorProps) {
  const originalPages = useRef<string[]>([...pages])
  const [currentPage, setCurrentPage] = useState(0)
  const [activeTool, setActiveTool] = useState<EditorTool>('select')
  const [selectedObject, setSelectedObject] = useState<FabricType.FabricObject | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [dirtyPages, setDirtyPages] = useState<Set<number>>(new Set())

  const canvasRefs = useRef<Array<EditorCanvasHandle | null>>(pages.map(() => null))
  const currentPageRef = useRef(currentPage)
  useEffect(() => { currentPageRef.current = currentPage }, [currentPage])

  // Sync toolbar state when switching pages
  useEffect(() => {
    const c = canvasRefs.current[currentPage]
    setCanUndo(c?.canUndo ?? false)
    setCanRedo(c?.canRedo ?? false)
  }, [currentPage])

  const handleHistoryChange = useCallback(() => {
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

  const handleRevert = useCallback(() => {
    canvasRefs.current.forEach((c, i) => {
      c?.revert(originalPages.current[i])
    })
    setDirtyPages(new Set())
    setSelectedObject(null)
    setCanUndo(false)
    setCanRedo(false)
  }, [])

  const handleDone = useCallback(() => {
    const exportedPages = canvasRefs.current.map((c, i) => {
      return c ? c.exportSVG() : pages[i]
    })
    const speechScript = exportedPages[0] ? extractSpeechScript(exportedPages[0]) : null
    onDone({ pages: exportedPages, speechScript })
  }, [pages, onDone])

  const activeCanvas = canvasRefs.current[currentPage]

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
            style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6 }}
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
              style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6 }}
            >
              Revert
            </Button>
            <Button
              size="sm"
              onClick={handleDone}
              aria-label="Save changes and return to results"
              style={{ background: '#5e6ad2', color: '#ffffff', fontSize: 13, borderRadius: 6, border: 'none' }}
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
            onToolChange={setActiveTool}
            onUndo={() => activeCanvas?.undo()}
            onRedo={() => activeCanvas?.redo()}
            onDelete={() => activeCanvas?.deleteSelected()}
          />

          {/* Canvas area — all pages rendered, only current visible */}
          <div className="flex-1 flex overflow-hidden relative">
            {pages.map((svgString, i) => (
              <EditorCanvas
                key={i}
                ref={el => { canvasRefs.current[i] = el }}
                svgString={svgString}
                activeTool={activeTool}
                isVisible={i === currentPage}
                onSelectionChange={setSelectedObject}
                onHistoryChange={handleHistoryChange}
              />
            ))}
          </div>

          <PropertiesPanel
            selectedObject={selectedObject}
            onDelete={() => activeCanvas?.deleteSelected()}
            onPatternChange={(type: PatternType) => activeCanvas?.applyPatternToSelected(type)}
          />
        </div>

        <PageNav
          pages={pages}
          currentPage={currentPage}
          dirtyPages={dirtyPages}
          onPageChange={index => { setCurrentPage(index); setSelectedObject(null) }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
