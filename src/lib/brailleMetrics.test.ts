import { describe, it, expect } from 'vitest'
import { brailleFootprintMm, CELL_W, LINE_H } from './brailleMetrics'
import { buildTactilePlan } from '@/lib/svg/tactilePlanner'
import type { DiagramAnalysis } from '@/types/diagram'
import type { Bbox } from '@/types/tactile'

// ── brailleFootprintMm ────────────────────────────────────────────────────────

describe('brailleFootprintMm', () => {
  it('returns one line height for a single short word', () => {
    const { heightMm } = brailleFootprintMm('hi', 180)
    expect(heightMm).toBe(LINE_H)
  })

  it('returns correct width for a known cell count', () => {
    // 'abc' → 3 braille cells → 3 * CELL_W mm
    const { widthMm } = brailleFootprintMm('abc', 180)
    expect(widthMm).toBe(3 * CELL_W)
  })

  it('wraps to two lines when text exceeds maxWidthMm', () => {
    // A very narrow column forces wrapping
    const { heightMm } = brailleFootprintMm('hello world', 10)
    expect(heightMm).toBe(2 * LINE_H)
  })

  it('returns a single line height for an empty string', () => {
    const { heightMm } = brailleFootprintMm('', 180)
    expect(heightMm).toBe(LINE_H)
  })

  it('never exceeds maxWidthMm', () => {
    const maxW = 50
    const { widthMm } = brailleFootprintMm('a very long label with many words', maxW)
    expect(widthMm).toBeLessThanOrEqual(maxW)
  })
})

// ── collision placement ───────────────────────────────────────────────────────

function bboxOverlaps(a: Bbox, b: Bbox, pad = 2): boolean {
  return (
    a.x - pad < b.x + b.w + pad &&
    a.x + a.w + pad > b.x - pad &&
    a.y - pad < b.y + b.h + pad &&
    a.y + a.h + pad > b.y - pad
  )
}

function makeCyclicAnalysis(n: number): DiagramAnalysis {
  const elements = Array.from({ length: n }, (_, i) => ({
    id: `el${i}`,
    type: i === 0 ? 'battery' : 'resistor',
    label: i === 0 ? '9V Battery' : `Resistor ${i}`,
    value: i === 0 ? '9V' : `${i * 100}Ohm`,
    relationships: [],
    position: undefined,
    visualShape: undefined,
  }))
  const relationships = elements.map((el, i) => ({
    from: el.id,
    to: elements[(i + 1) % n].id,
    type: 'connects',
    directed: false,
  }))
  return {
    title: 'Test Circuit',
    summary: 'A simple test circuit with components connected in a loop.',
    layoutHint: 'cyclic',
    elements,
    relationships,
    narration: [],
  }
}

describe('placeAllMarkers — collision guarantees', () => {
  it('no marker bbox overlaps any component bbox in a cyclic diagram', () => {
    const plan = buildTactilePlan(makeCyclicAnalysis(4))
    const components = plan.objects.filter(o => o.role === 'component' && o.bboxMm)
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)

    for (const comp of components) {
      for (const marker of markers) {
        expect(bboxOverlaps(comp.bboxMm!, marker.bboxMm!)).toBe(false)
      }
    }
  })

  it('no marker bbox overlaps any wire bbox in a cyclic diagram', () => {
    const plan = buildTactilePlan(makeCyclicAnalysis(4))
    const wires = plan.objects.filter(o => o.role === 'wire' && o.bboxMm)
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)

    for (const wire of wires) {
      for (const marker of markers) {
        expect(bboxOverlaps(wire.bboxMm!, marker.bboxMm!)).toBe(false)
      }
    }
  })

  it('markers are placed for all components', () => {
    const plan = buildTactilePlan(makeCyclicAnalysis(5))
    const componentCount = plan.objects.filter(o => o.role === 'component' && o.marker).length
    const markerCount = plan.objects.filter(o => o.role === 'marker').length
    expect(markerCount).toBe(componentCount)
  })
})

// ── key hard-stop ─────────────────────────────────────────────────────────────

describe('key hard-stop', () => {
  it('key entries do not exceed page bottom margin', () => {
    const plan = buildTactilePlan(makeCyclicAnalysis(8))
    const { page, drawingArea } = plan
    const keySepY = drawingArea.yMm + drawingArea.heightMm + 5
    const availableH = page.heightMm - page.marginMm - keySepY
    const usedH = plan.key.reduce((s, e) => s + e.heightMm, 0)
    // Available space should be non-negative (key fits or a warning was issued)
    const hasOverflowWarning = plan.warnings.some(w => w.code === 'TEXT_OVERFLOW')
    if (!hasOverflowWarning) {
      expect(usedH).toBeLessThanOrEqual(availableH + 0.01)
    }
  })

  it('keySepY derived from drawingArea matches collision zone', () => {
    const plan = buildTactilePlan(makeCyclicAnalysis(4))
    const { drawingArea } = plan
    // The key separator must sit immediately below the drawing area
    const expectedKeySepY = drawingArea.yMm + drawingArea.heightMm + 5
    // No marker should appear below keySepY
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)
    for (const m of markers) {
      expect(m.bboxMm!.y).toBeLessThan(expectedKeySepY)
    }
  })
})
