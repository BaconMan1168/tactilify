import { describe, it, expect } from 'vitest'
import { buildTactilePlan } from './tactilePlanner'
import type { TactilePageSpec } from '@/types/tactile'

function makeSpatialCyclicPageSpec(): TactilePageSpec {
  return {
    pageType: 'single',
    purpose: 'Series Circuit',
    domain: 'circuit',
    tactileStrategy: 'direct-symbol-diagram',
    title: 'Series Circuit',
    explorationInstructions: 'Start at the battery on the left and trace clockwise.',
    pageNumber: 1,
    totalPages: 1,
    elements: [
      { id: 'bat', label: '9V Battery', type: 'battery', value: '9V', symbolHint: 'battery', componentShape: 'battery-symbol', position: { x: 0.12, y: 0.50 } },
      { id: 'res', label: '100 ohm resistor', type: 'resistor', value: '100Ω', symbolHint: 'resistor', componentShape: 'resistor-symbol', position: { x: 0.35, y: 0.15 } },
      { id: 'cap', label: '47 microfarad capacitor', type: 'capacitor', value: '47μF', symbolHint: 'capacitor', componentShape: 'capacitor-symbol', position: { x: 0.62, y: 0.15 } },
      { id: 'lamp', label: 'Lamp L1', type: 'lamp', symbolHint: 'lamp', componentShape: 'lamp-symbol', position: { x: 0.90, y: 0.48 } },
      { id: 'sw', label: 'Switch SW1', type: 'switch', symbolHint: 'switch', componentShape: 'switch-symbol', position: { x: 0.58, y: 0.88 } },
    ],
    relationships: [
      { from: 'bat', to: 'res', type: 'connected-to', directed: false, waypoints: [{ x: 0.12, y: 0.15 }] },
      { from: 'res', to: 'cap', type: 'connected-to', directed: false, waypoints: [] },
      { from: 'cap', to: 'lamp', type: 'connected-to', directed: false, waypoints: [{ x: 0.90, y: 0.15 }] },
      { from: 'lamp', to: 'sw', type: 'connected-to', directed: false, waypoints: [{ x: 0.90, y: 0.88 }] },
      { from: 'sw', to: 'bat', type: 'connected-to', directed: false, waypoints: [{ x: 0.12, y: 0.88 }] },
    ],
  }
}

describe('buildTactilePlan cyclic loop distribution', () => {
  it('places all components on the loop perimeter (not at original schematic positions)', async () => {
    const [plan] = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const battery = plan.objects.find(o => o.sourceElementId === 'bat')

    // Battery's original position maps to (drawing.x + 0.12*w, drawing.y + 0.50*h).
    // Loop distribution should NOT land exactly there.
    expect(battery?.xMm).not.toBeCloseTo(plan.drawingArea.xMm + 0.12 * plan.drawingArea.widthMm, 0)

    // All components must be within drawing-area bounds (with symbol half-width tolerance).
    const components = plan.objects.filter(o => o.role === 'component')
    for (const comp of components) {
      expect(comp.xMm).toBeGreaterThanOrEqual(plan.drawingArea.xMm - 20)
      expect(comp.xMm).toBeLessThanOrEqual(plan.drawingArea.xMm + plan.drawingArea.widthMm + 20)
      expect(comp.yMm).toBeGreaterThanOrEqual(plan.drawingArea.yMm - 10)
      expect(comp.yMm).toBeLessThanOrEqual(plan.drawingArea.yMm + plan.drawingArea.heightMm + 10)
    }
  })

  it('uses loop wire objects rather than relationship connection edges', async () => {
    const [plan] = await buildTactilePlan(makeSpatialCyclicPageSpec())

    // Cyclic loop layout encodes connectivity in wire objects, not in plan.connections.
    expect(plan.connections).toHaveLength(0)

    const loopWires = plan.objects.filter(o => o.role === 'wire')
    expect(loopWires.length).toBeGreaterThan(0)
  })

  it('orients circuit symbols to 0° or 90° based on loop-side wire direction', async () => {
    const [plan] = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const components = plan.objects.filter(o => o.role === 'component' && o.rotationDeg !== undefined)

    for (const comp of components) {
      expect([0, 90]).toContain(comp.rotationDeg)
    }
  })
})

describe('buildTactilePlan key sizing', () => {
  it('reference page (pageType key) has an expanded key zone that fits all entries', async () => {
    const refSpec = { ...makeSpatialCyclicPageSpec(), pageType: 'key' as const }
    const [plan] = await buildTactilePlan(refSpec)
    const requiredKeyHeight = plan.key.reduce((sum, entry) => sum + entry.heightMm, 10)

    expect(plan.keyZone.heightMm).toBeGreaterThanOrEqual(requiredKeyHeight)
    expect(plan.objects).toHaveLength(0)
    expect(plan.connections).toHaveLength(0)
  })
})
