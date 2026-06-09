'use client'
import { Button } from '@/components/ui/button'
import { TexturePicker } from './TexturePicker'
import type { BBox, PatternType } from '@/types/editor'

interface PropertiesPanelProps {
  selectedElement: SVGElement | null
  selectionBbox: BBox | null
  onCommit: () => void
  onDelete: () => void
  onPatternChange: (type: PatternType) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label style={{ fontSize: 11, color: '#62666d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#141516',
  border: '1px solid #23252a',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 13,
  color: '#f7f8f8',
  width: '100%',
  outline: 'none',
}

const readOnlyStyle: React.CSSProperties = { ...inputStyle, color: '#62666d' }

export function PropertiesPanel({ selectedElement, selectionBbox, onCommit, onDelete, onPatternChange }: PropertiesPanelProps) {
  if (!selectedElement) {
    return (
      <div
        className="flex items-center justify-center h-full p-4"
        style={{ width: 200, background: '#0f1011', borderLeft: '1px solid #23252a', fontSize: 13, color: '#3e3e44', textAlign: 'center', lineHeight: 1.5 }}
        aria-live="polite"
      >
        Select an element<br />to edit its properties
      </div>
    )
  }

  const x = Math.round(selectionBbox?.x ?? 0)
  const y = Math.round(selectionBbox?.y ?? 0)
  const w = Math.round(selectionBbox?.width ?? 0)
  const h = Math.round(selectionBbox?.height ?? 0)

  const strokeWidth = parseFloat(selectedElement.getAttribute('stroke-width') ?? '') || 2.5
  const patternType = (selectedElement.getAttribute('data-pattern-type') ?? 'none') as PatternType
  const isText = selectedElement.tagName.toLowerCase() === 'text'

  return (
    <div
      className="flex flex-col gap-3 p-3 overflow-y-auto"
      style={{ width: 200, background: '#0f1011', borderLeft: '1px solid #23252a', height: '100%' }}
      role="complementary"
      aria-label="Element properties"
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: '#8a8f98', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Properties
      </span>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <input type="number" value={x} readOnly style={readOnlyStyle} aria-label="X position" />
        </Field>
        <Field label="Y">
          <input type="number" value={y} readOnly style={readOnlyStyle} aria-label="Y position" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="W">
          <input type="number" value={w} readOnly style={readOnlyStyle} aria-label="Width" />
        </Field>
        <Field label="H">
          <input type="number" value={h} readOnly style={readOnlyStyle} aria-label="Height" />
        </Field>
      </div>

      {!isText && (
        <Field label="Stroke width">
          <input
            type="number"
            defaultValue={strokeWidth}
            step={0.5}
            min={0}
            key={selectedElement.getAttribute('stroke-width') ?? strokeWidth}
            style={inputStyle}
            aria-label="Stroke width"
            onChange={e => {
              selectedElement.setAttribute('stroke-width', e.target.value)
              onCommit()
            }}
          />
        </Field>
      )}

      {!isText && (
        <TexturePicker current={patternType} onChange={onPatternChange} />
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        aria-label="Delete selected element"
        className="w-full mt-auto"
        style={{ background: '#2a1515', color: '#e07070', border: '1px solid #4a2020', borderRadius: 6, fontSize: 13 }}
      >
        Delete
      </Button>
    </div>
  )
}
