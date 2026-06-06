'use client'
import { useState, useRef } from 'react'

type State = 'idle' | 'generating' | 'done' | 'error'

export default function LlmTactilePage() {
  const [state, setState] = useState<State>('idle')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setPreviewSrc(URL.createObjectURL(file))
    setSvg(null)
    setError(null)

    const base64 = await fileToBase64(file)
    setState('generating')

    try {
      const res = await fetch('/api/llm-tactile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type }),
      })
      const data = (await res.json()) as { svg?: string; error?: string }
      if (!res.ok || !data.svg) throw new Error(data.error ?? `Error ${res.status}`)
      setSvg(data.svg)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  const handleDownload = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tactile-diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>LLM Tactile Generator</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Direct Claude generation — no preprocessing pipeline.
      </p>

      {/* Upload area */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        style={{
          border: '2px dashed #ccc',
          borderRadius: 8,
          padding: '40px 24px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 24,
          background: '#fafafa',
        }}
        role="button"
        aria-label="Upload diagram image"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
      >
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="Uploaded diagram" style={{ maxHeight: 200, maxWidth: '100%', objectFit: 'contain' }} />
        ) : (
          <p style={{ color: '#999' }}>Drop an image here or click to upload</p>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        aria-label="File input"
      />

      {/* Status */}
      {state === 'generating' && (
        <p style={{ color: '#555', marginBottom: 24 }}>Generating tactile SVG via Claude (medium reasoning)...</p>
      )}
      {state === 'error' && (
        <p style={{ color: '#c00', marginBottom: 24 }}>Error: {error}</p>
      )}

      {/* SVG output */}
      {svg && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Generated tactile SVG</h2>
            <button
              onClick={handleDownload}
              style={{
                padding: '8px 16px',
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Download SVG
            </button>
          </div>

          {/* Rendered SVG preview */}
          <div
            style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, background: '#fff', marginBottom: 16 }}
            dangerouslySetInnerHTML={{ __html: svg }}
            aria-label="Tactile SVG preview"
          />

          {/* Raw SVG source */}
          <details>
            <summary style={{ cursor: 'pointer', color: '#555', fontSize: 13, marginBottom: 8 }}>
              View raw SVG source
            </summary>
            <pre
              style={{
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: 6,
                padding: 16,
                fontSize: 12,
                overflowX: 'auto',
                maxHeight: 400,
              }}
            >
              {svg}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // strip the data URL prefix
      resolve(result.split(',')[1] ?? result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
