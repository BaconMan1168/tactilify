import { describe, it, expect } from 'vitest'
import { brailleFootprintMm, CELL_W, LINE_H } from './brailleMetrics'
import { buildTactilePlan } from '@/lib/svg/tactilePlanner'
import type { TactilePageSpec } from '@/types/tactile'
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

function makeCyclicPageSpec(n: number): TactilePageSpec {
  const elements = Array.from({ length: n }, (_, i) => ({
    id: `el${i}`,
    type: i === 0 ? 'battery' : 'resistor',
    label: i === 0 ? '9V Battery' : `Resistor ${i}`,
    value: i === 0 ? '9V' : `${i * 100}Ohm`,
    position: undefined,
    visualShape: undefined as 'rect' | 'circle' | 'diamond' | 'ellipse' | 'arrow' | undefined,
    symbolHint: i === 0 ? 'battery' : 'resistor',
  }))
  const relationships = elements.map((el, i) => ({
    from: el.id,
    to: elements[(i + 1) % n].id,
    type: 'connects',
    directed: false,
  }))
  return {
    pageType: 'single',
    purpose: 'Test Circuit',
    domain: 'circuit',
    tactileStrategy: 'direct-symbol-diagram',
    elements,
    relationships,
    title: 'Test Circuit',
    explorationInstructions: 'Trace the loop.',
    pageNumber: 1,
    totalPages: 1,
  }
}

describe('placeAllMarkers — collision guarantees', () => {
  it('no marker bbox overlaps any component bbox in a cyclic diagram', async () => {
    const plan = await buildTactilePlan(makeCyclicPageSpec(4))
    const components = plan.objects.filter(o => o.role === 'component' && o.bboxMm)
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)

    for (const comp of components) {
      for (const marker of markers) {
        expect(bboxOverlaps(comp.bboxMm!, marker.bboxMm!)).toBe(false)
      }
    }
  })

  it('no marker bbox overlaps any wire bbox in a cyclic diagram', async () => {
    const plan = await buildTactilePlan(makeCyclicPageSpec(4))
    const wires = plan.objects.filter(o => o.role === 'wire' && o.bboxMm)
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)

    for (const wire of wires) {
      for (const marker of markers) {
        expect(bboxOverlaps(wire.bboxMm!, marker.bboxMm!)).toBe(false)
      }
    }
  })

  it('markers are placed for all components', async () => {
    const plan = await buildTactilePlan(makeCyclicPageSpec(5))
    const componentCount = plan.objects.filter(o => o.role === 'component' && o.marker).length
    const markerCount = plan.objects.filter(o => o.role === 'marker').length
    expect(markerCount).toBe(componentCount)
  })
})

// ── key hard-stop ─────────────────────────────────────────────────────────────

describe('key hard-stop', () => {
  it('key entries do not exceed page bottom margin', async () => {
    const plan = await buildTactilePlan(makeCyclicPageSpec(8))
    const { keyZone } = plan
    const usedH = plan.key.reduce((s, e) => s + e.heightMm, 0)
    const hasOverflowWarning = plan.warnings.some(w => w.code === 'TEXT_OVERFLOW')
    if (!hasOverflowWarning) {
      expect(usedH).toBeLessThanOrEqual(keyZone.heightMm + 0.01)
    }
  })

  it('no marker appears in the key zone (drawing area is below key in BANA layout)', async () => {
    const plan = await buildTactilePlan(makeCyclicPageSpec(4))
    const { drawingArea } = plan
    const markers = plan.objects.filter(o => o.role === 'marker' && o.bboxMm)
    for (const m of markers) {
      // BANA order: title → instructions → key → drawing; markers must be in drawing area
      expect(m.bboxMm!.y).toBeGreaterThanOrEqual(drawingArea.yMm - 5)
    }
  })
})
