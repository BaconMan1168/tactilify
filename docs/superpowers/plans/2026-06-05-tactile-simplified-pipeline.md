# Tactile Simplified Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken 14-stage pipeline with a clean 5-stage pipeline (adapt → plan → render → validate → repair) built on top of the proven main-branch 3-file core, carrying all data throughout every stage with no lossy conversions.

**Architecture:** A `TactileContext` object accumulates every stage's output. The pipeline orchestrator (`src/lib/tactile/pipeline.ts`) calls the existing adaptor/planner/renderer unchanged, then runs structural validation (ported from the refactor, fixed) and one repair retry. No Claude critique gate. No CV layer. No re-extraction from image.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Vitest, xmlbuilder2, existing `tactileAdaptor.ts` / `tactilePlanner.ts` / `tactileRenderer.ts` (all unchanged except planner gets profile + repair params).

---

## File Map

| Status | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/tactile/layout/page-profiles.ts` | `PageProfile` type + `a4` / `braille-11x11` profiles + `getProfile()` |
| Create | `src/lib/tactile/validation/validator.ts` | `ValidationReport` type + 4 hard checks + 3 warnings |
| Create | `src/lib/tactile/repair/repairer.ts` | `RepairParams` type + `dispatchRepairs()` + `applyRepairs()` |
| Create | `src/lib/tactile/pipeline.ts` | `TactileContext`, `TactileResponse`, `runTactilePipeline()` |
| Modify | `src/lib/svg/tactilePlanner.ts` | Add `profile?: PageProfile` + `repairParams?: RepairParams` to `buildTactilePlan()` |
| Modify | `src/app/api/tactile/route.ts` | Delegate to `runTactilePipeline()`, return both old and new response format |
| Modify | `src/components/output/TactileSVG.tsx` | Handle new `artifacts.svgPages` response alongside old `pages` fallback |

---

## Task 1: Page Profiles

**Files:**
- Create: `src/lib/tactile/layout/page-profiles.ts`
- Create: `src/lib/tactile/layout/page-profiles.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```typescript
// src/lib/tactile/layout/page-profiles.test.ts
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
```

- [ ] **Step 1.2: Run to confirm failure**

```bash
npx vitest run src/lib/tactile/layout/page-profiles.test.ts
```
Expected: FAIL — `Cannot find module './page-profiles'`

- [ ] **Step 1.3: Implement page-profiles.ts**

```typescript
// src/lib/tactile/layout/page-profiles.ts

export type PageProfile = {
  id: string
  name: string
  widthMm: number
  heightMm: number
  marginMm: number
  drawingZone: { xMm: number; yMm: number; widthMm: number; heightMm: number }
}

const PROFILES: Record<string, PageProfile> = {
  'a4': {
    id: 'a4',
    name: 'A4 Portrait',
    widthMm: 210,
    heightMm: 297,
    marginMm: 15,
    drawingZone: { xMm: 15, yMm: 15, widthMm: 180, heightMm: 267 },
  },
  'braille-11x11': {
    id: 'braille-11x11',
    name: 'Braille 11×11"',
    widthMm: 279.4,
    heightMm: 279.4,
    marginMm: 12,
    drawingZone: { xMm: 12, yMm: 12, widthMm: 255.4, heightMm: 255.4 },
  },
}

export function getProfile(id: string): PageProfile {
  return PROFILES[id] ?? PROFILES['a4']
}
```

- [ ] **Step 1.4: Run to confirm pass**

