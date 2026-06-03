import { describe, it, expect } from 'vitest'
import {
  normalizeSymbolHint,
  KNOWN_SYMBOLS,
  classifyDomain,
  shouldTriggerClaudeCall,
  resolveSymbol,
  fallbackExplorationInstructions,
  selectStrategy,
} from './tactileAdaptor'
import type { DiagramAnalysis } from '@/types/diagram'

// ── normalizeSymbolHint ───────────────────────────────────────────────────────

describe('normalizeSymbolHint', () => {
  it('lowercases input', () => {
    expect(normalizeSymbolHint('Battery')).toBe('battery')
    expect(normalizeSymbolHint('RESISTOR')).toBe('resistor')
  })

  it('replaces spaces and underscores with hyphens', () => {
    expect(normalizeSymbolHint('cell wall')).toBe('cell-wall')
    expect(normalizeSymbolHint('right_angle_mark')).toBe('right-angle-mark')
    expect(normalizeSymbolHint('bond double')).toBe('bond-double')
  })

  it('singularizes common biology plurals', () => {
    expect(normalizeSymbolHint('mitochondria')).toBe('mitochondrion')
    expect(normalizeSymbolHint('chloroplasts')).toBe('chloroplast')
    expect(normalizeSymbolHint('petals')).toBe('petal')
    expect(normalizeSymbolHint('sepals')).toBe('sepal')
    expect(normalizeSymbolHint('nuclei')).toBe('nucleus')
  })

  it('leaves unknown hints unchanged (just normalized)', () => {
    expect(normalizeSymbolHint('op-amp')).toBe('op-amp')
    expect(normalizeSymbolHint('contour line')).toBe('contour-line')
  })
})

// ── KNOWN_SYMBOLS ─────────────────────────────────────────────────────────────

describe('KNOWN_SYMBOLS', () => {
  it('maps all circuit symbols to domain shapes', () => {
    expect(KNOWN_SYMBOLS.get('battery')).toBe('battery-symbol')
    expect(KNOWN_SYMBOLS.get('resistor')).toBe('resistor-symbol')
    expect(KNOWN_SYMBOLS.get('capacitor')).toBe('capacitor-symbol')
    expect(KNOWN_SYMBOLS.get('switch')).toBe('switch-symbol')
    expect(KNOWN_SYMBOLS.get('lamp')).toBe('lamp-symbol')
    expect(KNOWN_SYMBOLS.get('inductor')).toBe('inductor-symbol')
    expect(KNOWN_SYMBOLS.get('diode')).toBe('diode-symbol')
  })

  it('maps chemistry symbols', () => {
    expect(KNOWN_SYMBOLS.get('atom')).toBe('atom-circle')
    expect(KNOWN_SYMBOLS.get('bond-single')).toBe('bond-line')
    expect(KNOWN_SYMBOLS.get('bond-double')).toBe('bond-line')
    expect(KNOWN_SYMBOLS.get('bond-triple')).toBe('bond-line')
  })

  it('maps FBD symbols', () => {
    expect(KNOWN_SYMBOLS.get('force-arrow')).toBe('force-arrow-scaled')
    expect(KNOWN_SYMBOLS.get('force')).toBe('force-arrow-scaled')
  })

  it('maps geometry symbols', () => {
    expect(KNOWN_SYMBOLS.get('angle-arc')).toBe('angle-arc')
    expect(KNOWN_SYMBOLS.get('right-angle-mark')).toBe('right-angle-mark')
  })
})

// ── classifyDomain ────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<DiagramAnalysis>): DiagramAnalysis {
  return {
    layoutHint: 'none',
    title: 'Test',
    summary: 'Test diagram',
    elements: [],
    relationships: [],
    narration: [],
    ...overrides,
  }
}

