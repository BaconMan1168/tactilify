'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type * as fabric from 'fabric'

const MAX_HISTORY = 20
const CUSTOM_PROPS = ['data-braille', 'data-braille-text', 'data-pattern-type']

export interface UseEditorHistoryResult {
  undo: () => Promise<void>
  redo: () => Promise<void>
  reset: (initialJSON?: object) => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

export function useEditorHistory(canvas: fabric.Canvas | null): UseEditorHistoryResult {
  const stackRef = useRef<object[]>([])
  const pointerRef = useRef<number>(-1)
  const initialRef = useRef<string>('')
  const isRestoringRef = useRef(false)
  const [, forceUpdate] = useState(0)

  // Fabric v7 types don't expose propertiesToInclude overload, cast at runtime
  const toJSON = useCallback((c: fabric.Canvas) =>
    (c as unknown as { toJSON(p: string[]): object }).toJSON(CUSTOM_PROPS),
  [])

  const snapshot = useCallback(() => {
    if (!canvas || isRestoringRef.current) return
    const json = toJSON(canvas)
    const stack = stackRef.current
    const pointer = pointerRef.current

    stack.splice(pointer + 1)
    stack.push(json)
    if (stack.length > MAX_HISTORY) stack.shift()
    pointerRef.current = stack.length - 1
    forceUpdate(n => n + 1)
  }, [canvas, toJSON])

  const initSnapshot = useCallback(() => {
    if (!canvas) return
    const json = toJSON(canvas)
    initialRef.current = JSON.stringify(json)
    stackRef.current = [json]
    pointerRef.current = 0
    forceUpdate(n => n + 1)
  }, [canvas, toJSON])

  useEffect(() => {
    if (!canvas) return
    initSnapshot()
    canvas.on('object:modified', snapshot)
    canvas.on('object:added', snapshot)
    canvas.on('object:removed', snapshot)
    return () => {
      canvas.off('object:modified', snapshot)
      canvas.off('object:added', snapshot)
      canvas.off('object:removed', snapshot)
    }
  }, [canvas, snapshot, initSnapshot])

  const undo = useCallback(async () => {
    if (!canvas || pointerRef.current <= 0) return
    pointerRef.current -= 1
    isRestoringRef.current = true
    await canvas.loadFromJSON(stackRef.current[pointerRef.current])
    canvas.renderAll()
    isRestoringRef.current = false
    forceUpdate(n => n + 1)
  }, [canvas])

  const redo = useCallback(async () => {
    if (!canvas || pointerRef.current >= stackRef.current.length - 1) return
    pointerRef.current += 1
    isRestoringRef.current = true
    await canvas.loadFromJSON(stackRef.current[pointerRef.current])
    canvas.renderAll()
    isRestoringRef.current = false
    forceUpdate(n => n + 1)
  }, [canvas])

  const reset = useCallback((initialJSON?: object) => {
    if (!canvas) return
    if (initialJSON) {
      isRestoringRef.current = true
      canvas.loadFromJSON(initialJSON).then(() => {
        canvas.renderAll()
        isRestoringRef.current = false
        initSnapshot()
      })
    } else {
      initSnapshot()
    }
  }, [canvas, initSnapshot])

  const pointer = pointerRef.current
  const stackLen = stackRef.current.length
  const canUndo = pointer > 0
  const canRedo = pointer < stackLen - 1
  const isDirty = stackLen > 0 && JSON.stringify(stackRef.current[pointer]) !== initialRef.current

  return { undo, redo, reset, canUndo, canRedo, isDirty }
}
