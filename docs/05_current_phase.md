# 05 — Current Phase

## ▶ Active phase: Phase 2 — Claude Vision: diagram classification & structured extraction

**Status:** Not started

Before writing any code, read:
- `docs/00_build_spec.md` — what you're building and why
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

---

## Phase 2 task summary

Send the preprocessed image to Claude Vision via a Next.js API route. Claude classifies the diagram type and returns a validated, structured JSON object describing all components and relationships. Use `zod` for schema validation and `jsonrepair` to handle near-valid JSON from Claude.

### Checklist
- [ ] Query Context7 for `@anthropic-ai/sdk` and `zod` docs before writing
- [ ] Create `/api/analyze` POST route that accepts base64 image
- [ ] Design the extraction prompt
- [ ] Define Zod schemas in `src/types/diagram.ts` — these are the source of truth for `DiagramAnalysis` and all sub-types
- [ ] In the API route: send image to Claude → run response through `jsonrepair` → validate with Zod schema → return typed JSON
- [ ] Wrap Claude call in `p-retry` (3 attempts, exponential backoff) for transient failures
- [ ] Handle the three diagram types with type-discriminated Zod schemas
- [ ] Return structured JSON to the client; display raw JSON in a collapsible debug panel (dev only)
- [ ] Loading state shows a `sonner` toast: "Analyzing your diagram…"
- [ ] Error states surface as `sonner` toast errors with retry affordance

### DiagramAnalysis Zod schema (source of truth)
```ts
// src/types/diagram.ts
import { z } from 'zod'
import { nanoid } from 'nanoid'

export const DiagramTypeSchema = z.enum(['circuit', 'graph', 'free-body', 'unknown'])

export const DiagramElementSchema = z.object({
  id: z.string().default(() => nanoid()),
  label: z.string(),                          // e.g. "9V Battery"
  type: z.string(),                           // e.g. "battery", "resistor", "bar", "force-vector"
  value: z.string().optional(),               // e.g. "9V", "100Ω", "32N"
  position: z.object({                        // Normalised 0–1 position
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
  brailleLabel: z.string().optional(),        // Populated by braille.ts in Phase 5
})

export const RelationshipSchema = z.object({
  from: z.string(),                           // element id
  to: z.string(),                             // element id
  type: z.string(),                           // e.g. "connected-to", "greater-than", "acts-on"
  label: z.string().optional(),
})

export const NarrationStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string(),                           // Full TTS sentence
  elementId: z.string().optional(),           // Links step to a diagram element
})

export const DiagramAnalysisSchema = z.object({
  type: DiagramTypeSchema,
  title: z.string(),
  summary: z.string(),
  elements: z.array(DiagramElementSchema),
  relationships: z.array(RelationshipSchema),
  narration: z.array(NarrationStepSchema),
})

export type DiagramAnalysis = z.infer<typeof DiagramAnalysisSchema>
export type DiagramElement = z.infer<typeof DiagramElementSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type NarrationStep = z.infer<typeof NarrationStepSchema>
```

### Definition of done
Phase 2 is complete when:
1. `/api/analyze` returns valid, Zod-validated `DiagramAnalysis` JSON for a circuit diagram test image
2. `/api/analyze` returns valid JSON for a bar chart test image
3. `/api/analyze` returns valid JSON for a free-body diagram test image
4. `jsonrepair` handles a deliberately malformed Claude response without crashing
5. `p-retry` retries on transient 5xx errors; logs retry attempts
6. Zod types are the single source of truth — no separate `interface` declarations
7. `sonner` toast shows during loading and on error
8. Error toast includes a retry button that re-fires the API call

---

## Phase history

| Phase | Status |
|---|---|
| Phase 1 — Scaffolding & image input | ✅ Done |
| Phase 2 — Claude Vision extraction | ▶ In progress |
| Phase 3 — Audio walkthrough (TTS) | 🔲 Not started |
| Phase 4 — High-contrast SVG renderer | 🔲 Not started |
| Phase 5 — Tactile / braille SVG | 🔲 Not started |
| Phase 6 — Navigable diagram map | 🔲 Not started |
| Phase 7 — Polish, animations & deploy | 🔲 Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`
