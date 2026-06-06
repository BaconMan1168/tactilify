'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { FocusScope, useFocusManager } from '@react-aria/focus'
import { announce } from '@react-aria/live-announcer'
import gsap from 'gsap'
import type { DiagramAnalysis, DiagramElement, Relationship } from '@/types/diagram'

// Maps 0-1 position to 10-90 range (safe zone avoids clipping at container edges)
const toGrid = (n: number) => 10 + 80 * n

function findNearest(
  elements: DiagramElement[],
  currentId: string,
  dir: 'up' | 'down' | 'left' | 'right',
): string | null {
  const cur = elements.find(e => e.id === currentId)
  if (!cur?.position) return null
  const { x: cx, y: cy } = cur.position

  const inDir = elements.filter(e => {
    if (e.id === currentId || !e.position) return false
    const { x, y } = e.position
    if (dir === 'right') return x > cx + 0.04
    if (dir === 'left')  return x < cx - 0.04
    if (dir === 'down')  return y > cy + 0.04
    return y < cy - 0.04
  })

  if (!inDir.length) return null
  return inDir.reduce((best, e) => {
    const d = (el: DiagramElement) => Math.hypot(el.position!.x - cx, el.position!.y - cy)
    return d(e) < d(best) ? e : best
  }).id
}

interface LineData {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  length: number
  directed: boolean
}

function buildConnectionLines(
  expandedId: string,
  elements: DiagramElement[],
  relationships: Relationship[],
): LineData[] {
  const src = elements.find(e => e.id === expandedId)
  if (!src?.position) return []

  return relationships
    .filter(r => r.from === expandedId || r.to === expandedId)
    .flatMap(r => {
      const otherId = r.from === expandedId ? r.to : r.from
      const other = elements.find(e => e.id === otherId)
      if (!other?.position) return []
      const x1 = toGrid(src.position!.x)
      const y1 = toGrid(src.position!.y)
      const x2 = toGrid(other.position.x)
      const y2 = toGrid(other.position.y)
      return [{ key: `${expandedId}-${otherId}`, x1, y1, x2, y2, length: Math.hypot(x2 - x1, y2 - y1), directed: r.directed }]
    })
}

// ── MapNode ─────────────────────────────────────────────────────────────────
// Must render inside a FocusScope (uses useFocusManager)

