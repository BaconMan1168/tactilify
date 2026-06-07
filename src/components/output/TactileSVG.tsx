'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type { DiagramAnalysis } from '@/types/diagram'

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200]
const DEFAULT_ZOOM_IDX = 2

interface TactileSVGProps {
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
}

export function TactileSVG({ analysis, imageBase64, imageMimeType }: TactileSVGProps) {
  const [svgPages, setSvgPages] = useState<string[] | null>(null)
  const [pageIdx, setPageIdx] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX)
  const [speaking, setSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    let cancelled = false
    setSvgPages(null)
    setPageIdx(0)
    setError(null)

    fetch('/api/llm-tactile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64: imageBase64, mimeType: imageMimeType }),
    })
      .then(async (res) => {
        const data = await res.json() as { svgPages?: string[]; error?: string }
        if (!res.ok || !data.svgPages?.length) throw new Error(data.error ?? `Server error ${res.status}`)
        return data.svgPages
      })
      .then((pages) => {
        if (!cancelled) setSvgPages(pages)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate tactile SVG')
      })

    return () => { cancelled = true }
  }, [imageBase64, imageMimeType])

  const zoom = ZOOM_LEVELS[zoomIdx]
  const scaledW = Math.round(794 * zoom / 100)
  const scaledH = Math.round(1123 * zoom / 100)
  const currentSvg = svgPages?.[pageIdx] ?? null
  const totalPages = svgPages?.length ?? 0

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel() }
  }, [])

  const handleSpeak = useCallback(() => {
    if (!window.speechSynthesis) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const parts = [
      `Title: ${analysis.title}.`,
      `Description: ${analysis.summary}.`,
      analysis.explorationInstructions ? `Exploration guide: ${analysis.explorationInstructions}.` : '',
    ].filter(Boolean).join(' ')

    const utterance = new SpeechSynthesisUtterance(parts)
    utteranceRef.current = utterance
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }, [analysis, speaking])

  const handleDownload = useCallback(() => {
    if (!svgPages) return
    const slug = analysis.title.toLowerCase().replace(/\s+/g, '-')
    svgPages.forEach((page, i) => {
      const blob = new Blob([page], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = svgPages.length === 1 ? `tactile-${slug}.svg` : `tactile-${slug}-p${i + 1}.svg`
      a.click()
      URL.revokeObjectURL(url)
    })
    toast.success(svgPages.length === 1 ? 'Tactile SVG downloaded' : `${svgPages.length} tactile SVG pages downloaded`)
  }, [svgPages, analysis.title])

  if (error) {
    return (
      <div
        style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '16px', fontSize: 15, color: '#8a8f98' }}
        role="alert"
      >
        Could not generate tactile SVG.
      </div>
    )
  }

  return (
    <div role="region" aria-label="Tactile braille SVG output" className="flex flex-col gap-3">
      {/* Header row: label + read-aloud + zoom controls */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#62666d] uppercase tracking-[0.4px]">
          A4 · swell/emboss ready
        </span>

        <div className="flex items-center gap-2">
          {typeof window !== 'undefined' && 'speechSynthesis' in window && (
            <button
              onClick={handleSpeak}
              aria-label={speaking ? 'Stop reading aloud' : 'Read title, description and exploration guide aloud'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: speaking ? '#2a2020' : '#141516',
                border: `1px solid ${speaking ? '#6b3030' : '#23252a'}`,
                borderRadius: 6, padding: '3px 9px', height: 34,
                color: speaking ? '#e07070' : '#8a8f98',
                fontSize: 12, cursor: 'pointer',
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
            Page {pageIdx + 1} of {totalPages}
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
        aria-busy={!svgPages}
      >
        {currentSvg ? (
          <div
            style={{ width: scaledW, height: scaledH, transform: `scale(${zoom / 100})`, transformOrigin: 'top left', minWidth: scaledW, minHeight: scaledH }}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: '#8a8f98', fontSize: 13 }}>
            Generating tactile SVG...
          </div>
        )}
      </div>

      {/* Print note */}
      <div style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#62666d', lineHeight: 1.6 }}>
        Optimised for swell-paper or tactile embossing printers. Print at 100% scale on A4.
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!svgPages}
        aria-label="Download tactile SVG for printing"
        className="w-full flex items-center justify-center gap-2 font-medium transition-colors"
        style={{
          background: svgPages ? '#5e6ad2' : '#23252a',
          color: '#ffffff', borderRadius: 8, padding: '10px 16px', fontSize: 15, border: 'none',
          cursor: svgPages ? 'pointer' : 'default', opacity: svgPages ? 1 : 0.5,
        }}
        onMouseEnter={e => { if (svgPages) (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
        onMouseLeave={e => { if (svgPages) (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
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
