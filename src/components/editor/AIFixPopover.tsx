'use client'
import { useRef, useEffect, useCallback } from 'react'

interface AIFixPopoverProps {
  anchorX: number  // viewport x — right edge of selection box
  anchorY: number  // viewport y — bottom edge of selection box
  status: 'idle' | 'loading'
  onFix: (prompt: string) => void
  onDismiss: () => void
}

const POPOVER_W = 228
const POPOVER_OFFSET = 8  // gap from anchor point

export function AIFixPopover({ anchorX, anchorY, status, onFix, onDismiss }: AIFixPopoverProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Clamp to viewport so popover never goes off-screen
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const POPOVER_H = 140

  let left = anchorX + POPOVER_OFFSET
  let top = anchorY + POPOVER_OFFSET
  if (left + POPOVER_W > vw - 12) left = anchorX - POPOVER_W - POPOVER_OFFSET
  if (top + POPOVER_H > vh - 12) top = anchorY - POPOVER_H - POPOVER_OFFSET

  useEffect(() => {
    if (status === 'idle') {
      textareaRef.current?.focus()
    }
  }, [status])

  const handleSubmit = useCallback(() => {
    const val = textareaRef.current?.value.trim()
    if (!val || status === 'loading') return
    onFix(val)
  }, [onFix, status])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }, [handleSubmit, onDismiss])

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        width: POPOVER_W,
        background: '#18191e',
        border: '1px solid #2d2f37',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 8px 28px rgba(0,0,0,0.65)',
        zIndex: 200,
      }}
      role="dialog"
      aria-label="AI fix region"
      aria-modal="false"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#828fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          AI Fix
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss AI fix"
          disabled={status === 'loading'}
          style={{ background: 'none', border: 'none', color: '#42454e', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      </div>

      {status === 'idle' ? (
        <>
          <textarea
            ref={textareaRef}
            rows={2}
            placeholder="e.g. fix overlapping labels, add a missing connection..."
            onKeyDown={handleKeyDown}
            style={{
              background: '#0f1011',
              border: '1px solid #2d2f37',
              borderRadius: 6,
              padding: '7px 9px',
              fontSize: 12,
              color: '#f7f8f8',
              width: '100%',
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
            onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#5e6ad2' }}
            onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#2d2f37' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#42454e' }}>⌘↵ to submit</span>
            <button
              onClick={handleSubmit}
              style={{
                background: '#5e6ad2',
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
            >
              Fix region
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#62666d' }}>
            <div style={{
              width: 10, height: 10, flexShrink: 0,
              border: '1.5px solid #2d2f37',
              borderTopColor: '#828fff',
              borderRadius: '50%',
              animation: 'aifix-spin 0.8s linear infinite',
            }} />
            Claude is rewriting this region...
          </div>
          {/* Shimmer progress bar */}
          <div style={{ height: 2, background: '#1a1b1e', borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              height: '100%',
              width: '70%',
              background: 'linear-gradient(90deg, #5e6ad2, #828fff, #5e6ad2)',
              backgroundSize: '200%',
              borderRadius: 1,
              animation: 'aifix-shimmer 1.4s linear infinite',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#42454e', textAlign: 'right' }}>Streaming SVG...</div>
        </>
      )}

      <style>{`
        @keyframes aifix-spin { to { transform: rotate(360deg); } }
        @keyframes aifix-shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
    </div>
  )
}
