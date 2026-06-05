import type { TactilePlan, TactileObject } from '@/types/tactile'
import type { DiagramAnalysis } from '@/types/diagram'
import type { PageProfile } from '../layout/page-profiles'

export type ValidationCheckCode =
  | 'STRUCT-001'
  | 'PAGE-001'
  | 'COL-001'
  | 'SVG-001'
  | 'BRAILLE-001'
  | 'LABEL-001'
  | 'PAGE-002'

export type ValidationCheck = {
  code: ValidationCheckCode
  status: 'passed' | 'failed' | 'warning'
  message: string
  affectedIds: string[]
}

export type ValidationReport = {
  overallStatus: 'passed' | 'passed-with-warnings' | 'failed'
  checks: ValidationCheck[]
  hardFailures: ValidationCheck[]
  softWarnings: ValidationCheck[]
}

const HARD_CODES = new Set<ValidationCheckCode>(['STRUCT-001', 'PAGE-001', 'COL-001', 'SVG-001'])
const MIN_CLEARANCE_MM = 3

export function validateTactile(
  _analysis: DiagramAnalysis,
  pagePlans: TactilePlan[],
  svgPages: string[],
  profile: PageProfile,
): ValidationReport {
  const checks: ValidationCheck[] = []

  // STRUCT-001: at least one component element across all pages
  const totalComponents = pagePlans.reduce(
    (s, p) => s + p.objects.filter((o: TactileObject) => o.role === 'component').length, 0,
  )
  checks.push({
    code: 'STRUCT-001',
    status: totalComponents >= 1 ? 'passed' : 'failed',
    message: totalComponents >= 1
      ? `${totalComponents} component element(s) found`
      : 'No component elements in any page',
    affectedIds: [],
  })

  // SVG-001: every SVG page is non-empty and contains an <svg tag
  const badPageIndexes = svgPages
    .map((s, i) => ({ ok: s && s.includes('<svg'), i }))
    .filter(p => !p.ok)
    .map(p => String(p.i))
  checks.push({
    code: 'SVG-001',
    status: badPageIndexes.length === 0 ? 'passed' : 'failed',
    message: badPageIndexes.length === 0
      ? 'All SVG pages well-formed'
      : `${badPageIndexes.length} SVG page(s) malformed or empty`,
    affectedIds: badPageIndexes,
  })

  // PAGE-001: all component bboxes within profile drawing zone
  const overflowIds: string[] = []
  for (const plan of pagePlans) {
    for (const obj of plan.objects) {
      if (obj.role !== 'component' || !obj.bboxMm) continue
      const { x, y, w, h } = obj.bboxMm
      const dz = profile.drawingZone
      if (
        x < dz.xMm || y < dz.yMm ||
        x + w > dz.xMm + dz.widthMm ||
        y + h > dz.yMm + dz.heightMm
      ) {
        overflowIds.push(obj.id)
      }
    }
  }
  checks.push({
    code: 'PAGE-001',
    status: overflowIds.length === 0 ? 'passed' : 'failed',
    message: overflowIds.length === 0
      ? 'All elements within drawing zone'
      : `${overflowIds.length} element(s) overflow the drawing zone`,
    affectedIds: overflowIds,
  })

  // COL-001: node-to-node clearance — component role only, never wires or markers
  const collisionIds: string[] = []
  for (const plan of pagePlans) {
    const nodes = plan.objects.filter((o: TactileObject) => o.role === 'component' && o.bboxMm)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (bboxesOverlap(nodes[i].bboxMm!, nodes[j].bboxMm!, MIN_CLEARANCE_MM)) {
          if (!collisionIds.includes(nodes[i].id)) collisionIds.push(nodes[i].id)
          if (!collisionIds.includes(nodes[j].id)) collisionIds.push(nodes[j].id)
        }
      }
    }
  }
  checks.push({
    code: 'COL-001',
    status: collisionIds.length === 0 ? 'passed' : 'failed',
    message: collisionIds.length === 0
      ? 'No node collisions'
      : `${collisionIds.length} node(s) overlap with < ${MIN_CLEARANCE_MM}mm clearance`,
    affectedIds: collisionIds,
  })

  // LABEL-001 (warning): label count > 12
  const totalLabels = pagePlans.reduce((s, p) => s + p.key.length, 0)
  checks.push({
    code: 'LABEL-001',
    status: totalLabels <= 12 ? 'passed' : 'warning',
    message: totalLabels <= 12
      ? `${totalLabels} label(s) — within limit`
      : `${totalLabels} labels may crowd the key zone`,
    affectedIds: [],
  })

  // PAGE-002 (warning): total page count > 3
  checks.push({
    code: 'PAGE-002',
    status: pagePlans.length <= 3 ? 'passed' : 'warning',
    message: pagePlans.length <= 3
      ? `${pagePlans.length} page(s)`
      : `${pagePlans.length} pages — consider simplification`,
    affectedIds: [],
  })

  // BRAILLE-001 (warning): advisory only in simplified pipeline
  checks.push({
    code: 'BRAILLE-001',
    status: 'passed',
    message: 'Braille width not checked in simplified pipeline',
    affectedIds: [],
  })

  const hardFailures = checks.filter(c => c.status === 'failed' && HARD_CODES.has(c.code))
  const softWarnings = checks.filter(c => c.status === 'warning')
  const overallStatus =
    hardFailures.length > 0 ? 'failed' :
    softWarnings.length > 0 ? 'passed-with-warnings' : 'passed'

  return { overallStatus, checks, hardFailures, softWarnings }
}

function bboxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  clearance: number,
): boolean {
  return (
    a.x - clearance < b.x + b.w &&
    a.x + a.w + clearance > b.x &&
    a.y - clearance < b.y + b.h &&
    a.y + a.h + clearance > b.y
  )
}
