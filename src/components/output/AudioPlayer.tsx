'use client'
import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useNarration } from '@/hooks/useNarration'
import type { NarrationStep } from '@/types/diagram'

interface AudioPlayerProps {
  steps: NarrationStep[]
}

export function AudioPlayer({ steps }: AudioPlayerProps) {
  const { currentStep, isPlaying, isSpeechSupported, play, pause, stop } = useNarration(steps)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRowRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts scoped to this component
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (isPlaying) { pause() } else { play() }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'Escape') {
        e.preventDefault()
        stop()
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [isPlaying, play, pause, stop])

  // Scroll active step into view while playing
  useEffect(() => {
    if (isPlaying && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentStep, isPlaying])

  const progressPct = steps.length > 0 ? (Math.max(0, currentStep + 1) / steps.length) * 100 : 0
  const stepDisplay = `${currentStep < 0 ? 0 : currentStep + 1} / ${steps.length}`

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Audio walkthrough"
      className="flex flex-col gap-3 outline-none"
      tabIndex={0}
    >
      {/* Controls row or MP3 fallback */}
      {isSpeechSupported ? (
        <div className="flex items-center gap-3">
          {/* Play / Pause */}
          <button
            onClick={isPlaying ? pause : play}
            aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
            className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors hover:opacity-90"
            style={{ width: 36, height: 36, background: '#5e6ad2' }}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="4" height="10" rx="1" fill="white" />
                <rect x="8" y="2" width="4" height="10" rx="1" fill="white" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 2l9 5-9 5V2z" fill="white" />
              </svg>
            )}
          </button>

          {/* Stop */}
          <button
            onClick={stop}
            aria-label="Stop narration"
            disabled={currentStep === -1}
            className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors"
            style={{
              width: 30,
              height: 30,
              background: '#18191a',
              border: '1px solid #23252a',
              opacity: currentStep === -1 ? 0.4 : 1,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="8" height="8" rx="1" fill="#8a8f98" />
            </svg>
          </button>

          {/* Progress bar */}
          <div
            role="progressbar"
            aria-valuenow={Math.max(0, currentStep + 1)}
            aria-valuemin={0}
            aria-valuemax={steps.length}
            className="flex-1 rounded-full"
            style={{ height: 4, background: '#23252a' }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 9999,
                background: 'linear-gradient(to right, #5e6ad2, #828fff)',
                width: `${progressPct}%`,
                transition: 'width 0.4s ease',
              }}
            />
          </div>

          {/* Step counter */}
          <span style={{ fontSize: 14, color: '#62666d', flexShrink: 0 }}>{stepDisplay}</span>
        </div>
      ) : (
        <p
          role="status"
          style={{ fontSize: 14, color: '#62666d', padding: '12px 0' }}
        >
          Audio playback is not supported in this browser.
        </p>
      )}

      {/* Current step text banner */}
      <div
        aria-live="polite"
        style={{
          background: '#18191a',
          border: '1px solid #23252a',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 16,
          color: '#d0d6e0',
          lineHeight: 1.5,
          minHeight: 52,
        }}
      >
        {currentStep >= 0 ? steps[currentStep]?.text : ''}
      </div>

      {/* Step list */}
      <div className="flex flex-col" style={{ position: 'relative' }}>
        <AnimatePresence>
          {steps.map((step, i) => {
            const isActive = i === currentStep
            const isDone = i < currentStep
            return (
              <div
                key={step.order}
                ref={isActive ? activeRowRef : undefined}
                className="relative"
                style={{ padding: '10px 12px', borderRadius: 8, fontSize: 15, lineHeight: 1.5 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="step-highlight"
                    className="absolute inset-0"
                    style={{
                      borderRadius: 8,
                      background: 'rgba(94,106,210,0.12)',
                      border: '1px solid rgba(94,106,210,0.25)',
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <span
                  style={{
                    position: 'relative',
                    color: isActive ? '#f7f8f8' : isDone ? '#3e3e44' : '#62666d',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {i + 1}. {step.text}
                </span>
              </div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
