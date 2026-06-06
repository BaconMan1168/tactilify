'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { DiagramAnalysis } from '@/types/diagram'

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200]
const DEFAULT_ZOOM_IDX = 2

interface HighContrastImageProps {
  analysis: DiagramAnalysis
  imageBase64: string
  imageMimeType: string
}

export function HighContrastImage({ analysis, imageBase64, imageMimeType }: HighContrastImageProps) {
  const [enhancedBase64, setEnhancedBase64] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX)

  useEffect(() => {
    let cancelled = false
    setEnhancedBase64(null)
    setError(null)

    fetch('/api/high-contrast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { base64?: string; error?: string }
        if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`)
        if (!data.base64) throw new Error('No image returned')
        return data.base64
      })
      .then((b64) => { if (!cancelled) setEnhancedBase64(b64) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to enhance image') })

    return () => { cancelled = true }
  }, [imageBase64])

  const slug = analysis.title.toLowerCase().replace(/\s+/g, '-')

  const handleDownloadPNG = useCallback(() => {
    if (!enhancedBase64) return
    const byteStr = atob(enhancedBase64)
    const ab = new ArrayBuffer(byteStr.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i)
    const blob = new Blob([ab], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `high-contrast-${slug}.png`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('High-contrast PNG downloaded')
  }, [enhancedBase64, slug])

  const handleDownloadSVG = useCallback(() => {
    if (!enhancedBase64) return
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth || 800
      const h = img.naturalHeight || 600
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><image href="data:image/png;base64,${enhancedBase64}" width="${w}" height="${h}"/></svg>`
      const blob = new Blob([svgStr], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `high-contrast-${slug}.svg`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('High-contrast SVG downloaded')
    }
    img.src = `data:image/png;base64,${enhancedBase64}`
  }, [enhancedBase64, slug])

  const zoom = ZOOM_LEVELS[zoomIdx]

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
    <div role="region" aria-label="High-contrast image output" className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[#62666d] uppercase tracking-[0.4px]">
          Enhanced for low-vision
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

      {/* Image viewport */}
      <div
        style={{ background: '#ffffff', border: '1px solid #34343a', borderRadius: 8, height: 380, overflow: 'auto' }}
        role="img"
        aria-label={`High-contrast image for ${analysis.title}`}
        aria-busy={!enhancedBase64}
      >
        {enhancedBase64 ? (
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', display: 'inline-block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${enhancedBase64}`}
              alt={`High-contrast enhanced diagram: ${analysis.title}`}
              style={{ display: 'block', maxWidth: 'none' }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: '#8a8f98', fontSize: 13 }}>
            Enhancing image for low-vision...
          </div>
        )}
      </div>

      {/* Note */}
      <div style={{ background: '#18191a', border: '1px solid #23252a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#62666d', lineHeight: 1.6 }}>
        Enhanced for low-vision users. Increase browser zoom for best results.
      </div>

      {/* Download buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleDownloadPNG}
          disabled={!enhancedBase64}
          aria-label="Download high-contrast PNG"
          className="flex-1 flex items-center justify-center gap-2 font-medium transition-colors"
          style={{
            background: enhancedBase64 ? '#5e6ad2' : '#23252a',
            color: '#ffffff', borderRadius: 8, padding: '10px 16px', fontSize: 14, border: 'none',
            cursor: enhancedBase64 ? 'pointer' : 'default', opacity: enhancedBase64 ? 1 : 0.5,
          }}
          onMouseEnter={e => { if (enhancedBase64) (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
          onMouseLeave={e => { if (enhancedBase64) (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PNG
        </button>

        <button
          onClick={handleDownloadSVG}
          disabled={!enhancedBase64}
          aria-label="Download high-contrast SVG"
          className="flex-1 flex items-center justify-center gap-2 font-medium transition-colors"
          style={{
            background: 'none',
            color: enhancedBase64 ? '#8a8f98' : '#3e3e44',
            borderRadius: 8, padding: '10px 16px', fontSize: 14,
            border: `1px solid ${enhancedBase64 ? '#34343a' : '#23252a'}`,
            cursor: enhancedBase64 ? 'pointer' : 'default', opacity: enhancedBase64 ? 1 : 0.5,
          }}
          onMouseEnter={e => { if (enhancedBase64) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#5e6ad2'; (e.currentTarget as HTMLButtonElement).style.color = '#f7f8f8' } }}
          onMouseLeave={e => { if (enhancedBase64) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#34343a'; (e.currentTarget as HTMLButtonElement).style.color = '#8a8f98' } }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download SVG
        </button>
      </div>
    </div>
  )
}
