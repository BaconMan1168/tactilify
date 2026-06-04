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

describe('buildTactilePlan cyclic spatial preservation', () => {
  it('preserves analyzed component positions instead of redistributing them on a normalized loop', async () => {
    const plan = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const battery = plan.objects.find(o => o.sourceElementId === 'bat')
    const resistor = plan.objects.find(o => o.sourceElementId === 'res')

    expect(battery?.xMm).toBeCloseTo(plan.drawingArea.xMm + 0.12 * plan.drawingArea.widthMm, 1)
    expect(battery?.yMm).toBeCloseTo(plan.drawingArea.yMm + 0.50 * plan.drawingArea.heightMm, 1)
    expect(resistor?.xMm).toBeCloseTo(plan.drawingArea.xMm + 0.35 * plan.drawingArea.widthMm, 1)
    expect(resistor?.yMm).toBeCloseTo(plan.drawingArea.yMm + 0.15 * plan.drawingArea.heightMm, 1)
  })

  it('preserves relationship waypoints as tactile connection bends', async () => {
    const plan = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const batteryToResistor = plan.connections.find(c => c.from === 'bat' && c.to === 'res')

    expect(batteryToResistor?.path).toHaveLength(3)
    expect(batteryToResistor?.path[1].xMm).toBeCloseTo(plan.drawingArea.xMm + 0.12 * plan.drawingArea.widthMm, 1)
    expect(batteryToResistor?.path[1].yMm).toBeCloseTo(plan.drawingArea.yMm + 0.15 * plan.drawingArea.heightMm, 1)
  })

  it('uses preserved wire geometry to orient vertical circuit symbols', async () => {
    const plan = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const battery = plan.objects.find(o => o.sourceElementId === 'bat')
    const resistor = plan.objects.find(o => o.sourceElementId === 'res')

    expect(battery?.rotationDeg).toBe(90)
    expect(resistor?.rotationDeg).toBe(0)
  })
})

describe('buildTactilePlan key sizing', () => {
  it('includes the key heading in the reserved key zone height', async () => {
    const plan = await buildTactilePlan(makeSpatialCyclicPageSpec())
    const requiredKeyHeight = plan.key.reduce((sum, entry) => sum + entry.heightMm, 10)

    expect(plan.keyZone.heightMm).toBeGreaterThanOrEqual(requiredKeyHeight)
  })
})
