'use client'
import type { PatternType } from '@/lib/patternAdapter'

const PATTERNS: Array<{ type: PatternType; label: string; svgPath: string }> = [
  { type: 'none', label: 'No fill', svgPath: '' },
  { type: 'diagonal', label: 'Diagonal lines', svgPath: 'M0,0 L8,8 M-2,6 L6,-2 M2,10 L10,2' },
  { type: 'horizontal', label: 'Horizontal lines', svgPath: 'M0,2 L8,2 M0,5 L8,5' },
  { type: 'vertical', label: 'Vertical lines', svgPath: 'M2,0 L2,8 M5,0 L5,8' },
  { type: 'crosshatch', label: 'Crosshatch', svgPath: 'M0,0 L8,8 M8,0 L0,8 M0,4 L8,4 M4,0 L4,8' },
]

interface TexturePickerProps {
  current: PatternType
  onChange: (type: PatternType) => void
}

export function TexturePicker({ current, onChange }: TexturePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11, color: '#62666d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Fill texture
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {PATTERNS.map(({ type, label, svgPath }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            aria-label={label}
            aria-pressed={current === type}
            style={{
              width: 32,
              height: 28,
              borderRadius: 4,
              border: `1px solid ${current === type ? '#5e6ad2' : '#23252a'}`,
              background: '#141516',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {type === 'none' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="2" y="2" width="16" height="16" fill="none" stroke="#3e3e44" strokeWidth="1"/>
                <line x1="2" y1="18" x2="18" y2="2" stroke="#3e3e44" strokeWidth="1"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="1" y="1" width="18" height="18" fill="none" stroke="#3e3e44" strokeWidth="0.5"/>
                <clipPath id={`clip-${type}`}>
                  <rect x="1" y="1" width="18" height="18"/>
                </clipPath>
                <path d={svgPath} fill="none" stroke="#8a8f98" strokeWidth="0.8" clipPath={`url(#clip-${type})`}/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
