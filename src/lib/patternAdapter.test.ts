import { describe, it, expect } from 'vitest'
import { parsePatternDefs } from './patternAdapter'

describe('parsePatternDefs — round-trip (mm-scaled) classification', () => {
  it('classifies horizontal pattern after scaleCoordsToMM rounds y1=y2 to toFixed(2)', () => {
    // After scaleCoordsToMM: x1="0.00" y1="1.41" x2="2.83" y2="1.41" (y1 == y2 → horizontal)
    const svg = `<svg><defs><pattern id="p1" width="2.83" height="2.83">
      <line x1="0.00" y1="1.41" x2="2.83" y2="1.41" stroke="#000000" stroke-width="0.18"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('horizontal')
  })

  it('classifies vertical pattern after scaleCoordsToMM rounds x1=x2 to toFixed(2)', () => {
    // After scaleCoordsToMM: x1="1.41" y1="0.00" x2="1.41" y2="2.83" (x1 == x2 → vertical)
    const svg = `<svg><defs><pattern id="p1" width="2.83" height="2.83">
      <line x1="1.41" y1="0.00" x2="1.41" y2="2.83" stroke="#000000" stroke-width="0.18"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('vertical')
  })

  it('classifies crosshatch pattern with two diagonal lines after scaling', () => {
    const svg = `<svg><defs><pattern id="p1" width="2.83" height="2.83">
      <line x1="0.00" y1="0.00" x2="2.83" y2="2.83" stroke="#000000" stroke-width="0.18"/>
      <line x1="2.83" y1="0.00" x2="0.00" y2="2.83" stroke="#000000" stroke-width="0.18"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('crosshatch')
  })

  it('classifies diagonal pattern with single non-axis-aligned line after scaling', () => {
    const svg = `<svg><defs><pattern id="p1" width="2.83" height="2.83">
      <line x1="0.00" y1="0.00" x2="2.83" y2="2.83" stroke="#000000" stroke-width="0.18"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('diagonal')
  })

  it('also classifies original integer-coordinate horizontal pattern correctly', () => {
    const svg = `<svg><defs><pattern id="p1" width="8" height="8">
      <line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('horizontal')
  })

  it('also classifies original integer-coordinate vertical pattern correctly', () => {
    const svg = `<svg><defs><pattern id="p1" width="8" height="8">
      <line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.5"/>
    </pattern></defs></svg>`
    const entries = parsePatternDefs(svg)
    expect(entries[0].type).toBe('vertical')
  })
})