function MapNode({
  element,
  allElements,
  relationships,
  isFocused,
  isExpanded,
  hasPositions,
  onFocus,
  onToggleExpand,
  onSpatialNav,
  innerRef,
}: {
  element: DiagramElement
  allElements: DiagramElement[]
  relationships: Relationship[]
  isFocused: boolean
  isExpanded: boolean
  hasPositions: boolean
  onFocus: (id: string) => void
  onToggleExpand: (id: string) => void
  onSpatialNav: (id: string, dir: 'up' | 'down' | 'left' | 'right') => void
  innerRef: (el: HTMLButtonElement | null) => void
}) {
  const focusManager = useFocusManager()

  const connected = relationships
    .filter(r => r.from === element.id || r.to === element.id)
    .map(r => {
      const otherId = r.from === element.id ? r.to : r.from
      return allElements.find(e => e.id === otherId)?.label ?? otherId
    })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        onToggleExpand(element.id)
        break
      case 'ArrowRight':
        e.preventDefault()
        hasPositions ? onSpatialNav(element.id, 'right') : focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowLeft':
        e.preventDefault()
        hasPositions ? onSpatialNav(element.id, 'left') : focusManager?.focusPrevious({ wrap: true })
        break
      case 'ArrowDown':
        e.preventDefault()
        hasPositions ? onSpatialNav(element.id, 'down') : focusManager?.focusNext({ wrap: true })
        break
      case 'ArrowUp':
        e.preventDefault()
        hasPositions ? onSpatialNav(element.id, 'up') : focusManager?.focusPrevious({ wrap: true })
        break
    }
  }

  return (
    <button
      ref={innerRef}
      role="treeitem"
      aria-selected={isFocused}
      aria-expanded={connected.length > 0 ? isExpanded : undefined}
      tabIndex={0}
      onFocus={() => {
        onFocus(element.id)
        const value = element.value ? `, ${element.value}` : ''
        const rels = connected.length > 0
          ? `. Connected to ${connected.join(', ')}`
          : '. No connections'
        announce(`${element.label}, ${element.type}${value}${rels}`, 'polite')
      }}
      onKeyDown={handleKeyDown}
      style={{
        position: hasPositions ? 'absolute' : 'static',
        left: hasPositions && element.position ? `${toGrid(element.position.x)}%` : undefined,
        top: hasPositions && element.position ? `${toGrid(element.position.y)}%` : undefined,
        transform: hasPositions ? 'translate(-50%, -50%)' : undefined,
        background: isExpanded ? '#17193a' : '#0f1011',
        border: `1px solid ${isExpanded ? '#3a3f6b' : '#23252a'}`,
        borderRadius: 8,
        padding: '8px 14px',
        cursor: 'pointer',
        width: hasPositions ? 112 : '100%',
        textAlign: 'left',
        outline: 'none',
        transition: 'border-color 0.15s, background 0.15s',
        zIndex: isFocused || isExpanded ? 2 : 1,
        flexShrink: 0,
      }}
    >
      <p style={{ fontSize: 10, color: '#62666d', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {element.type}
      </p>
      <p style={{ fontSize: 13, color: '#d0d6e0', margin: '2px 0 0', fontWeight: 500 }}>
        {element.label}
      </p>
      {element.value && (
        <p style={{ fontSize: 11, color: '#5e6ad2', margin: '1px 0 0' }}>{element.value}</p>
      )}
      {isExpanded && connected.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid #23252a', paddingTop: 6 }}>
          <p style={{ fontSize: 10, color: '#62666d', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Connections
          </p>
          {connected.map((label, i) => (
            <p key={i} style={{ fontSize: 11, color: '#8a8f98', margin: '2px 0' }}>{label}</p>
          ))}
        </div>
      )}
    </button>
  )
}

// ── MapContent ───────────────────────────────────────────────────────────────
// Renders inside FocusScope; owns all refs, GSAP logic, and spatial nav

function MapContent({
  analysis,
  focusedId,
  setFocusedId,
  expandedId,
  setExpandedId,
  onEscape,
}: {
  analysis: DiagramAnalysis
  focusedId: string | null
  setFocusedId: (id: string) => void
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  onEscape: () => void
}) {
  const { elements, relationships } = analysis
  const hasPositions = elements.some(e => e.position != null)

  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const lineRefs = useRef<Map<string, SVGLineElement>>(new Map())

  const registerNode = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  const registerLine = useCallback((key: string, el: SVGLineElement | null) => {
    if (el) lineRefs.current.set(key, el)
    else lineRefs.current.delete(key)
  }, [])

  // GSAP pulse on focused node
  useEffect(() => {
    if (!focusedId) return
    const el = nodeRefs.current.get(focusedId)
    if (!el) return
    const tween = gsap.to(el, {
      boxShadow: '0 0 0 3px #5e6ad2, 0 0 16px rgba(94, 106, 210, 0.4)',
      duration: 0.75,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut',
    })
    return () => {
      tween.kill()
      gsap.set(el, { boxShadow: 'none' })
    }
  }, [focusedId])

  // GSAP draw connection lines when an element is expanded
  const lines = expandedId && hasPositions
    ? buildConnectionLines(expandedId, elements, relationships)
    : []

  useEffect(() => {
    if (!expandedId || !hasPositions || !lines.length) return
    lines.forEach(line => {
      const el = lineRefs.current.get(line.key)
      if (!el) return
      gsap.fromTo(
        el,
        { attr: { strokeDashoffset: line.length } },
        { attr: { strokeDashoffset: 0 }, duration: 0.35, ease: 'power2.out' },
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId])

  const handleSpatialNav = useCallback((id: string, dir: 'up' | 'down' | 'left' | 'right') => {
    const targetId = findNearest(elements, id, dir)
    if (targetId) nodeRefs.current.get(targetId)?.focus()
  }, [elements])

  const handleToggleExpand = useCallback((id: string) => {
    const next = expandedId === id ? null : id
    setExpandedId(next)
    if (next) {
      const el = elements.find(e => e.id === id)!
      const connected = relationships
        .filter(r => r.from === id || r.to === id)
        .map(r => {
          const otherId = r.from === id ? r.to : r.from
          return elements.find(e => e.id === otherId)?.label ?? otherId
        })
      const msg = connected.length > 0
        ? `Expanded ${el.label}. Connected to ${connected.join(', ')}.`
        : `Expanded ${el.label}. No connections.`
      announce(msg, 'assertive')
    }
  }, [expandedId, setExpandedId, elements, relationships])

  const hintText = hasPositions
    ? 'Tab · navigate   Arrow keys · spatial   Enter · expand   Escape · exit'
    : 'Tab · navigate   Arrow keys · move   Enter · expand   Escape · exit'

  return (
    <div
      role="tree"
      aria-label={`${analysis.title} diagram map`}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onEscape() } }}
      style={{ outline: 'none' }}
    >
      {hasPositions ? (
        <div style={{ position: 'relative', height: 288, width: '100%', overflow: 'visible' }}>
          {/* SVG overlay for connection lines */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
          >
            {lines.length > 0 && (
              <defs>
                <marker id="dm-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#5e6ad2" />
                </marker>
              </defs>
            )}
            {lines.map(line => (
              <line
                key={line.key}
                ref={el => registerLine(line.key, el)}
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke="#5e6ad2"
                strokeWidth="0.8"
                strokeDasharray={line.length}
                strokeDashoffset={line.length}
                strokeLinecap="round"
                markerEnd={line.directed ? 'url(#dm-arrow)' : undefined}
              />
            ))}
          </svg>

          {elements.map(element => (
            <MapNode
              key={element.id}
              element={element}
              allElements={elements}
              relationships={relationships}
              isFocused={focusedId === element.id}
              isExpanded={expandedId === element.id}
              hasPositions
              onFocus={setFocusedId}
              onToggleExpand={handleToggleExpand}
              onSpatialNav={handleSpatialNav}
              innerRef={el => registerNode(element.id, el)}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {elements.map(element => (
            <MapNode
              key={element.id}
              element={element}
              allElements={elements}
              relationships={relationships}
              isFocused={focusedId === element.id}
              isExpanded={expandedId === element.id}
              hasPositions={false}
              onFocus={setFocusedId}
              onToggleExpand={handleToggleExpand}
              onSpatialNav={handleSpatialNav}
              innerRef={el => registerNode(element.id, el)}
            />
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: '#3e3e44', marginTop: 12, textAlign: 'center' }}>
        {hintText}
      </p>
    </div>
  )
}

// ── DiagramMap ───────────────────────────────────────────────────────────────

export function DiagramMap({ analysis }: { analysis: DiagramAnalysis }) {
  const [mapActive, setMapActive] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleEnter = () => {
    setMapActive(true)
    announce(
      `Entering diagram map for ${analysis.title}. ${analysis.elements.length} elements. Tab to navigate, Enter to expand, Escape to exit.`,
      'assertive',
    )
  }

  const handleEscape = useCallback(() => {
    setMapActive(false)
    setFocusedId(null)
    setExpandedId(null)
  }, [])

  return (
    <div
      style={{
        background: '#0f1011',
        border: '1px solid #23252a',
        borderRadius: 12,
        padding: 24,
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: mapActive ? 20 : 0 }}>
        <div>
          <p style={{ fontSize: 11, color: '#62666d', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Diagram map
          </p>
          <p style={{ fontSize: 15, color: '#d0d6e0', margin: '4px 0 0', fontWeight: 500 }}>
            {analysis.title}
          </p>
          <p style={{ fontSize: 12, color: '#62666d', margin: '2px 0 0' }}>
            {analysis.elements.length} element{analysis.elements.length !== 1 ? 's' : ''}
            {analysis.relationships.length > 0
              ? ` · ${analysis.relationships.length} relationship${analysis.relationships.length !== 1 ? 's' : ''}`
              : ''}
          </p>
        </div>

        <button
          onClick={mapActive ? handleEscape : handleEnter}
          aria-pressed={mapActive}
          style={{
            background: mapActive ? '#17193a' : '#0f1011',
            border: `1px solid ${mapActive ? '#5e6ad2' : '#34343a'}`,
            borderRadius: 8,
            padding: '8px 16px',
            color: mapActive ? '#828fff' : '#8a8f98',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {mapActive ? 'Exit map' : 'Enter map mode'}
        </button>
      </div>

      {/* Map content — FocusScope traps Tab when active */}
      {mapActive ? (
        <FocusScope contain restoreFocus autoFocus>
          <MapContent
            analysis={analysis}
            focusedId={focusedId}
            setFocusedId={setFocusedId}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onEscape={handleEscape}
          />
        </FocusScope>
      ) : (
        <p style={{ fontSize: 13, color: '#3e3e44', marginTop: 20, textAlign: 'center', padding: '16px 0' }}>
          Activate map mode to navigate all diagram elements with keyboard and screen reader
        </p>
      )}
    </div>
  )
}
