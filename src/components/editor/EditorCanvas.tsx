'use client'
import { useRef, useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useCallback, useState } from 'react'
import type * as FabricType from 'fabric'
import { loadSVGToCanvas, TACTILE_DEFAULTS } from '@/lib/svgLoader'
import { exportCanvasToSVG } from '@/lib/svgExporter'
import { useEditorHistory } from '@/hooks/useEditorHistory'
import { applyPattern, type PatternType } from '@/lib/patternAdapter'
import type { EditorTool } from './EditorToolbar'

export interface EditorCanvasHandle {
  exportSVG: () => string
  revert: (svgString: string) => Promise<void>
  deleteSelected: () => void
  applyPatternToSelected: (type: PatternType) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

interface EditorCanvasProps {
  svgString: string
  activeTool: EditorTool
  isVisible: boolean
  onSelectionChange: (obj: FabricType.FabricObject | null) => void
  onHistoryChange: () => void
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas({ svgString, activeTool, isVisible, onSelectionChange, onHistoryChange }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<FabricType.Canvas | null>(null)
    const fabricModuleRef = useRef<typeof FabricType | null>(null)
    const activeToolRef = useRef(activeTool)
    activeToolRef.current = activeTool

    // State-based canvas so useEditorHistory gets re-initialized when canvas mounts
    const [fabricCanvas, setFabricCanvas] = useState<FabricType.Canvas | null>(null)
    const history = useEditorHistory(fabricCanvas)

    // Wire parent selection/history callbacks onto a canvas instance.
    // Called after initial load and after revert so the new canvas is always wired.
    const wireCallbacks = useCallback((c: FabricType.Canvas) => {
      const handleSelection = () => {
        onSelectionChange(c.getActiveObject() ?? null)
        onHistoryChange()
      }
      c.on('selection:created', handleSelection)
      c.on('selection:updated', handleSelection)
      c.on('selection:cleared', () => { onSelectionChange(null); onHistoryChange() })
      c.on('object:modified', onHistoryChange)
      c.on('object:added', onHistoryChange)
      c.on('object:removed', onHistoryChange)
    }, [onSelectionChange, onHistoryChange])

    // Keyboard shortcuts
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!isVisible) return
        const isMeta = e.metaKey || e.ctrlKey
        if (isMeta && e.shiftKey && e.key === 'z') {
          e.preventDefault()
          history.redo()
        } else if (isMeta && e.key === 'z') {
          e.preventDefault()
          history.undo()
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          const active = fabricRef.current?.getActiveObject()
          const tag = (document.activeElement as HTMLElement)?.tagName
          if (active && tag !== 'INPUT' && tag !== 'TEXTAREA') {
            fabricRef.current?.remove(active)
            fabricRef.current?.renderAll()
          }
        }
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [isVisible, history])

    // Mount Fabric canvas
    useEffect(() => {
      if (!canvasElRef.current) return
      let disposed = false

      ;(async () => {
        const fabric = await import('fabric')
        fabricModuleRef.current = fabric
        if (disposed || !canvasElRef.current) return

        const canvas = await loadSVGToCanvas(canvasElRef.current, svgString)
        if (disposed) { canvas.dispose(); return }
        fabricRef.current = canvas
        wireCallbacks(canvas)
        setFabricCanvas(canvas)
      })()

      return () => {
        disposed = true
        fabricRef.current?.dispose()
        fabricRef.current = null
        setFabricCanvas(null)
      }
      // svgString only changes on revert — handled separately
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Tool change
    useEffect(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      canvas.isDrawingMode = false
      canvas.selection = activeTool === 'select'
    }, [activeTool])

    // Notify parent after history state commits so the toolbar reads fresh handle values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => { onHistoryChange() }, [history.canUndo, history.canRedo, history.isDirty])

    // Click-to-add shapes (registered once after mount)
    useEffect(() => {
      if (!fabricCanvas) return
      const canvas = fabricCanvas

      const handleMouseDown = (opt: FabricType.TEvent) => {
        if (activeToolRef.current === 'select') return
        const fabric = fabricModuleRef.current
        if (!fabric) return
        const pointer = canvas.getViewportPoint(opt.e as MouseEvent)

        let newObj: FabricType.FabricObject | null = null
        switch (activeToolRef.current) {
          case 'rect':
            newObj = new fabric.Rect({ left: pointer.x, top: pointer.y, width: 60, height: 40 })
            break
          case 'circle':
            newObj = new fabric.Circle({ left: pointer.x, top: pointer.y, radius: 30 })
            break
          case 'arrow':
            newObj = new fabric.Line([pointer.x, pointer.y, pointer.x + 80, pointer.y])
            break
          case 'text':
            newObj = new fabric.IText('Text', { left: pointer.x, top: pointer.y, fontSize: 14, fill: '#000000' })
            break
        }
        if (newObj) {
          // Apply tactile defaults to all new non-text objects so they match
          // the loaded SVG objects (strokeUniform prevents stroke scaling).
          if (activeToolRef.current !== 'text') {
            newObj.set(TACTILE_DEFAULTS)
          }
          canvas.add(newObj)
          canvas.setActiveObject(newObj)
          canvas.renderAll()
        }
      }

      canvas.on('mouse:down', handleMouseDown)
      return () => { canvas.off('mouse:down', handleMouseDown) }
    }, [fabricCanvas])

    useImperativeHandle(ref, () => ({
      exportSVG: () => {
        if (!fabricRef.current) return ''
        return exportCanvasToSVG(fabricRef.current)
      },
      revert: async (newSvgString: string) => {
        const canvas = fabricRef.current
        const canvasEl = canvasElRef.current
        if (!canvas || !canvasEl) return
        canvas.dispose()
        const newCanvas = await loadSVGToCanvas(canvasEl, newSvgString)
        fabricRef.current = newCanvas
        wireCallbacks(newCanvas)
        setFabricCanvas(newCanvas)
        history.reset()
      },
      deleteSelected: () => {
        const canvas = fabricRef.current
        const active = canvas?.getActiveObject()
        if (active) { canvas?.remove(active); canvas?.renderAll() }
      },
      applyPatternToSelected: async (type: PatternType) => {
        const canvas = fabricRef.current
        const fabric = fabricModuleRef.current
        const active = canvas?.getActiveObject()
        if (!canvas || !fabric || !active) return
        await applyPattern(fabric, active, type, canvas)
      },
      undo: history.undo,
      redo: history.redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      isDirty: history.isDirty,
    }), [history])

    return (
      <div
        ref={wrapperRef}
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
        <div style={{ boxShadow: '0 0 0 1px #23252a', background: '#ffffff' }}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    )
  }
)
