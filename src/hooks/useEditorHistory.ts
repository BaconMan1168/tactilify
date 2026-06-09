'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type * as fabric from 'fabric'

const MAX_HISTORY = 20
const CUSTOM_PROPS = ['data-braille', 'data-braille-text', 'data-pattern-type']

export interface UseEditorHistoryResult {
  undo: () => Promise<void>
  redo: () => Promise<void>
  reset: (initialJSON?: object) => void
  getIsDirty: () => boolean
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

export function useEditorHistory(canvas: fabric.Canvas | null): UseEditorHistoryResult {
  const stackRef = useRef<object[]>([])
  const pointerRef = useRef<number>(-1)
  const initialRef = useRef<string>('')
  const isRestoringRef = useRef(false)
  const [canState, setCanState] = useState({ canUndo: false, canRedo: false, isDirty: false })

  const getIsDirty = useCallback(() => {
    const ptr = pointerRef.current
    const len = stackRef.current.length
    return len > 0 && JSON.stringify(stackRef.current[ptr]) !== initialRef.current
  }, [])

  const updateCanState = useCallback(() => {
    const ptr = pointerRef.current
    const len = stackRef.current.length
    setCanState({
      canUndo: ptr > 0,
      canRedo: ptr < len - 1,
      isDirty: getIsDirty(),
    })
  }, [getIsDirty])

  // Fabric v7 toJSON() takes no args; toObject() accepts propertiesToInclude
  const toJSON = useCallback((c: fabric.Canvas) =>
    (c as unknown as { toObject(p: string[]): object }).toObject(CUSTOM_PROPS),
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
    updateCanState()
  }, [canvas, toJSON, updateCanState])

  const initSnapshot = useCallback(() => {
    if (!canvas) return
    const json = toJSON(canvas)
    initialRef.current = JSON.stringify(json)
    stackRef.current = [json]
    pointerRef.current = 0
    updateCanState()
  }, [canvas, toJSON, updateCanState])

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
    updateCanState()
  }, [canvas, updateCanState])

  const redo = useCallback(async () => {
    if (!canvas || pointerRef.current >= stackRef.current.length - 1) return
    pointerRef.current += 1
    isRestoringRef.current = true
    await canvas.loadFromJSON(stackRef.current[pointerRef.current])
    canvas.renderAll()
    isRestoringRef.current = false
    updateCanState()
  }, [canvas, updateCanState])

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

  return { undo, redo, reset, getIsDirty, canUndo: canState.canUndo, canRedo: canState.canRedo, isDirty: canState.isDirty }
}