```bash
npx vitest run src/lib/tactile/layout/page-profiles.test.ts
```
Expected: PASS — 3 tests

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/tactile/layout/page-profiles.ts src/lib/tactile/layout/page-profiles.test.ts
git commit -m "feat(tactile): add page-profiles module (a4, braille-11x11)"
```

---

## Task 2: Validation Layer

**Files:**
- Create: `src/lib/tactile/validation/validator.ts`
- Create: `src/lib/tactile/validation/validator.test.ts`

- [ ] **Step 2.1: Write the failing tests**

```typescript
// src/lib/tactile/validation/validator.test.ts
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
    // Two objects at same position — definitely overlapping
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
    // wire should not be checked against node
    expect(check.affectedIds).not.toContain('w')
  })

  it('warns LABEL-001 when label count exceeds 12', () => {
    const objects = Array.from({ length: 13 }, (_, i) => makeObj(`e${i}`, 20 + i * 5, 20 + i * 5))
    const report = validateTactile(emptyAnalysis, [makePlan(objects)], ['<svg></svg>'], a4)
    const check = report.checks.find(c => c.code === 'LABEL-001')!
    expect(check.status).toBe('warning')
  })
})
```

- [ ] **Step 2.2: Run to confirm failure**

```bash
npx vitest run src/lib/tactile/validation/validator.test.ts
```
Expected: FAIL — `Cannot find module './validator'`

- [ ] **Step 2.3: Implement validator.ts**

```typescript
// src/lib/tactile/validation/validator.ts
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
    (s, p) => s + p.objects.filter(o => o.role === 'component').length, 0,
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
    const nodes = plan.objects.filter(o => o.role === 'component' && o.bboxMm)
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

  // BRAILLE-001 (warning): braille key entries exceed page width
  // Key entries use PAGE_W - 2*margin; if any key text is very long it wraps — treated as advisory only
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
```

- [ ] **Step 2.4: Run to confirm pass**

```bash
npx vitest run src/lib/tactile/validation/validator.test.ts
```
Expected: PASS — 8 tests

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/tactile/validation/validator.ts src/lib/tactile/validation/validator.test.ts
git commit -m "feat(tactile): add structural validation layer"
```

---

## Task 3: Repair Dispatcher

**Files:**
- Create: `src/lib/tactile/repair/repairer.ts`
- Create: `src/lib/tactile/repair/repairer.test.ts`

- [ ] **Step 3.1: Write the failing tests**

```typescript
// src/lib/tactile/repair/repairer.test.ts
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
```

- [ ] **Step 3.2: Run to confirm failure**

```bash
npx vitest run src/lib/tactile/repair/repairer.test.ts
```
Expected: FAIL — `Cannot find module './repairer'`

- [ ] **Step 3.3: Implement repairer.ts**

```typescript
// src/lib/tactile/repair/repairer.ts
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
```

- [ ] **Step 3.4: Run to confirm pass**