describe('classifyDomain', () => {
  it('classifies axial layoutHint as chart', () => {
    const a = makeAnalysis({ layoutHint: 'axial' })
    expect(classifyDomain(a)).toBe('chart')
  })

  it('classifies diagrams with bar/data-point hints as chart', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'b1', label: 'Category A', type: 'bar', symbolHint: 'bar' },
        { id: 'ax', label: 'X axis', type: 'axis', symbolHint: 'axis-line' },
      ],
    })
    expect(classifyDomain(a)).toBe('chart')
  })

  it('classifies diagrams with 2+ circuit symbols as circuit', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'bat', label: 'Battery', type: 'battery', symbolHint: 'battery' },
        { id: 'r1', label: 'Resistor', type: 'resistor', symbolHint: 'resistor' },
      ],
      layoutHint: 'cyclic',
    })
    expect(classifyDomain(a)).toBe('circuit')
  })

  it('classifies diagrams with bond hints as chemistry', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'a1', label: 'Carbon', type: 'atom', symbolHint: 'atom' },
        { id: 'b1', label: 'Bond', type: 'bond', symbolHint: 'bond-single' },
        { id: 'a2', label: 'Hydrogen', type: 'atom', symbolHint: 'atom' },
      ],
    })
    expect(classifyDomain(a)).toBe('chemistry')
  })

  it('classifies biology hints as biology', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'n1', label: 'Nucleus', type: 'organelle', symbolHint: 'nucleus' },
        { id: 'm1', label: 'Mitochondria', type: 'organelle', symbolHint: 'mitochondria' },
      ],
    })
    expect(classifyDomain(a)).toBe('biology')
  })

  it('classifies FBD diagrams with force arrows as fbd', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'f1', label: 'Gravity', type: 'force', symbolHint: 'force-arrow' },
        { id: 'obj', label: 'Block', type: 'mass', visualShape: 'rect' },
      ],
      layoutHint: 'positional',
    })
    expect(classifyDomain(a)).toBe('fbd')
  })

  it('returns generic for unrecognized diagrams', () => {
    const a = makeAnalysis({
      elements: [
        { id: 'x', label: 'Thing', type: 'widget' },
      ],
    })
    expect(classifyDomain(a)).toBe('generic')
  })
})

// ── selectStrategy ────────────────────────────────────────────────────────────

describe('selectStrategy', () => {
  it('maps circuit/fbd/physics/chemistry/geometry to direct-symbol-diagram', () => {
    expect(selectStrategy('circuit')).toBe('direct-symbol-diagram')
    expect(selectStrategy('fbd')).toBe('direct-symbol-diagram')
    expect(selectStrategy('chemistry')).toBe('direct-symbol-diagram')
    expect(selectStrategy('geometry')).toBe('direct-symbol-diagram')
  })

  it('maps chart to chart-reconstruction', () => {
    expect(selectStrategy('chart')).toBe('chart-reconstruction')
  })

  it('maps flowchart/process to flow-sequence', () => {
    expect(selectStrategy('flowchart')).toBe('flow-sequence')
    expect(selectStrategy('process')).toBe('flow-sequence')
  })

  it('maps biology/anatomy to labelled-region-map', () => {
    expect(selectStrategy('biology')).toBe('labelled-region-map')
    expect(selectStrategy('anatomy')).toBe('labelled-region-map')
  })
})

// ── shouldTriggerClaudeCall ───────────────────────────────────────────────────

describe('shouldTriggerClaudeCall', () => {
  it('always triggers for biology/anatomy/map/spatial/unknown', () => {
    const a = makeAnalysis({})
    expect(shouldTriggerClaudeCall('biology', a)).toBe(true)
    expect(shouldTriggerClaudeCall('anatomy', a)).toBe(true)
    expect(shouldTriggerClaudeCall('map', a)).toBe(true)
    expect(shouldTriggerClaudeCall('spatial', a)).toBe(true)
    expect(shouldTriggerClaudeCall('unknown', a)).toBe(true)
  })

  it('triggers when element count > 12', () => {
    const a = makeAnalysis({
      elements: Array.from({ length: 13 }, (_, i) => ({ id: `el${i}`, label: `El ${i}`, type: 'component' })),
    })
    expect(shouldTriggerClaudeCall('circuit', a)).toBe(true)
  })

  it('triggers when relationship count > 15', () => {
    const a = makeAnalysis({
      relationships: Array.from({ length: 16 }, (_, i) => ({ from: `a${i}`, to: `b${i}`, type: 'connects', directed: false })),
    })
    expect(shouldTriggerClaudeCall('circuit', a)).toBe(true)
  })

  it('does not trigger for simple known-domain diagrams', () => {
    const a = makeAnalysis({
      layoutHint: 'cyclic',
      elements: [
        { id: 'bat', label: 'Battery', type: 'battery', symbolHint: 'battery' },
        { id: 'r1', label: 'Resistor', type: 'resistor', symbolHint: 'resistor' },
        { id: 'l1', label: 'Lamp', type: 'lamp', symbolHint: 'lamp' },
      ],
      relationships: [
        { from: 'bat', to: 'r1', type: 'connects', directed: false },
        { from: 'r1', to: 'l1', type: 'connects', directed: false },
        { from: 'l1', to: 'bat', type: 'connects', directed: false },
      ],
    })
    expect(shouldTriggerClaudeCall('circuit', a)).toBe(false)
  })
})

