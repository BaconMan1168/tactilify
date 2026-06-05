import type { ValidationReport } from '../validation/validator'

export type RepairParams = {
  minClearanceMm: number
  forceMultiPage: boolean
  omitBelowImportance: number  // 0 = keep all; 1 = drop 'optional'; 2 = keep 'essential' only
}

export const DEFAULT_REPAIR_PARAMS: RepairParams = {
  minClearanceMm: 4,
  forceMultiPage: false,
  omitBelowImportance: 0,
}

export type Repair = {
  id: string
  description: string
  paramOverride: Partial<RepairParams>
}

export function dispatchRepairs(report: ValidationReport, current: RepairParams): Repair[] {
  const failCodes = new Set(report.hardFailures.map(f => f.code))

  if (failCodes.has('COL-001') && failCodes.has('PAGE-001')) {
    return [{
      id: 'reduce-elements',
      description: 'Drop low-importance elements to resolve both collision and overflow',
      paramOverride: { omitBelowImportance: 2 },
    }]
  }

  const repairs: Repair[] = []

  if (failCodes.has('COL-001')) {
    repairs.push({
      id: 'bump-clearance',
      description: 'Increase minimum clearance to spread nodes further apart',
      paramOverride: { minClearanceMm: current.minClearanceMm + 3 },
    })
  }

  if (failCodes.has('PAGE-001')) {
    repairs.push({
      id: 'force-multipage',
      description: 'Split elements across additional pages',
      paramOverride: { forceMultiPage: true },
    })
  }

  return repairs
}

export function applyRepairs(current: RepairParams, repairs: Repair[]): RepairParams {
  return repairs.reduce<RepairParams>((params, r) => ({ ...params, ...r.paramOverride }), current)
}
