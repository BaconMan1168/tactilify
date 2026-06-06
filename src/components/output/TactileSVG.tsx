'use client'
import { useState, useEffect, useCallback } from 'react'
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
  const [pages, setPages] = useState<string[] | null>(null)
  const [pageTitles, setPageTitles] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX)

  useEffect(() => {
    let cancelled = false
    setPages(null)
    setCurrentPage(0)
    setError(null)
    setUnsupportedReason(null)

    fetch('/api/tactile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis, imageBase64, imageMimeType }),
    })
      .then(async (res) => {
        const data = await res.json() as {
          error?: string
          errors?: string[]
          status?: string
          reason?: string
          pages?: string[]
          pageTitles?: string[]
          artifacts?: { svgPages: string[]; pageTitles: string[] }
        }
        if (data.status === 'unsupported') {
          if (!cancelled) setUnsupportedReason(data.reason ?? 'This diagram type cannot be converted to a tactile graphic.')
          return null
        }
        if (!res.ok || data.status === 'failed') {
          throw new Error(data.error ?? data.errors?.[0] ?? `Server error ${res.status}`)
        }
        return data
      })
      .then((data) => {
        if (data === null || cancelled) return
        if (!cancelled) {
          const svgPages = data.artifacts?.svgPages ?? data.pages ?? []
          const titles = data.artifacts?.pageTitles ?? data.pageTitles ?? svgPages.map((_, i) => `Page ${i + 1}`)
          if (svgPages.length === 0) {
            setError('No tactile pages were generated.')
            return
          }
          setPages(svgPages)
          setPageTitles(titles)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate tactile SVG')
      })

    return () => { cancelled = true }
  }, [analysis, imageBase64, imageMimeType])

  const zoom = ZOOM_LEVELS[zoomIdx]
  const scaledW = Math.round(794 * zoom / 100)
  const scaledH = Math.round(1123 * zoom / 100)
  const totalPages = pages?.length ?? 0
  const svgString = pages?.[currentPage] ?? null

  const handleDownload = useCallback(async () => {
    if (!pages || pages.length === 0) return
    const slug = analysis.title.toLowerCase().replace(/\s+/g, '-')

    if (pages.length === 1) {
      const blob = new Blob([pages[0]], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tactile-${slug}.svg`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Tactile SVG downloaded')
    } else {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      pages.forEach((svg, i) => {
        const title = (pageTitles[i] ?? `page-${i + 1}`).toLowerCase().replace(/\s+/g, '-')
        zip.file(`page-${i + 1}-${title}.svg`, svg)
      })
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tactile-${slug}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Downloaded ${pages.length} tactile pages as ZIP`)
    }
  }, [pages, pageTitles, analysis.title])

  if (unsupportedReason) {
    return (
      <div
        role="status"
        aria-label="Tactile diagram not available for this diagram type"
        style={{ background: '#18191a', border: '1px solid #2d2f36', borderRadius: 8, padding: '20px 18px' }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#c9ccd4', marginBottom: 10 }}>
          Tactile diagram not available
        </div>
        <div style={{ fontSize: 13, color: '#8a8f98', lineHeight: 1.65 }}>
          {unsupportedReason}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: '#555860', lineHeight: 1.5 }}>
          The audio walkthrough and diagram map are still available on the other tabs.
        </div>
      </div>
    )
  }

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
      {/* Header row: label + zoom controls */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#62666d] uppercase tracking-[0.4px]">
          A4 · braille-encoded labels
        </span>

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

      {/* Multi-page navigation */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between"
          style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '8px 12px' }}
        >
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="Previous page"
            style={{
              background: 'none', border: '1px solid #34343a', borderRadius: 5,
              color: currentPage === 0 ? '#3e3e44' : '#8a8f98',
              fontSize: 13, padding: '4px 10px', cursor: currentPage === 0 ? 'default' : 'pointer',
            }}
          >Prev</button>

          <span style={{ fontSize: 12, color: '#62666d' }}>
            Page {currentPage + 1} of {totalPages}
            {pageTitles[currentPage] ? ` — ${pageTitles[currentPage]}` : ''}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            aria-label="Next page"
            style={{
              background: 'none', border: '1px solid #34343a', borderRadius: 5,
              color: currentPage === totalPages - 1 ? '#3e3e44' : '#8a8f98',
              fontSize: 13, padding: '4px 10px', cursor: currentPage === totalPages - 1 ? 'default' : 'pointer',
            }}
          >Next</button>
        </div>
      )}

      {/* SVG viewport */}
      <div
        style={{ background: '#ffffff', border: '1px solid #34343a', borderRadius: 8, height: 380, overflow: 'auto' }}
        role="img"
        aria-label={`Tactile SVG for ${analysis.title}${totalPages > 1 ? `, page ${currentPage + 1} of ${totalPages}` : ''}`}
        aria-busy={!pages}
      >
        {svgString ? (
          <div
            style={{ width: scaledW, height: scaledH, transform: `scale(${zoom / 100})`, transformOrigin: 'top left', minWidth: scaledW, minHeight: scaledH }}
            // Safe: SVG is generated by our own server-side renderer, never from raw user input
            dangerouslySetInnerHTML={{ __html: svgString }}
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
        {totalPages > 1 && ` This diagram spans ${totalPages} pages.`}
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!pages}
        aria-label={totalPages > 1 ? 'Download all tactile pages as ZIP' : 'Download tactile SVG for printing'}
        className="w-full flex items-center justify-center gap-2 font-medium transition-colors"
        style={{
          background: pages ? '#5e6ad2' : '#23252a',
          color: '#ffffff', borderRadius: 8, padding: '10px 16px', fontSize: 15, border: 'none',
          cursor: pages ? 'pointer' : 'default', opacity: pages ? 1 : 0.5,
        }}
        onMouseEnter={e => { if (pages) (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
        onMouseLeave={e => { if (pages) (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7,10 12,15 17,10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {totalPages > 1 ? `Download All Pages (ZIP)` : 'Download Tactile SVG'}
      </button>
    </div>
  )
}
