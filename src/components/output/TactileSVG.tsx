'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { DiagramAnalysis } from '@/types/diagram'

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200]
const DEFAULT_ZOOM_IDX = 2

type SSEEvent =
  | { type: 'start' }
  | { type: 'page'; index: number; svg: string }
  | { type: 'speech'; script: string }
  | { type: 'done'; totalPages: number; truncated: boolean }
  | { type: 'not_a_diagram' }
  | { type: 'error'; message: string }

interface TactileSVGProps {
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
}

export function TactileSVG({ analysis, imageBase64, imageMimeType }: TactileSVGProps) {
  const [pages, setPages] = useState<string[]>([])
  const [speechScript, setSpeechScript] = useState<string | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX)
  const [speaking, setSpeaking] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingPageIndex, setStreamingPageIndex] = useState<number | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Generating tactile SVG, please wait.')
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const speakBtnRef = useRef<HTMLButtonElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let mounted = true

    setPages([])
    setSpeechScript(null)
    setPageIdx(0)
    setError(null)
    setTruncated(false)
    setStreamingPageIndex(null)
    setIsStreaming(true)

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    ;(async () => {
      try {
        const response = await fetch('/api/llm-tactile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64: imageBase64, mimeType: imageMimeType }),
          signal: abort.signal,
        })

        if (!response.ok) {
          const text = await response.text()
          if (mounted) {
            setError(text || `Server error ${response.status}`)
            setIsStreaming(false)
          }
          return
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let lineBuffer = ''

        const handleEvent = (event: SSEEvent) => {
          if (!mounted) return
          switch (event.type) {
            case 'start':
              setStreamingPageIndex(0)
              break
            case 'page':
              setPages(prev => [...prev, event.svg])
              setStreamingPageIndex(event.index + 1)
              break
            case 'speech':
              setSpeechScript(event.script)
              break
            case 'done':
              setIsStreaming(false)
              setStreamingPageIndex(null)
              if (event.truncated) setTruncated(true)
              break
            case 'not_a_diagram':
              setIsStreaming(false)
              setError('This image does not appear to be a STEM diagram. Please upload a diagram, chart, or scientific illustration.')
              break
            case 'error':
              setIsStreaming(false)
              setError(event.message)
              break
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop()!

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try { handleEvent(JSON.parse(line.slice(6)) as SSEEvent) } catch { /* skip malformed */ }
          }
        }

        // Flush TextDecoder's internal buffer — required for multi-byte UTF-8
        // sequences (Braille U+2800–U+28FF) split across chunk boundaries
        const remaining = decoder.decode()
        if (remaining) {
          lineBuffer += remaining
          for (const line of lineBuffer.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try { handleEvent(JSON.parse(line.slice(6)) as SSEEvent) } catch { /* skip */ }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to generate tactile SVG')
          setIsStreaming(false)
        }
      }
    })()

    return () => {
      mounted = false
      abort.abort()
    }
  }, [imageBase64, imageMimeType])

  const zoom = ZOOM_LEVELS[zoomIdx]
  const scaledW = Math.round(794 * zoom / 100)
  const scaledH = Math.round(1123 * zoom / 100)
  const currentSvg = pages[pageIdx] ?? null
  const totalPages = pages.length
  const isReady = !isStreaming && pages.length > 0

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  useEffect(() => {
    if (isReady) {
      setStatusMsg('Tactile SVG ready. Use the Read aloud button to hear the title, description, and exploration guide.')
      speakBtnRef.current?.focus()
    } else if (error) {
      setStatusMsg('Could not generate tactile SVG.')
    } else if (isStreaming && streamingPageIndex !== null) {
      setStatusMsg(`Generating page ${streamingPageIndex + 1} of approximately 3.`)
    } else {
      setStatusMsg('Generating tactile SVG, please wait.')
    }
  }, [isReady, error, isStreaming, streamingPageIndex])

  const handleSpeak = useCallback(() => {
    if (!window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const script = speechScript ?? [
      `Title: ${analysis.title}.`,
      `Description: ${analysis.summary}.`,
      analysis.explorationInstructions ? `Exploration guide: ${analysis.explorationInstructions}.` : '',
    ].filter(Boolean).join(' ')

    const utterance = new SpeechSynthesisUtterance(script)
    utteranceRef.current = utterance
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [analysis, speaking, speechScript])

  const handleDownload = useCallback(() => {
    if (!pages.length) return
    const slug = analysis.title.toLowerCase().replace(/\s+/g, '-')
    pages.forEach((page, i) => {
      const blob = new Blob([page], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = pages.length === 1 ? `tactile-${slug}.svg` : `tactile-${slug}-p${i + 1}.svg`
      a.click()
      URL.revokeObjectURL(url)
    })
    toast.success(pages.length === 1 ? 'Tactile SVG downloaded' : `${pages.length} tactile SVG pages downloaded`)
  }, [pages, analysis.title])

  if (error) {
    return (
      <div
        style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '16px', fontSize: 15, color: '#8a8f98' }}
        role="alert"
      >
        {error}
      </div>
    )
  }

  return (
    <div role="region" aria-label="Tactile braille SVG output" className="flex flex-col gap-3">
      {/* Screen-reader live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {statusMsg}
      </div>

      {/* Streaming progress indicator */}
      {isStreaming && (
        <div
          aria-hidden="true"
          className="animate-pulse"
          style={{
            fontSize: 12, color: '#62666d', padding: '6px 10px',
            background: '#141516', border: '1px solid #23252a', borderRadius: 6,
          }}
        >
          {streamingPageIndex !== null
            ? `Generating page ${streamingPageIndex + 1} of ~3…`
            : 'Connecting…'}
        </div>
      )}

      {/* Truncation banner */}
      {truncated && (
        <div
          role="alert"
          style={{
            fontSize: 13, color: '#e0a050', padding: '8px 12px',
            background: '#1f1a12', border: '1px solid #4a3a1a', borderRadius: 6,
          }}
        >
          Generation stopped early — showing partial output
        </div>
      )}

      {/* Header row: label + read-aloud + zoom controls */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#62666d] uppercase tracking-[0.4px]">
          A4 · swell paper ready
        </span>

        <div className="flex items-center gap-2">
          {typeof window !== 'undefined' && 'speechSynthesis' in window && (
            <button
              ref={speakBtnRef}
              onClick={handleSpeak}
              disabled={!isReady && !speaking}
              aria-label={speaking ? 'Stop reading aloud' : 'Read title, description and exploration guide aloud'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: speaking ? '#2a2020' : '#141516',
                border: `1px solid ${speaking ? '#6b3030' : '#23252a'}`,
                borderRadius: 6, padding: '3px 9px', height: 34,
                color: speaking ? '#e07070' : (!isReady ? '#3e3e44' : '#8a8f98'),
                fontSize: 12, cursor: (!isReady && !speaking) ? 'default' : 'pointer',
                opacity: (!isReady && !speaking) ? 0.5 : 1,
              }}
            >
              {speaking ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                  Stop
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polygon points="11,5 22,12 11,19" />
                    <line x1="3" y1="12" x2="3" y2="12" strokeLinecap="round" strokeWidth="3" />
                    <line x1="6" y1="8" x2="6" y2="16" strokeLinecap="round" strokeWidth="2" />
                  </svg>
                  Read aloud
                </>
              )}
            </button>
          )}

        <div
          className="flex items-center gap-1"
          style={{ background: '#141516', border: '1px solid #23252a', borderRadius: 6, padding: '3px' }}
        >
          <button
            onClick={() => setZoomIdx(i => Math.max(0, i - 1))}
            disabled={zoomIdx === 0}
            aria-label="Zoom out"
            style={{
              width: 28, height: 28, background: 'none', border: 'none', borderRadius: 4,
              color: zoomIdx === 0 ? '#3e3e44' : '#8a8f98',
              fontSize: 18, cursor: zoomIdx === 0 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >−</button>

          <span style={{ fontSize: 12, color: '#62666d', minWidth: 38, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {zoom}%
          </span>

          <button
            onClick={() => setZoomIdx(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            aria-label="Zoom in"
            style={{
              width: 28, height: 28, background: 'none', border: 'none', borderRadius: 4,
              color: zoomIdx === ZOOM_LEVELS.length - 1 ? '#3e3e44' : '#8a8f98',
              fontSize: 18, cursor: zoomIdx === ZOOM_LEVELS.length - 1 ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>

          <div style={{ width: 1, height: 16, background: '#23252a', margin: '0 2px' }} />

          <button
            onClick={() => setZoomIdx(DEFAULT_ZOOM_IDX)}
            aria-label="Reset zoom to 100%"
            style={{ background: 'none', border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 500, color: '#8a8f98', cursor: 'pointer', padding: '0 5px', height: 28 }}
          >Fit</button>
        </div>
        </div>
      </div>

      {/* Page navigation (only shown when multiple pages) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" style={{ background: '#141516', border: '1px solid #23252a', borderRadius: 6, padding: '4px 8px' }}>
          <button
            onClick={() => setPageIdx(i => Math.max(0, i - 1))}
            disabled={pageIdx === 0}
            aria-label="Previous page"
            style={{ background: 'none', border: 'none', color: pageIdx === 0 ? '#3e3e44' : '#8a8f98', cursor: pageIdx === 0 ? 'default' : 'pointer', fontSize: 13, padding: '2px 6px' }}
          >← Prev</button>

          <span style={{ fontSize: 12, color: '#62666d' }}>
            Page {pageIdx + 1} of {totalPages}{isStreaming ? '+' : ''}
          </span>

          <button
            onClick={() => setPageIdx(i => Math.min(totalPages - 1, i + 1))}
            disabled={pageIdx === totalPages - 1}
            aria-label="Next page"
            style={{ background: 'none', border: 'none', color: pageIdx === totalPages - 1 ? '#3e3e44' : '#8a8f98', cursor: pageIdx === totalPages - 1 ? 'default' : 'pointer', fontSize: 13, padding: '2px 6px' }}
          >Next →</button>
        </div>
      )}

      {/* SVG viewport */}
      <div
        style={{ background: '#ffffff', border: '1px solid #34343a', borderRadius: 8, height: 380, overflow: 'auto' }}
        role="img"
        aria-label={`Tactile SVG for ${analysis.title}${totalPages > 1 ? `, page ${pageIdx + 1} of ${totalPages}` : ''}`}
        aria-busy={isStreaming}
      >
        {currentSvg ? (
          <div
            style={{ width: scaledW, height: scaledH, transform: `scale(${zoom / 100})`, transformOrigin: 'top left', minWidth: scaledW, minHeight: scaledH }}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
        ) : (
          <div aria-hidden="true" className="flex items-center justify-center h-full" style={{ color: '#8a8f98', fontSize: 13 }}>
            Generating tactile SVG...
          </div>
        )}
      </div>

      {/* Print note */}
      <div style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#62666d', lineHeight: 1.6 }}>
        Printable on A4 swell paper. Print at 100% scale.
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!isReady}
        aria-label="Download tactile SVG for printing"
        className="w-full flex items-center justify-center gap-2 font-medium transition-colors"
        style={{
          background: isReady ? '#5e6ad2' : '#23252a',
          color: '#ffffff', borderRadius: 8, padding: '10px 16px', fontSize: 15, border: 'none',
          cursor: isReady ? 'pointer' : 'default', opacity: isReady ? 1 : 0.5,
        }}
        onMouseEnter={e => { if (isReady) (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
        onMouseLeave={e => { if (isReady) (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {totalPages > 1 ? `Download All ${totalPages} Pages` : 'Download Tactile SVG'}
      </button>
    </div>
  )
}
