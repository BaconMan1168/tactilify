'use client'
import { useRef, useState, useCallback } from 'react'

const MAX_HISTORY = 30

export interface SvgHistoryResult {
  reset: (initial: string) => void
  snapshot: (svg: string) => void
  undo: () => string | null
  redo: () => string | null
  commitMutation: (container: HTMLDivElement) => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

export function useSvgHistory(): SvgHistoryResult {
  const stackRef = useRef<string[]>([])
  const pointerRef = useRef(-1)
  const initialRef = useRef('')
  const [state, setState] = useState({ canUndo: false, canRedo: false, isDirty: false })

  const sync = useCallback((ptr: number, stack: string[]) => {
    setState({
      canUndo: ptr > 0,
      canRedo: ptr < stack.length - 1,
      isDirty: stack[ptr] !== initialRef.current,
    })
  }, [])

  const reset = useCallback((initial: string) => {
    initialRef.current = initial
    stackRef.current = [initial]
    pointerRef.current = 0
    sync(0, [initial])
  }, [sync])

  const snapshot = useCallback((svg: string) => {
    const stack = stackRef.current
    const ptr = pointerRef.current
    stack.splice(ptr + 1)
    stack.push(svg)
    if (stack.length > MAX_HISTORY) stack.shift()
    const next = stack.length - 1
    pointerRef.current = next
    sync(next, stack)
  }, [sync])

  // Convenience: snapshot directly from the live container innerHTML
  const commitMutation = useCallback((container: HTMLDivElement) => {
    snapshot(container.innerHTML)
  }, [snapshot])

  const undo = useCallback((): string | null => {
    if (pointerRef.current <= 0) return null
    pointerRef.current -= 1
    const svg = stackRef.current[pointerRef.current]
    sync(pointerRef.current, stackRef.current)
    return svg
  }, [sync])

  const redo = useCallback((): string | null => {
    const stack = stackRef.current
    if (pointerRef.current >= stack.length - 1) return null
    pointerRef.current += 1
    const svg = stack[pointerRef.current]
    sync(pointerRef.current, stack)
    return svg
  }, [sync])

  return { reset, snapshot, commitMutation, undo, redo, ...state }
}
