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
    <div className="flex flex-col gap-2" style={{ width: 500 }}>
      <span className="text-[11px] font-medium uppercase tracking-[0.4px]" style={{ color: '#62666d' }}>
        Try a sample
      </span>
      <div className="flex gap-2">
        {SAMPLES.map((sample) => {
          const isLoading = loading === sample.path
          const isDisabled = loading !== null
          return (
            <button
              key={sample.path}
              onClick={() => launch(sample)}
              disabled={isDisabled}
              aria-label={`Analyze ${sample.label} sample`}
              className="flex items-center rounded-[8px] border border-[#23252a] hover:border-[#34343a] transition-colors overflow-hidden"
              style={{
                flex: 1,
                height: 60,
                background: '#0f1011',
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: isDisabled && !isLoading ? 0.5 : 1,
              }}
            >
              {/* Full-height thumbnail */}
              <div className="flex-shrink-0 overflow-hidden" style={{ width: 80, height: 60, background: '#f5f6f6' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sample.path} alt="" aria-hidden="true" className="w-full h-full object-cover" style={{ opacity: 0.95 }} />
              </div>
              {/* Label */}
              <span className="flex-1 text-left text-[14px] font-medium px-4" style={{ color: '#d0d6e0' }}>
                {sample.label}
              </span>
              {/* Status */}
              <div className="pr-4 flex-shrink-0">
                {isLoading ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="7" cy="7" r="5" stroke="#3e3e44" strokeWidth="2" />
                    <path d="M 7 2 A 5 5 0 0 1 12 7" stroke="#5e6ad2" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : (
                  <span aria-hidden="true" className="text-[14px] font-semibold" style={{ color: '#5e6ad2' }}>→</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
