# Tactile Simplified Pipeline Design

**Date:** 2026-06-05  
**Branch:** `worktree-tactile-simplified`  
**Status:** Approved

---

## 1. Goal

Replace the broken 14-stage refactor pipeline with a clean, reliable tactile pipeline that:
- Reuses the `DiagramAnalysis` already produced during upload (no redundant Claude calls)
- Preserves all data throughout every stage (no lossy conversions)
- Adds structural validation + a single repair retry from the refactor
- Keeps the proven 3-file core (`tactileAdaptor → tactilePlanner → tactileRenderer`) untouched

---

## 2. Architecture

### Pipeline Orchestrator

A single `runTactilePipeline(input)` function builds a `TactileContext` that accumulates every stage's output. Nothing is discarded — each stage receives the full context and appends to it.

```
Input { analysis, imageBase64?, imageMimeType?, pageProfileId }
  │
  ▼ TactileContext (grows with each stage, nothing dropped)
  │
  ├─ Stage 1: Adapt       tactileAdaptor.ts   → ctx.adaptation
  ├─ Stage 2: Plan        tactilePlanner.ts   → ctx.pagePlans[]
  ├─ Stage 3: Render      tactileRenderer.ts  → ctx.svgPages[]
  ├─ Stage 4: Validate    validator.ts        → ctx.validationReport
  └─ Stage 5: Repair      repairer.ts         → ctx.repairParams, ctx.repairsApplied[]
       └─ if hard failures → re-run stages 2–4 once with repair params
```

### TactileContext

```typescript
interface TactileContext {
  // ── Input (never dropped) ──────────────────────────────────────
  analysis:       DiagramAnalysis        // full, untouched from upload flow
  imageBase64?:   string
  imageMimeType?: string
  profile:        PageProfile            // resolved from pageProfileId
  pipelineRunId:  string

  // ── Stage outputs (appended, never overwritten) ────────────────
  adaptation?:       TactileAdaptation   // domain, strategy, all page specs
  pagePlans?:        TactilePlan[]       // full geometry per page
  svgPages?:         string[]            // rendered SVG strings
  validationReport?: ValidationReport    // all checks, hard + soft
  repairParams?:     RepairParams        // params fed into the retry
  repairsApplied?:   string[]

  // ── Observability ─────────────────────────────────────────────
  stageTimings:  { stage: string; ms: number }[]
  warnings:      string[]
}
```

---

## 3. Stage Contracts

### Stage 1 — Adapt

**File:** `src/lib/svg/tactileAdaptor.ts` (unchanged)  
**Input:** `ctx.analysis`, `ctx.imageBase64`, `ctx.imageMimeType`  
**Output appended:** `ctx.adaptation`

`TactileAdaptation` carries: `domain`, `strategy`, `pages: TactilePageSpec[]`, `pageTitles: string[]`. Each `TactilePageSpec` carries the full element list (all fields from `DiagramElement` plus `componentShape`, `labelMethod`, `tactileSymbolRecipe`), the full relationship list, title, explorationInstructions, pageType, pageNumber, totalPages, warnings.

No changes to this file.

### Stage 2 — Plan

**File:** `src/lib/svg/tactilePlanner.ts` (modified: add profile param + consume repair params)  
**Input:** `ctx.adaptation.pages[]`, `ctx.profile`, `ctx.repairParams?`  
**Output appended:** `ctx.pagePlans[]`

The planner consumes three repair params if present:
- `minClearanceMm` — increase spacing between placed objects
- `forceMultiPage: true` — split elements across additional pages
- `omitBelowImportance: number` — drop elements with `educationalImportance <= value`

### Stage 3 — Render

**File:** `src/lib/svg/tactileRenderer.ts` (unchanged)  
**Input:** `ctx.pagePlans[]`  
**Output appended:** `ctx.svgPages[]`

No changes to this file.

### Stage 4 — Validate

**File:** `src/lib/tactile/validation/validator.ts` (new)  
**Input:** `ctx.analysis`, `ctx.adaptation`, `ctx.pagePlans[]`, `ctx.svgPages[]`, `ctx.profile`  
**Output appended:** `ctx.validationReport`

#### Hard failures (trigger repair loop, return 422 if still failing after retry)

| Code | Check | Detail |
|------|-------|--------|
| `STRUCT-001` | `elements.length >= 1` | No elements extracted |
| `PAGE-001` | All element bboxes within `profile.drawingZone` | Layout overflow |
| `COL-001` | Node-to-node clearance `>= minClearanceMm` | Only checks shape nodes — never relationship line bounding boxes |
| `SVG-001` | SVG string is non-empty and contains `<svg` | Renderer produced nothing |

