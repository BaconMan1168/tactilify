'use client'
import { useState } from 'react'
import type { UploadedImage, SupportedMimeType } from '@/types/diagram'

const SAMPLES = [
  { label: 'Circuit diagram', path: '/samples/circuit-sample.png', mimeType: 'image/png' as SupportedMimeType },
  { label: 'Cell anatomy', path: '/samples/sample-cell-anatomy.webp', mimeType: 'image/webp' as SupportedMimeType },
] as const

interface Props {
  onLaunch: (img: UploadedImage) => void
}

export function SampleLauncher({ onLaunch }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  const launch = async (sample: (typeof SAMPLES)[number]) => {
    if (loading) return
    setLoading(sample.path)
    try {
      const res = await fetch(sample.path)
      const buffer = await res.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)))
      }
      onLaunch({ id: crypto.randomUUID(), base64: btoa(binary), mimeType: sample.mimeType })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-[5px]">
      <span className="text-[9px] font-medium uppercase tracking-[0.3px]" style={{ color: '#62666d' }}>
        Try a sample
      </span>
      {SAMPLES.map((sample) => {
        const isLoading = loading === sample.path
        const isDisabled = loading !== null
        return (
          <button
            key={sample.path}
            onClick={() => launch(sample)}
            disabled={isDisabled}
            aria-label={`Analyze ${sample.label} sample`}
            className="flex items-center gap-[5px] rounded-[6px] px-[7px] py-[5px] border border-[#23252a] hover:border-[#34343a] transition-colors"
            style={{
              width: 190,
              background: '#0f1011',
              cursor: isDisabled ? 'default' : 'pointer',
              opacity: isDisabled && !isLoading ? 0.5 : 1,
            }}
          >
            <div
              className="flex-shrink-0 rounded-[3px] overflow-hidden border border-[#23252a]"
              style={{ width: 28, height: 20, background: 'linear-gradient(135deg,#1a1d28,#0f1016)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sample.path} alt="" aria-hidden="true" className="w-full h-full object-cover opacity-80" />
            </div>
            <span className="flex-1 text-left text-[9px] font-medium" style={{ color: '#d0d6e0' }}>
              {sample.label}
            </span>
            {isLoading ? (
              <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <circle cx="5" cy="5" r="3.5" stroke="#3e3e44" strokeWidth="1.5" />
                <path d="M 5 1.5 A 3.5 3.5 0 0 1 8.5 5" stroke="#5e6ad2" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <span aria-hidden="true" style={{ fontSize: 9, color: '#5e6ad2', fontWeight: 600 }}>→</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
