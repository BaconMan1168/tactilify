import { describe, it, expect } from 'vitest'
import { dispatchRepairs, applyRepairs, DEFAULT_REPAIR_PARAMS } from './repairer'
import type { ValidationReport } from '../validation/validator'

function makeReport(failCodes: string[]): ValidationReport {
  const hardFailures = failCodes.map(code => ({
    code: code as never, status: 'failed' as const, message: code, affectedIds: [],
  }))
  return {
    overallStatus: 'failed',
    checks: hardFailures,
    hardFailures,
    softWarnings: [],
  }
}

describe('dispatchRepairs', () => {
  it('returns bump-clearance for COL-001 alone', () => {
    const repairs = dispatchRepairs(makeReport(['COL-001']), DEFAULT_REPAIR_PARAMS)
    expect(repairs.map(r => r.id)).toContain('bump-clearance')
  })

  it('returns force-multipage for PAGE-001 alone', () => {
    const repairs = dispatchRepairs(makeReport(['PAGE-001']), DEFAULT_REPAIR_PARAMS)
    expect(repairs.map(r => r.id)).toContain('force-multipage')
  })

  it('returns reduce-elements for COL-001 + PAGE-001 together (exclusive)', () => {
    const repairs = dispatchRepairs(makeReport(['COL-001', 'PAGE-001']), DEFAULT_REPAIR_PARAMS)
    expect(repairs.map(r => r.id)).toEqual(['reduce-elements'])
  })

  it('returns empty array when no relevant failures', () => {
    const repairs = dispatchRepairs(makeReport(['STRUCT-001']), DEFAULT_REPAIR_PARAMS)
    expect(repairs).toHaveLength(0)
  })
})

describe('applyRepairs', () => {
  it('increments minClearanceMm for bump-clearance', () => {
    const repairs = dispatchRepairs(makeReport(['COL-001']), DEFAULT_REPAIR_PARAMS)
    const result = applyRepairs(DEFAULT_REPAIR_PARAMS, repairs)
    expect(result.minClearanceMm).toBeGreaterThan(DEFAULT_REPAIR_PARAMS.minClearanceMm)
  })

  it('sets forceMultiPage for force-multipage', () => {
    const repairs = dispatchRepairs(makeReport(['PAGE-001']), DEFAULT_REPAIR_PARAMS)
    const result = applyRepairs(DEFAULT_REPAIR_PARAMS, repairs)
    expect(result.forceMultiPage).toBe(true)
  })

  it('sets omitBelowImportance for reduce-elements', () => {
    const repairs = dispatchRepairs(makeReport(['COL-001', 'PAGE-001']), DEFAULT_REPAIR_PARAMS)
    const result = applyRepairs(DEFAULT_REPAIR_PARAMS, repairs)
    expect(result.omitBelowImportance).toBe(2)
  })
})
