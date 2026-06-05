import { describe, it, expect } from 'vitest'
import { getProfile } from './page-profiles'

describe('getProfile', () => {
  it('returns a4 profile with correct dimensions', () => {
    const p = getProfile('a4')
    expect(p.id).toBe('a4')
    expect(p.widthMm).toBe(210)
    expect(p.heightMm).toBe(297)
    expect(p.marginMm).toBe(15)
    expect(p.drawingZone.xMm).toBe(15)
    expect(p.drawingZone.widthMm).toBe(180)
  })

  it('returns braille-11x11 profile with correct dimensions', () => {
    const p = getProfile('braille-11x11')
    expect(p.id).toBe('braille-11x11')
    expect(p.widthMm).toBeCloseTo(279.4)
    expect(p.drawingZone.widthMm).toBeCloseTo(255.4)
  })

  it('falls back to a4 for unknown id', () => {
    expect(getProfile('unknown-profile').id).toBe('a4')
  })
})
