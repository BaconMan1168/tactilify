'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { announce } from '@react-aria/live-announcer'
import type { NarrationStep } from '@/types/diagram'

export interface UseNarrationResult {
  currentStep: number
  isPlaying: boolean
  isPaused: boolean
  isSpeechSupported: boolean
  play: () => void
  pause: () => void
  stop: () => void
}

export function useNarration(steps: NarrationStep[]): UseNarrationResult {
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)

  // Refs so callbacks never go stale without re-creating them
  const currentStepRef = useRef(-1)
  const isPlayingRef = useRef(false)
  const isPausedRef = useRef(false)
  const stepsRef = useRef(steps)
  stepsRef.current = steps

  useEffect(() => {
    setIsSpeechSupported('speechSynthesis' in window)
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  const playStep = useCallback((index: number) => {
    const currentSteps = stepsRef.current
    if (index >= currentSteps.length) {
      setIsPlaying(false)
      isPlayingRef.current = false
      return
    }

    currentStepRef.current = index
    setCurrentStep(index)
    setIsPlaying(true)
    isPlayingRef.current = true
    setIsPaused(false)
    isPausedRef.current = false

    announce(currentSteps[index].text, 'polite')

    const utterance = new SpeechSynthesisUtterance(currentSteps[index].text)
    utterance.onend = () => playStep(index + 1)
    utterance.onerror = (e) => {
      // 'interrupted'/'canceled' fires when stop() or unmount cancels — not an error
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        setIsPlaying(false)
        isPlayingRef.current = false
      }
    }
    window.speechSynthesis.speak(utterance)
  }, []) // stable — reads state via refs

  const play = useCallback(() => {
    if (isPausedRef.current) {
      // pause()/resume() mid-utterance is reliable in Chrome; Firefox/Safari may restart
      // the current step on resume — known limitation, no workaround in v1
      window.speechSynthesis.resume()
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsPaused(false)
      isPausedRef.current = false
      return
    }

    const step = currentStepRef.current
    const lastIndex = stepsRef.current.length - 1

    if (step === lastIndex && !isPlayingRef.current && !isPausedRef.current) {
      // Done state — restart from beginning
      currentStepRef.current = -1
      setCurrentStep(-1)
      playStep(0)
      return
    }

    playStep(step < 0 ? 0 : step)
  }, [playStep])

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
    setIsPlaying(false)
    isPlayingRef.current = false
    setIsPaused(true)
    isPausedRef.current = true
  }, [])

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    currentStepRef.current = -1
    setCurrentStep(-1)
    setIsPlaying(false)
    isPlayingRef.current = false
    setIsPaused(false)
    isPausedRef.current = false
  }, [])

  return { currentStep, isPlaying, isPaused, isSpeechSupported, play, pause, stop }
}
