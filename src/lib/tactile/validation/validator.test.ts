import { describe, it, expect } from 'vitest'
import { validateTactile } from './validator'
import type { TactilePlan, TactileObject } from '@/types/tactile'
import type { DiagramAnalysis } from '@/types/diagram'
import type { PageProfile } from '../layout/page-profiles'

const a4: PageProfile = {
  id: 'a4', name: 'A4', widthMm: 210, heightMm: 297, marginMm: 15,
  drawingZone: { xMm: 15, yMm: 15, widthMm: 180, heightMm: 267 },
}

function makeObj(id: string, x: number, y: number, w = 20, h = 15): TactileObject {
  return {
    id, role: 'component', shape: 'rect', xMm: x, yMm: y,
    bboxMm: { x, y, w, h },
  }
}

function makePlan(objects: TactileObject[]): TactilePlan {
  return {
    page: { widthMm: 210, heightMm: 297, marginMm: 15, orientation: 'portrait' },
    titleZone: { xMm: 15, yMm: 15, widthMm: 180, heightMm: 10 },
    drawingArea: { xMm: 15, yMm: 50, widthMm: 180, heightMm: 220 },
    instructionsZone: { xMm: 15, yMm: 27, widthMm: 180, heightMm: 10 },
    keyZone: { xMm: 15, yMm: 39, widthMm: 180, heightMm: 10 },
    layoutHint: 'none', layout: 'grid',
    title: 'Test', explorationInstructions: '',
    objects, connections: [], key: [], transcriberNotes: [], warnings: [],
  }
}

const emptyAnalysis = { layoutHint: 'none', title: 'Test', elements: [], relationships: [], narration: [], explorationInstructions: null } as unknown as DiagramAnalysis

describe('validateTactile', () => {
  it('passes STRUCT-001 when there are component objects', () => {
    const report = validateTactile(emptyAnalysis, [makePlan([makeObj('a', 20, 20)])], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'STRUCT-001')!
    expect(check.status).toBe('passed')
  })

  it('fails STRUCT-001 when no component objects', () => {
    const plan = makePlan([{ id: 'w1', role: 'wire', shape: 'wire', xMm: 0, yMm: 0 }])
    const report = validateTactile(emptyAnalysis, [plan], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'STRUCT-001')!
    expect(check.status).toBe('failed')
    expect(report.overallStatus).toBe('failed')
  })

  it('fails SVG-001 when SVG string is empty', () => {
    const report = validateTactile(emptyAnalysis, [makePlan([makeObj('a', 20, 20)])], [''], a4)
    const check = report.checks.find(c => c.code === 'SVG-001')!
    expect(check.status).toBe('failed')
  })

  it('fails PAGE-001 when element overflows drawing zone', () => {
    // Object at x=200 overflows a4 drawing zone (xMm+widthMm = 15+180 = 195)
    const report = validateTactile(emptyAnalysis, [makePlan([makeObj('a', 200, 20)])], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'PAGE-001')!
    expect(check.status).toBe('failed')
    expect(check.affectedIds).toContain('a')
  })

  it('fails COL-001 when two nodes overlap within clearance', () => {
    const report = validateTactile(
      emptyAnalysis,
      [makePlan([makeObj('a', 20, 20), makeObj('b', 22, 22)])],
      ['<svg></svg>'], a4,
    )
    const check = report.checks.find(c => c.code === 'COL-001')!
    expect(check.status).toBe('failed')
  })

  it('passes COL-001 when nodes are well-separated', () => {
    const report = validateTactile(
      emptyAnalysis,
      [makePlan([makeObj('a', 20, 20), makeObj('b', 80, 80)])],
      ['<svg></svg>'], a4,
    )
    const check = report.checks.find(c => c.code === 'COL-001')!
    expect(check.status).toBe('passed')
  })

  it('does not flag wire objects for COL-001', () => {
    const wire: TactileObject = { id: 'w', role: 'wire', shape: 'wire', xMm: 20, yMm: 20, bboxMm: { x: 20, y: 20, w: 100, h: 1 } }
    const node: TactileObject = makeObj('n', 20, 20)
    const report = validateTactile(emptyAnalysis, [makePlan([node, wire])], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'COL-001')!
    expect(check.affectedIds).not.toContain('w')
  })

  it('warns LABEL-001 when label count exceeds 12', () => {
    const objects = Array.from({ length: 13 }, (_, i) => makeObj(`e${i}`, 20 + i * 5, 20 + i * 5))
    const plan = makePlan(objects)
    // Add key entries to trigger the label count
    plan.key = objects.map((_, i) => ({ marker: String(i + 1), elementId: `e${i}`, text: `label ${i}`, normalizedText: `label ${i}`, heightMm: 5 }))
    const report = validateTactile(emptyAnalysis, [plan], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'LABEL-001')!
    expect(check.status).toBe('warning')
  })
})