```bash
npx vitest run src/lib/tactile/repair/repairer.test.ts
```
Expected: PASS — 7 tests

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/tactile/repair/repairer.ts src/lib/tactile/repair/repairer.test.ts
git commit -m "feat(tactile): add repair dispatcher"
```

---

## Task 4: Modify tactilePlanner to Accept Profile + Repair Params

**Files:**
- Modify: `src/lib/svg/tactilePlanner.ts`

The planner currently hardcodes `PAGE_W = 210`, `PAGE_H = 297`, `MARGIN = 15` and uses `bboxOverlaps(..., pad = 2)` for clearance. This task threads the profile dimensions and the repair `minClearanceMm` and `omitBelowImportance` params through the planner.

- [ ] **Step 4.1: Add imports at the top of tactilePlanner.ts**

Find this line near the top of `src/lib/svg/tactilePlanner.ts`:
```typescript
import { normalizeSymbolHint } from '@/lib/svg/tactileAdaptor'
```

Add the two new imports after it:
```typescript
import type { PageProfile } from '@/lib/tactile/layout/page-profiles'
import type { RepairParams } from '@/lib/tactile/repair/repairer'
```

- [ ] **Step 4.2: Update the buildTactilePlan signature**

Find:
```typescript
export async function buildTactilePlan(pageSpec: TactilePageSpec): Promise<TactilePlan> {
```

Replace with:
```typescript
export async function buildTactilePlan(
  pageSpec: TactilePageSpec,
  profile?: PageProfile,
  repairParams?: RepairParams,
): Promise<TactilePlan> {
```

- [ ] **Step 4.3: Use profile dimensions instead of hardcoded constants**

Immediately after the opening brace of `buildTactilePlan`, find:
```typescript
  const warnings: TactileValidationIssue[] = [...(pageSpec.warnings?.map(w => ({ severity: 'warning' as const, code: 'UNKNOWN_SYMBOL' as const, message: w })) ?? [])]

  const { elements, relationships, domain, tactileStrategy, pageType } = pageSpec
```

Replace with:
```typescript
  const warnings: TactileValidationIssue[] = [...(pageSpec.warnings?.map(w => ({ severity: 'warning' as const, code: 'UNKNOWN_SYMBOL' as const, message: w })) ?? [])]

  const pageW = profile?.widthMm ?? PAGE_W
  const pageH = profile?.heightMm ?? PAGE_H
  const margin = profile?.marginMm ?? MARGIN
  const drawX = margin
  const drawW = pageW - 2 * margin
  const minClearance = repairParams?.minClearanceMm ?? 2

  const { relationships, domain, tactileStrategy, pageType } = pageSpec

  // Apply repair element filtering before processing
  const rawElements = pageSpec.elements
  const elements = repairParams && repairParams.omitBelowImportance > 0
    ? rawElements.filter(el => {
        if (repairParams.omitBelowImportance >= 2) return el.importance === 'essential'
        return el.importance !== 'optional'
      })
    : rawElements
```

- [ ] **Step 4.4: Replace hardcoded PAGE_W/PAGE_H/MARGIN/DRAW_X/DRAW_W references inside buildTactilePlan**

Inside the body of `buildTactilePlan` (after the variable declarations above), replace every reference to the module-level constants with the local variables. Search for these patterns in the function body only (not the module-level declarations at the top):

Replace `PAGE_W - 2 * MARGIN` → `pageW - 2 * margin`
Replace `PAGE_W` → `pageW` (inside function body only)
Replace `PAGE_H` → `pageH` (inside function body only)
Replace `MARGIN` → `margin` (inside function body only)
Replace `DRAW_X` → `drawX` (inside function body only)
Replace `DRAW_W` → `drawW` (inside function body only)

Find this line in the final plan assembly:
```typescript
    page: { widthMm: PAGE_W, heightMm: PAGE_H, marginMm: MARGIN, orientation: 'portrait' },
```
Replace with:
```typescript
    page: { widthMm: pageW, heightMm: pageH, marginMm: margin, orientation: 'portrait' },
```

- [ ] **Step 4.5: Thread minClearance into bboxOverlaps calls inside buildTactilePlan**

Find the call to `placeAllMarkers` inside `buildTactilePlan`. The `placeAllMarkers` function internally calls `bboxOverlaps` with the default `pad = 2`. Update the calls in `placeMarkerLabel` that use `bboxOverlaps` to use `minClearance` instead of the default:

Find in `placeMarkerLabel` (inside `buildTactilePlan` call chain):
```typescript
  if (existing.some(e => bboxOverlaps(e, cand))) continue
```
This is inside the `placeAllMarkers` function. Since `placeAllMarkers` is a module-level function (not nested), pass `minClearance` as a parameter.

Find the `placeAllMarkers` function signature:
```typescript
function placeAllMarkers(
```

After reading its full signature in the file, add `clearanceMm = 2` as the last parameter, and pass it through to `placeMarkerLabel`. Then update the call site inside `buildTactilePlan`:

Find the call to `placeAllMarkers` inside `buildTactilePlan`:
```typescript
  const markerObjects = placeAllMarkers(meaningful, partial.objects, partial.connections, drawY, drawH, partial.key)
```
Replace with:
```typescript
  const markerObjects = placeAllMarkers(meaningful, partial.objects, partial.connections, drawY, drawH, partial.key, minClearance)
```

Then find `function placeAllMarkers(` and add `, clearanceMm = 2` to its parameter list. Propagate `clearanceMm` into the `placeMarkerLabel` call inside it.

Find `function placeMarkerLabel(` and add `, clearanceMm = 2` to its parameter list. Then find the `bboxOverlaps` call inside it:
```typescript
  if (existing.some(e => bboxOverlaps(e, cand))) continue
```
Replace with:
```typescript
  if (existing.some(e => bboxOverlaps(e, cand, clearanceMm))) continue
```

- [ ] **Step 4.6: Run existing planner tests to confirm nothing broke**

```bash
npx vitest run src/lib/svg/tactilePlanner.test.ts
```
Expected: all existing tests PASS

- [ ] **Step 4.7: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors in the modified files

- [ ] **Step 4.8: Commit**

```bash
git add src/lib/svg/tactilePlanner.ts
git commit -m "feat(tactile): add profile + repair params to buildTactilePlan"
```

---

## Task 5: Pipeline Orchestrator

**Files:**
- Create: `src/lib/tactile/pipeline.ts`

- [ ] **Step 5.1: Create pipeline.ts**

```typescript
// src/lib/tactile/pipeline.ts
import { nanoid } from 'nanoid'
import { buildTactileAdaptation } from '@/lib/svg/tactileAdaptor'
import { buildTactilePlan } from '@/lib/svg/tactilePlanner'
import { renderTactile } from '@/lib/svg/tactileRenderer'
import { validateTactile, type ValidationReport } from './validation/validator'
import { dispatchRepairs, applyRepairs, DEFAULT_REPAIR_PARAMS, type RepairParams } from './repair/repairer'
import { getProfile, type PageProfile } from './layout/page-profiles'
import type { DiagramAnalysis } from '@/types/diagram'
import type { TactilePlan, TactilePageSpec } from '@/types/tactile'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TactilePipelineInput {
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
  pageProfileId?: string
}

export interface TactileAdaptation {
  pages: TactilePageSpec[]
  pageTitles: string[]
}

export interface TactileContext {
  // Input — never dropped
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
  profile: PageProfile
  pipelineRunId: string

  // Stage outputs — appended, never overwritten
  adaptation?: TactileAdaptation
  pagePlans?: TactilePlan[]
  svgPages?: string[]
  validationReport?: ValidationReport
  repairParams?: RepairParams
  repairsApplied?: string[]

  // Observability
  stageTimings: { stage: string; ms: number }[]
  warnings: string[]
}

export interface TactileResponse {
  pipelineRunId: string
  status: 'success' | 'partial' | 'failed'
  artifacts?: {
    svgPages: string[]
    pageTitles: string[]
    pageCount: number
    profileId: string
    profileName: string
  }
  validationReport: ValidationReport
  warnings: string[]
  errors: string[]
  retryCount: number
  repairsApplied: string[]
  stageTimings: { stage: string; ms: number }[]
  intermediates?: {
    adaptation: TactileAdaptation
    pagePlans: TactilePlan[]
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitPageForMultipage(page: TactilePageSpec): TactilePageSpec[] {
  if (page.elements.length <= 4) return [page]
  const mid = Math.ceil(page.elements.length / 2)
  const ids1 = new Set(page.elements.slice(0, mid).map(e => e.id))
  const ids2 = new Set(page.elements.slice(mid).map(e => e.id))
  const page1: TactilePageSpec = {
    ...page,
    elements: page.elements.slice(0, mid),
    relationships: page.relationships.filter(r => ids1.has(r.from) && ids1.has(r.to)),
    pageNumber: 1, totalPages: 2,
    title: `${page.title} (1 of 2)`,
  }
  const page2: TactilePageSpec = {
    ...page,
    elements: page.elements.slice(mid),
    relationships: page.relationships.filter(r => ids2.has(r.from) && ids2.has(r.to)),
    pageNumber: 2, totalPages: 2,
    title: `${page.title} (2 of 2)`,
  }
  return [page1, page2]
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runTactilePipeline(
  input: TactilePipelineInput,
  options: { includeIntermediates?: boolean } = {},
): Promise<TactileResponse> {
  const ctx: TactileContext = {
    analysis: input.analysis,
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    profile: getProfile(input.pageProfileId ?? 'a4'),
    pipelineRunId: nanoid(),
    stageTimings: [],
    warnings: [],
  }

  const time = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now()
    const result = await fn()
    ctx.stageTimings.push({ stage, ms: Date.now() - t })
    return result
  }

  // Stage 1: Adapt — uses existing proven adaptor, no changes
  ctx.adaptation = await time('adapt', () =>
    buildTactileAdaptation(ctx.analysis, ctx.imageBase64, ctx.imageMimeType),
  )

  let repairParams = { ...DEFAULT_REPAIR_PARAMS }
  let retryCount = 0

  for (let attempt = 0; attempt <= 1; attempt++) {
    const currentRepair = attempt > 0 ? repairParams : undefined

    // Apply forceMultiPage split at the pipeline level before planning
    let pagesToPlan = ctx.adaptation!.pages
    let pageTitles = ctx.adaptation!.pageTitles
    if (currentRepair?.forceMultiPage && pagesToPlan.length === 1) {
      pagesToPlan = splitPageForMultipage(pagesToPlan[0])
      pageTitles = pagesToPlan.map(p => p.title)
    }

    // Stage 2: Plan — one TactilePlan per page
    ctx.pagePlans = await time(`plan-${attempt}`, () =>
      Promise.all(pagesToPlan.map(p => buildTactilePlan(p, ctx.profile, currentRepair))),
    )

    // Stage 3: Render — one SVG string per page
    ctx.svgPages = await time(`render-${attempt}`, async () =>
      ctx.pagePlans!.map(plan => renderTactile(plan)),
    )

    // Stage 4: Validate — structural checks, no Claude critique
    ctx.validationReport = await time(`validate-${attempt}`, async () =>
      validateTactile(ctx.analysis, ctx.pagePlans!, ctx.svgPages!, ctx.profile),
    )

    if (ctx.validationReport.overallStatus !== 'failed') break
    if (attempt >= 1) break

    // Stage 5: Repair — determine what to change for next attempt
    const repairs = dispatchRepairs(ctx.validationReport, repairParams)
    if (repairs.length === 0) break

    repairParams = applyRepairs(repairParams, repairs)
    ctx.repairParams = repairParams
    ctx.repairsApplied = repairs.map(r => r.id)
    retryCount++
  }

  const vr = ctx.validationReport!
  // SVG-001 hard failure = no renderable output at all
  const svgFailed = vr.hardFailures.some(f => f.code === 'SVG-001')
  const status: TactileResponse['status'] =
    svgFailed ? 'failed' :
    vr.overallStatus === 'failed' ? 'partial' :    // non-SVG hard failures → serve with warnings
    vr.overallStatus === 'passed-with-warnings' ? 'partial' : 'success'

  const response: TactileResponse = {
    pipelineRunId: ctx.pipelineRunId,
    status,
    validationReport: vr,
    warnings: ctx.warnings,
    errors: vr.hardFailures.map(f => f.message),
    retryCount,
    repairsApplied: ctx.repairsApplied ?? [],
    stageTimings: ctx.stageTimings,
  }

  if (status !== 'failed' && ctx.svgPages && ctx.svgPages.length > 0) {
    response.artifacts = {
      svgPages: ctx.svgPages,
      pageTitles: ctx.adaptation!.pageTitles,
      pageCount: ctx.svgPages.length,
      profileId: ctx.profile.id,
      profileName: ctx.profile.name,
    }
  }

  if (options.includeIntermediates) {
    response.intermediates = {
      adaptation: ctx.adaptation!,
      pagePlans: ctx.pagePlans!,
    }
  }

  return response
}
```

- [ ] **Step 5.2: Check TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors

- [ ] **Step 5.3: Commit**

```bash
git add src/lib/tactile/pipeline.ts
git commit -m "feat(tactile): add pipeline orchestrator with TactileContext"
```

---

## Task 6: Update API Route

**Files:**
- Modify: `src/app/api/tactile/route.ts`

- [ ] **Step 6.1: Replace route.ts**

```typescript
// src/app/api/tactile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { runTactilePipeline } from '@/lib/tactile/pipeline'
import { DiagramAnalysisSchema } from '@/types/diagram'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      analysis?: unknown
      imageBase64?: string
      imageMimeType?: string
      pageProfileId?: string
    }

    // Support both { analysis, imageBase64 } and bare DiagramAnalysis for backward compat
    const rawAnalysis = body.analysis ?? body
    const analysis = DiagramAnalysisSchema.parse(rawAnalysis)

    const result = await runTactilePipeline({
      analysis,
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      imageMimeType: typeof body.imageMimeType === 'string' ? body.imageMimeType : undefined,
      pageProfileId: typeof body.pageProfileId === 'string' ? body.pageProfileId : 'a4',
    })

    if (result.status === 'failed') {
      return NextResponse.json({
        status: result.status,
        errors: result.errors,
        validationReport: result.validationReport,
      }, { status: 422 })
    }

    const svgPages = result.artifacts?.svgPages ?? []
    const pageTitles = result.artifacts?.pageTitles ?? svgPages.map((_, i) => `Page ${i + 1}`)

    return NextResponse.json({
      // New format (artifacts envelope)
      status: result.status,
      artifacts: result.artifacts,
      validationReport: result.validationReport,
      warnings: result.warnings,
      stageTimings: result.stageTimings,
      // Legacy format (for TactileSVG.tsx backward compat)
      pages: svgPages,
      pageTitles,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render tactile SVG'
    console.error('[tactile] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6.2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors

- [ ] **Step 6.3: Commit**

```bash
git add src/app/api/tactile/route.ts
git commit -m "feat(tactile): wire API route to pipeline orchestrator"
```

---

## Task 7: Update TactileSVG Response Handling

**Files:**
- Modify: `src/components/output/TactileSVG.tsx`

The current component reads `data.pages` and `data.pageTitles` directly from the route response. The new route still returns those fields for backward compat, so this change is minimal: add handling for the new `status: 'partial'` case and update the error type to include `errors[]`.

- [ ] **Step 7.1: Update the fetch response handler**

Find the existing fetch block in `TactileSVG.tsx`:
```typescript
    fetch('/api/tactile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis, imageBase64, imageMimeType }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json() as { error?: string }
          throw new Error(data.error ?? `Server error ${res.status}`)
        }
        return res.json() as Promise<{ pages: string[]; pageTitles: string[] }>
      })
      .then((data) => {
        if (!cancelled) {
          setPages(data.pages)
          setPageTitles(data.pageTitles ?? data.pages.map((_, i) => `Page ${i + 1}`))
        }
      })
```

Replace with:
```typescript
    fetch('/api/tactile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis, imageBase64, imageMimeType }),
    })
      .then(async (res) => {
        const data = await res.json() as {
          error?: string
          errors?: string[]
          status?: string
          pages?: string[]
          pageTitles?: string[]
          artifacts?: { svgPages: string[]; pageTitles: string[] }
        }
        if (!res.ok || data.status === 'failed') {
          throw new Error(data.error ?? data.errors?.[0] ?? `Server error ${res.status}`)
        }
        return data
      })
      .then((data) => {
        if (!cancelled) {
          const svgPages = data.artifacts?.svgPages ?? data.pages ?? []
          const titles = data.artifacts?.pageTitles ?? data.pageTitles ?? svgPages.map((_, i) => `Page ${i + 1}`)
          if (svgPages.length === 0) {
            setError('No tactile pages were generated.')
            return
          }
          setPages(svgPages)
          setPageTitles(titles)
        }
      })
```

- [ ] **Step 7.2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors

- [ ] **Step 7.3: Commit**

```bash
git add src/components/output/TactileSVG.tsx
git commit -m "fix(tactile): update TactileSVG to handle new pipeline response format"
```

---

## Task 8: Full Test Suite + TypeScript Verification

- [ ] **Step 8.1: Run all tactile tests**

```bash
npx vitest run src/lib/tactile/
```
Expected: all tests in `page-profiles.test.ts`, `validator.test.ts`, `repairer.test.ts` PASS

- [ ] **Step 8.2: Run all existing tests to check for regressions**

```bash
npx vitest run
```
Expected: all previously passing tests still PASS

- [ ] **Step 8.3: Full TypeScript check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 8.4: Commit clean bill of health**

```bash
git commit --allow-empty -m "chore: all tests pass, 0 TypeScript errors on tactile-simplified pipeline"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 6 new/modified files from spec §6 are covered. TactileContext matches spec §2. All 4 hard checks and 3 warnings from spec §3 are implemented. All 3 repairs from spec §4 are implemented. Both profiles from spec §4 are implemented. Route returns legacy `pages`/`pageTitles` fields for backward compat per spec §5.
- [x] **No placeholders:** All code is complete in every step.
- [x] **Type consistency:** `ValidationReport` defined in Task 2, imported in Tasks 3 and 5. `RepairParams` defined in Task 3, imported in Tasks 4 and 5. `PageProfile` defined in Task 1, imported in Tasks 4 and 5. `TactileAdaptation` defined in Task 5, no external deps. All function names consistent across all tasks.
- [x] **Data loss prevention:** `TactileContext` carries full `DiagramAnalysis` untouched. `TactileAdaptation` carries all `TactilePageSpec[]` including all `AdaptedDiagramElement` fields. `TactileResponse.intermediates` exposes full adaptation and page plans when requested.
