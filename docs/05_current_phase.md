# 05 — Current Phase

## ▶ Active phase: Phase 6 — High-contrast SVG

**Status:** Not started
**Spec:** `docs/01_build_phases.md` — Phase 6 section

### Task
Generate a high-contrast SVG variant for low-vision users. Bold outlines, high-contrast fills, large readable labels — rendered server-side via a new `/api/high-contrast` route using `xmlbuilder2` + `svgo`, mirroring the tactile route pattern.

Before writing any code, read:
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

### Checklist (Phase 6)
- [ ] Query Context7 for `xmlbuilder2` and `svgo` docs before writing
- [ ] Create `src/lib/svg/highContrastRenderer.ts` — takes `DiagramAnalysis`, returns SVG string
- [ ] Create `/api/high-contrast` POST route: accepts `DiagramAnalysis`, returns high-contrast SVG string
- [ ] Build `HighContrastSVG.tsx` component: inline scrollable preview, zoom controls, download button
- [ ] Wire into results tab panel alongside Tactile SVG and Audio tabs (add tab entry to `OUTPUT_TABS`)
- [ ] `sonner` toast on SVG download
- [ ] Zero TypeScript errors

### Definition of done (Phase 6)
- [ ] High-contrast SVG renders for circuit, chart, free-body, and an unknown diagram type
- [ ] All fills are high-contrast (no mid-tone grays, no light pastels)
- [ ] All labels are readable at 100% browser zoom (min 16pt equivalent in SVG units)
- [ ] Strokes are bold and clearly visible (min 3pt)
- [ ] Download triggers `sonner` toast
- [ ] Preview renders inline with zoom controls
- [ ] Zero TypeScript errors

---

## Phase 5 task summary — Navigable diagram map

**Status:** Complete

### What was built
A keyboard and screen-reader navigable `DiagramMap` component (`src/components/output/DiagramMap.tsx`) wired into the "Diagram map" tab.

- Map mode toggle (Enter/Exit) — activates `FocusScope` (contain + restoreFocus + autoFocus)
- `useFocusManager` for Tab/Shift-Tab within the scope
- Spatial layout: elements positioned at `toGrid(pos.x)% / toGrid(pos.y)%` (10–90% safe zone), sequential list fallback
- Arrow key spatial nav: nearest-in-direction algorithm using normalised positions
- `@react-aria/live-announcer` announces label, type, value, and connections on focus
- Enter/Space expands element showing connections, announced with assertive priority
- GSAP `repeat: -1 / yoyo` pulse on focused node's `boxShadow`
- GSAP `strokeDashoffset` draw animation on SVG `<line>` connection lines on expand
- Escape exits map mode; `FocusScope restoreFocus` returns focus to the toggle button

### Checklist (Phase 5 — completed)
- [x] Query Context7 for `@react-aria/live-announcer`, `@react-aria/focus`, and `gsap` docs before writing
- [x] Build `DiagramMap` component (`src/components/output/DiagramMap.tsx`) that accepts `DiagramAnalysis`
- [x] Render elements as focusable nodes; use `element.position` for spatial layout where available, sequential list otherwise
- [x] Use `@react-aria/focus` for focus management — `FocusScope` to trap/manage focus within the map
- [x] Keyboard: Tab/Shift+Tab between elements, Arrow keys spatial, Enter/Space expand details, Escape exit
- [x] Use `@react-aria/live-announcer` to announce each element: label, type, value, relationships
- [x] GSAP pulsing border on focused element, connection lines on expand
- [x] "Map mode" toggle keyboard accessible
- [x] Wire `DiagramMap` into the results tab panel alongside Audio and Tactile SVG
- [x] Zero TypeScript errors

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
| Phase 5 — Navigable diagram map | ✅ Done |
| Phase 6 — High-contrast SVG | ▶ Active |
| Phase 7 — Polish, animations & deploy | Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`
