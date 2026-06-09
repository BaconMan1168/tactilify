'use client'
import type * as fabric from 'fabric'
import { Button } from '@/components/ui/button'
import { TexturePicker } from './TexturePicker'
import type { PatternType } from '@/lib/patternAdapter'

interface PropertiesPanelProps {
  selectedObject: fabric.FabricObject | null
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

export function PropertiesPanel({ selectedObject, onDelete, onPatternChange }: PropertiesPanelProps) {
  if (!selectedObject) {
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

  const isBraille = (selectedObject as fabric.FabricObject & { 'data-braille'?: boolean })['data-braille']
  const isIText = selectedObject.type === 'i-text' || selectedObject.type === 'text'
  const patternType = ((selectedObject as fabric.FabricObject & { 'data-pattern-type'?: string })['data-pattern-type'] ?? 'none') as PatternType

  const x = Math.round(selectedObject.left ?? 0)
  const y = Math.round(selectedObject.top ?? 0)
  const w = Math.round((selectedObject.width ?? 0) * (selectedObject.scaleX ?? 1))
  const h = Math.round((selectedObject.height ?? 0) * (selectedObject.scaleY ?? 1))
  const angle = Math.round(selectedObject.angle ?? 0)
  const strokeWidth = typeof selectedObject.strokeWidth === 'number' ? selectedObject.strokeWidth : 2.5

  function updateProp(key: string, value: number | string) {
    const canvas = selectedObject?.canvas
    if (!selectedObject || !canvas) return
    selectedObject.set(key as keyof fabric.FabricObject, value as never)
    selectedObject.setCoords()
    canvas.renderAll()
    canvas.fire('object:modified', { target: selectedObject })
  }

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
          <input
            type="number"
            value={x}
            style={inputStyle}
            aria-label="X position"
            onChange={e => updateProp('left', Number(e.target.value))}
          />
        </Field>
        <Field label="Y">
          <input
            type="number"
            value={y}
            style={inputStyle}
            aria-label="Y position"
            onChange={e => updateProp('top', Number(e.target.value))}
          />
        </Field>
      </div>

      {!isIText && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="W">
            <input type="number" value={w} readOnly style={{ ...inputStyle, color: '#62666d' }} aria-label="Width" />
          </Field>
          <Field label="H">
            <input type="number" value={h} readOnly style={{ ...inputStyle, color: '#62666d' }} aria-label="Height" />
          </Field>
        </div>
      )}

      <Field label="Rotate">
        <input
          type="number"
          value={angle}
          style={inputStyle}
          aria-label="Rotation angle in degrees"
          onChange={e => updateProp('angle', Number(e.target.value))}
        />
      </Field>

      {!isIText && (
        <Field label="Stroke width">
          <input
            type="number"
            value={strokeWidth}
            step={0.5}
            min={0}
            style={inputStyle}
            aria-label="Stroke width"
            onChange={e => updateProp('strokeWidth', Number(e.target.value))}
          />
        </Field>
      )}

      {isBraille && (
        <Field label="Braille character">
          <input
            type="text"
            value={(selectedObject as fabric.IText)?.text ?? ''}
            maxLength={20}
            style={inputStyle}
            aria-label="Unicode braille character"
            aria-describedby="braille-note"
            onChange={e => {
              const iText = selectedObject as fabric.IText
              iText.set('text', e.target.value)
              iText.setCoords()
              selectedObject.canvas?.renderAll()
              selectedObject.canvas?.fire('object:modified', { target: selectedObject })
            }}
          />
          <span id="braille-note" style={{ fontSize: 10, color: '#62666d', lineHeight: 1.4 }}>
            Dots regenerate on export
          </span>
        </Field>
      )}

      {!isIText && !isBraille && (
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