// ── resolveSymbol ─────────────────────────────────────────────────────────────

describe('resolveSymbol', () => {
  it('tier 1: returns componentShape for known symbolHint', () => {
    const el = { id: 'bat', label: 'Battery', type: 'battery', symbolHint: 'battery' }
    const result = resolveSymbol(el)
    expect(result.kind).toBe('componentShape')
    if (result.kind === 'componentShape') expect(result.shape).toBe('battery-symbol')
  })

  it('tier 1: normalizes symbolHint before lookup', () => {
    const el = { id: 'r1', label: 'Resistor', type: 'resistor', symbolHint: 'Resistor' }
    const result = resolveSymbol(el)
    expect(result.kind).toBe('componentShape')
  })

  it('tier 1: uses type as fallback when symbolHint is absent', () => {
    const el = { id: 'bat', label: 'Battery', type: 'battery' }
    const result = resolveSymbol(el)
    expect(result.kind).toBe('componentShape')
    if (result.kind === 'componentShape') expect(result.shape).toBe('battery-symbol')
  })

  it('tier 2: returns recipe from plan when symbolHint not in KNOWN_SYMBOLS', () => {
    const el = { id: 'mito', label: 'Mitochondria', type: 'organelle', symbolHint: 'mitochondrion' }
    const plan = {
      educationalPurpose: 'Cell biology',
      domain: 'biology' as const,
      tactileStrategy: 'labelled-region-map' as const,
      elementsToPreserve: [{
        id: 'mito',
        label: 'Mitochondria',
        role: 'region' as const,
        tactileSymbolRecipe: {
          basePrimitive: 'bean-region' as const,
          modifiers: ['wavy-inner-line' as const],
          labelMethod: 'lead-line' as const,
        },
        labelMethod: 'lead-line' as const,
        importance: 'essential' as const,
      }],
      elementsToOmit: [],
      pagePlan: [],
      explorationInstructions: 'Explore from outer membrane inward.',
    }
    const result = resolveSymbol(el, plan)
    expect(result.kind).toBe('recipe')
    if (result.kind === 'recipe') {
      expect(result.recipe.basePrimitive).toBe('bean-region')
    }
  })

  it('tier 3: falls back to visualShape when no hint and no plan', () => {
    const el = { id: 'x', label: 'Thing', type: 'unknown-widget', visualShape: 'circle' as const }
    const result = resolveSymbol(el)
    expect(result.kind).toBe('visualShape')
    if (result.kind === 'visualShape') expect(result.visualShape).toBe('circle')
  })
})

// ── fallbackExplorationInstructions ──────────────────────────────────────────

describe('fallbackExplorationInstructions', () => {
  it('returns circuit-specific instructions for circuit domain', () => {
    const text = fallbackExplorationInstructions('circuit', 'direct-symbol-diagram', 'single')
    expect(text.toLowerCase()).toContain('circuit')
  })

  it('returns flow-specific instructions for flow-sequence strategy', () => {
    const text = fallbackExplorationInstructions('process', 'flow-sequence', 'overview')
    expect(text.toLowerCase()).toContain('sequence')
  })

  it('returns region instructions for labelled-region-map strategy', () => {
    const text = fallbackExplorationInstructions('biology', 'labelled-region-map', 'single')
    expect(text.toLowerCase()).toContain('region')
  })

  it('always returns a non-empty string', () => {
    expect(fallbackExplorationInstructions('unknown', 'direct-symbol-diagram', 'single').length).toBeGreaterThan(0)
    expect(fallbackExplorationInstructions('chart', 'chart-reconstruction', 'single').length).toBeGreaterThan(0)
  })
})