#### Warnings (pass through, included in response, never block output)

| Code | Check |
|------|-------|
| `BRAILLE-001` | Braille cell width fits within page width |
| `LABEL-001` | Rendered label count > 12 |
| `PAGE-002` | Total page count > 3 |

### Stage 5 — Repair

**File:** `src/lib/tactile/repair/repairer.ts` (new)  
**Input:** `ctx.validationReport.hardFailures[]`  
**Output appended:** `ctx.repairParams`, `ctx.repairsApplied[]`

Maximum 1 retry. Repairs are applied in priority order:

| Failure | Repair ID | Param delta | Effect in planner |
|---------|-----------|-------------|------------------|
| `COL-001` | `bump-clearance` | `minClearanceMm += 3` | Nodes spread further apart |
| `PAGE-001` | `force-multipage` | `forceMultiPage: true` | Elements split to additional pages |
| `COL-001` + `PAGE-001` | `reduce-elements` | `omitBelowImportance: 2` | Elements with importance ≤ 2 dropped |

If the same failure recurs after one retry, the pipeline returns the best available output with status `partial`, not `failed` — unless `SVG-001` fails (no SVG at all → `failed`).

---

## 4. Page Profiles

**File:** `src/lib/tactile/layout/page-profiles.ts` (new, ported from refactor)

```typescript
interface PageProfile {
  id:          string
  name:        string
  widthMm:     number
  heightMm:    number
  drawingZone: { xMm: number; yMm: number; widthMm: number; heightMm: number }
}
```

| Profile ID | Dimensions | Drawing zone |
|------------|-----------|-------------|
| `a4` | 210 × 297 mm | x=10, y=10, w=190, h=260 mm |
| `braille-11x11` | 279.4 × 279.4 mm | x=12, y=12, w=255, h=255 mm |

Default: `a4`.

---

## 5. API Route

**File:** `src/app/api/tactile/route.ts` (modified — thin orchestration only)

Accepts: `{ analysis, imageBase64?, imageMimeType?, pageProfileId? }`  
Also accepts bare `DiagramAnalysis` for backward compat.

Returns on success:
```json
{
  "status": "success" | "partial",
  "artifacts": { "svgPages": [...], "pageCount": N, "profileId": "a4" },
  "validationReport": { ... },
  "warnings": [...],
  "stageTimings": [...]
}
```

Returns on failure:
```json
{
  "status": "failed",
  "errors": [...],
  "validationReport": { ... }
}
```

HTTP 200 for success/partial, HTTP 422 for failed (unchanged from current contract so `TactileSVG.tsx` needs no changes).

---

## 6. File Inventory

### New files
- `src/lib/tactile/pipeline.ts` — `TactileContext`, `TactileResponse`, `runTactilePipeline()`
- `src/lib/tactile/validation/validator.ts` — 4 hard checks + 3 warnings
- `src/lib/tactile/repair/repairer.ts` — 3 repairs mapped to consumed params
- `src/lib/tactile/layout/page-profiles.ts` — `a4` and `braille-11x11` profiles

### Modified files
- `src/lib/svg/tactilePlanner.ts` — add `profile: PageProfile` param, consume `RepairParams`
- `src/app/api/tactile/route.ts` — delegate to `runTactilePipeline`

### Unchanged files
- `src/lib/svg/tactileAdaptor.ts`
- `src/lib/svg/tactileRenderer.ts`
- `src/components/output/TactileSVG.tsx`
- All types in `src/types/`

---

## 7. Data Loss Prevention

Every type boundary must carry all fields forward. Specific rules:
- `TactilePageSpec` includes the full `DiagramElement[]` (not a projection) — all fields from `DiagramAnalysis.elements` plus adaptation fields
- `TactilePlan` carries the originating `TactilePageSpec` reference (or a copy) so the renderer and validator can access original semantics
- `ValidationReport` carries all checks (passed and failed), not just failures
- `TactileResponse` carries the full `TactileContext` in `intermediates` when `includeIntermediateArtifacts: true`

---

## 8. Out of Scope

- CV layer (OCR, contour extraction, graph tracing) — deferred
- Claude critique validation gate — removed permanently
- Detection gate — not needed (DiagramAnalysis already validates input)
- The 14-stage pipeline-refactor — preserved on its own branch, not merged
