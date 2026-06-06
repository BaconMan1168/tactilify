# 05 — Current Phase

## ▶ Active phase: Phase 5 — Navigable diagram map

**Status:** Not started
**Spec:** `docs/01_build_phases.md` — Phase 5 section

### Task
Build a keyboard and screen-reader navigable interface using `@react-aria/focus` and `@react-aria/live-announcer`. Use GSAP to animate element highlighting as the user traverses the diagram.

Before writing any code, read:
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

### Checklist (Phase 5)
- [ ] Query Context7 for `@react-aria/live-announcer`, `@react-aria/focus`, and `gsap` docs before writing
- [ ] Build `DiagramMap` component (`src/components/output/DiagramMap.tsx`) that accepts `DiagramAnalysis`
- [ ] Render elements as focusable nodes; use `element.position` for spatial layout where available, sequential list otherwise
- [ ] Use `@react-aria/focus` for focus management — `FocusScope` to trap/manage focus within the map
- [ ] Keyboard: Tab/Shift+Tab between elements, Arrow keys spatial, Enter/Space expand details, Escape exit
- [ ] Use `@react-aria/live-announcer` to announce each element: label, type, value, relationships
- [ ] GSAP pulsing border on focused element, connection lines on expand
- [ ] "Map mode" toggle keyboard accessible
- [ ] Wire `DiagramMap` into the results tab panel alongside Audio and Tactile SVG
- [ ] Zero TypeScript errors

### Definition of done (Phase 5)
- [ ] All diagram elements reachable by Tab navigation
- [ ] Arrow key spatial navigation works when positions available
- [ ] `@react-aria/live-announcer` announces element on focus
- [ ] `@react-aria/focus` manages focus scope correctly
- [ ] Enter/Space expands element and shows connections
- [ ] Escape exits map mode cleanly
- [ ] GSAP animates active node highlight and connection lines on expand
- [ ] Map mode toggle is keyboard accessible with visible focus indicator

---

## Phase 4.5 task summary — Simplified tactile pipeline

**Status:** Complete

### What was built
A 5-stage pipeline orchestrator (`src/lib/tactile/pipeline.ts`) that carries a `TactileContext` object through every stage without lossy conversions: **adapt → plan → render → validate → repair**. Built on top of the proven Phase 4 core (adaptor / planner / renderer) with no changes to the rendering trio's logic.

New files created:
- `src/lib/tactile/layout/page-profiles.ts` — `PageProfile` type + `getProfile()` + `a4` / `braille-11x11` profiles
- `src/lib/tactile/validation/validator.ts` — `ValidationReport` type + hard checks + warnings
- `src/lib/tactile/repair/repairer.ts` — `RepairParams` + `dispatchRepairs()` + `applyRepairs()`
- `src/lib/tactile/pipeline.ts` — `TactileContext`, `TactileResponse`, `runTactilePipeline()`

Updated files:
- `src/lib/svg/tactilePlanner.ts` — accepts optional `profile` + `repairParams`
- `src/app/api/tactile/route.ts` — delegates to `runTactilePipeline()`, returns `{ status, artifacts }` envelope
- `src/components/output/TactileSVG.tsx` — handles both `artifacts.svgPages` (new) and `pages` (legacy) response shapes

### Checklist (Phase 4.5 — completed)
- [x] `page-profiles.ts` with `a4` and `braille-11x11` profiles
- [x] `validator.ts` with hard checks and warnings
- [x] `repairer.ts` with dispatch and apply logic
- [x] `pipeline.ts` with `runTactilePipeline()` carrying `TactileContext` throughout
- [x] `tactilePlanner.ts` accepts `profile` + `repairParams`
- [x] `/api/tactile` delegates to pipeline; returns `{ status, artifacts }` envelope
- [x] `TactileSVG.tsx` handles both response shapes
- [x] Unit tests for page-profiles, validator, repairer
- [x] Zero TypeScript errors

---

## Phase 4 task summary

Generate a braille-print SVG variant using `xmlbuilder2`, optimised with `svgo` (via `/api/tactile` server route): outline-only strokes, no fills, braille-encoded labels via `braille.ts`. A4 sized for direct swell-paper printing. Each element rendered as a generic shape (rect, circle, diamond, arc, arrow) with English label and Braille label — no domain-specific symbols. Inline preview with zoom controls (50%–200%) + download button.

### Checklist (Phase 4 — completed)
- [x] Hand-rolled `braille.ts` ASCII → Unicode Grade 1 Braille encoder
- [x] Vitest unit tests for `braille.ts` (9 tests, full ASCII range)
- [x] `tactileRenderer.ts` with circuit / graph / free-body / generic renderers
- [x] `/api/tactile` POST route (keeps Node-only `xmlbuilder2` + `svgo` server-side)
- [x] `TactileSVG.tsx` component: inline scrollable preview, 6-level zoom, download
- [x] `sonner` toast on SVG download
- [x] Wired into results "Tactile / braille" tab, replacing placeholder
- [x] Zero TypeScript errors

---

## Phase history

| Phase | Status |
|---|---|
| Phase 1 — Scaffolding & image input | ✅ Done |
| Phase 2 — Claude Vision extraction | ✅ Done |
| Phase 3 — Audio walkthrough (TTS) | ✅ Done |
| Phase 4 — Tactile / braille SVG | ✅ Done |
| Phase 4.5 — Simplified tactile pipeline | ✅ Done |
| Phase 5 — Navigable diagram map | ▶ Active |
| Phase 6 — High-contrast SVG | Not started |
| Phase 7 — Polish, animations & deploy | Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`
