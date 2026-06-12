'use client'
import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
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

export interface PropertiesPanelHandle {
  focusTextInput: () => void
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
  cursor: 'text',
}

// Apply a single bbox field change to the underlying SVG element.
function applyBBoxField(
  el: SVGElement,
  field: 'x' | 'y' | 'w' | 'h',
  newVal: number,
  currentBBox: BBox,
): void {
  const tag = el.tagName.toLowerCase()
  const v = (n: number) => n.toFixed(2)

  switch (tag) {
    case 'rect':
      if (field === 'x') el.setAttribute('x', v(newVal))
      else if (field === 'y') el.setAttribute('y', v(newVal))
      else if (field === 'w') el.setAttribute('width', v(Math.max(1, newVal)))
      else if (field === 'h') el.setAttribute('height', v(Math.max(1, newVal)))
      break
    case 'ellipse':
      if (field === 'x') el.setAttribute('cx', v(newVal + currentBBox.width / 2))
      else if (field === 'y') el.setAttribute('cy', v(newVal + currentBBox.height / 2))
      else if (field === 'w') el.setAttribute('rx', v(Math.max(0.5, newVal) / 2))
      else if (field === 'h') el.setAttribute('ry', v(Math.max(0.5, newVal) / 2))
      break
    case 'circle':
      if (field === 'x') el.setAttribute('cx', v(newVal + currentBBox.width / 2))
      else if (field === 'y') el.setAttribute('cy', v(newVal + currentBBox.height / 2))
      else if (field === 'w' || field === 'h') el.setAttribute('r', v(Math.max(0.5, newVal) / 2))
      break
    case 'text':
      if (field === 'x') el.setAttribute('x', v(newVal))
      else if (field === 'y') el.setAttribute('y', v(newVal))
      break
  }
}

export const PropertiesPanel = forwardRef<PropertiesPanelHandle, PropertiesPanelProps>(
  function PropertiesPanel({ selectedElement, selectionBbox, onCommit, onDelete, onPatternChange }, ref) {
    const textInputRef = useRef<HTMLTextAreaElement>(null)

    const autoResize = () => {
      const ta = textInputRef.current
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }

    useImperativeHandle(ref, () => ({
      focusTextInput: () => {
        if (textInputRef.current) {
          textInputRef.current.focus()
          textInputRef.current.select()
        }
      },
    }))

    // Auto-resize whenever the selected element changes
    useEffect(() => {
      autoResize()
    }, [selectedElement])

    // Ensure text textarea is visible after element changes to a text node
    useEffect(() => {
      if (selectedElement?.tagName.toLowerCase() === 'text') {
        const t = setTimeout(() => { textInputRef.current?.focus(); autoResize() }, 50)
        return () => clearTimeout(t)
      }
    }, [selectedElement])

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

    const bbox = selectionBbox ?? { x: 0, y: 0, width: 0, height: 0 }
    const x = parseFloat(bbox.x.toFixed(1))
    const y = parseFloat(bbox.y.toFixed(1))
    const w = parseFloat(bbox.width.toFixed(1))
    const h = parseFloat(bbox.height.toFixed(1))

    const strokeWidth = parseFloat(selectedElement.getAttribute('stroke-width') ?? '') || 0.7
    const patternType = (selectedElement.getAttribute('data-pattern-type') ?? 'none') as PatternType
    const tag = selectedElement.tagName.toLowerCase()
    const isText = tag === 'text'
    const isLine = tag === 'line'
    const hasSimpleGeometry = ['rect', 'ellipse', 'circle', 'text', 'line'].includes(tag)

    const stopAndHandle = <T extends HTMLInputElement | HTMLTextAreaElement>(
      next: (e: React.KeyboardEvent<T>) => void
    ) => (e: React.KeyboardEvent<T>) => {
      e.stopPropagation()
      next(e)
    }

    const makeGeomHandler = (field: 'x' | 'y' | 'w' | 'h') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value)
        if (isNaN(val)) return
        applyBBoxField(selectedElement, field, val, bbox)
        onCommit()
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

        {isText && (
          <Field label="Text">
            <textarea
              ref={textInputRef}
              defaultValue={selectedElement.textContent ?? ''}
              key={selectedElement.textContent ?? ''}
              rows={1}
              style={{
                ...inputStyle,
                resize: 'none',
                overflow: 'hidden',
                lineHeight: 1.5,
                minHeight: 28,
              }}
              aria-label="Text content"
              onChange={e => {
                autoResize()
                // eslint-disable-next-line react-hooks/immutability
                selectedElement.textContent = e.target.value
              }}
              onKeyDown={stopAndHandle(e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  // eslint-disable-next-line react-hooks/immutability
                  selectedElement.textContent = (e.target as HTMLTextAreaElement).value
                  onCommit()
                  ;(e.target as HTMLTextAreaElement).blur()
                }
              })}
              onBlur={e => {
                // eslint-disable-next-line react-hooks/immutability
                selectedElement.textContent = e.target.value
                onCommit()
              }}
            />
          </Field>
        )}

        {hasSimpleGeometry && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="X (mm)">
                <input
                  type="number"
                  defaultValue={x}
                  key={`x-${x}`}
                  step={0.5}
                  style={inputStyle}
                  aria-label="X position"
                  onBlur={makeGeomHandler('x')}
                  onKeyDown={stopAndHandle(e => { if (e.key === 'Enter') makeGeomHandler('x')(e as unknown as React.ChangeEvent<HTMLInputElement>) })}
                />
              </Field>
              <Field label="Y (mm)">
                <input
                  type="number"
                  defaultValue={y}
                  key={`y-${y}`}
                  step={0.5}
                  style={inputStyle}
                  aria-label="Y position"
                  onBlur={makeGeomHandler('y')}
                  onKeyDown={stopAndHandle(e => { if (e.key === 'Enter') makeGeomHandler('y')(e as unknown as React.ChangeEvent<HTMLInputElement>) })}
                />
              </Field>
            </div>

            {!isLine && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="W (mm)">
                  <input
                    type="number"
                    defaultValue={w}
                    key={`w-${w}`}
                    step={0.5}
                    min={0.5}
                    style={inputStyle}
                    aria-label="Width"
                    onBlur={makeGeomHandler('w')}
                    onKeyDown={stopAndHandle(e => { if (e.key === 'Enter') makeGeomHandler('w')(e as unknown as React.ChangeEvent<HTMLInputElement>) })}
                  />
                </Field>
                <Field label="H (mm)">
                  <input
                    type="number"
                    defaultValue={h}
                    key={`h-${h}`}
                    step={0.5}
                    min={0.5}
                    style={inputStyle}
                    aria-label="Height"
                    onBlur={makeGeomHandler('h')}
                    onKeyDown={stopAndHandle(e => { if (e.key === 'Enter') makeGeomHandler('h')(e as unknown as React.ChangeEvent<HTMLInputElement>) })}
                  />
                </Field>
              </div>
            )}
          </>
        )}

        {!isText && (
          <Field label="Stroke width">
            <input
              type="number"
              defaultValue={strokeWidth}
              step={0.1}
              min={0}
              key={selectedElement.getAttribute('stroke-width') ?? strokeWidth}
              style={inputStyle}
              aria-label="Stroke width"
              onKeyDown={e => e.stopPropagation()}
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
          style={{ background: '#2a1515', color: '#e07070', border: '1px solid #4a2020', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
        >
          Delete
        </Button>
      </div>
    )
  }
)
