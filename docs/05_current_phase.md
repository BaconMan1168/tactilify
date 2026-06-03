# 05 — Current Phase

## ▶ Active phase: Phase 4.5 — BANA-Compliant Tactile Generator Upgrade

**Status:** Not started
**Spec:** `docs/superpowers/specs/2026-06-03-bana-tactile-generator-design.md`

### Task
Upgrade the Phase 4 tactile renderer to produce BANA-compliant printable tactile graphics. Introduces domain-aware symbol rendering (circuits, chemistry, geometry, FBD), organic shape primitives (biology/anatomy), a recipe system for unknown structures, multi-page output, lead-line labels, and exploration instructions. A second Claude call handles complex/biology/anatomy domains.

Before writing any code, read the full spec at `docs/superpowers/specs/2026-06-03-bana-tactile-generator-design.md` — all architecture, type, and behaviour decisions are there.

### Checklist (Phase 4.5)
- [ ] Read full spec before touching any code
- [ ] Add `symbolHint` (`z.string().nullish()`) to `DiagramElementSchema` in `src/types/diagram.ts`
- [ ] Add `explorationInstructions` (`z.string().nullish()`) to `DiagramAnalysisSchema` in `src/types/diagram.ts`
- [ ] Add new types to `src/types/tactile.ts`: `TactileDomain`, `TactileStrategy`, `TactileBasePrimitive`, `TactileModifier`, `ShapeParams`, `TactileSymbolRecipe`, `LabelMethod`, `SymbolResolution`, `AdaptedDiagramElement`, `AITactileAdaptationPlan`, `TactilePageSpec`, `PageDimensions`, `ZoneRect`
- [ ] Add new `ComponentShape` values for domain symbols (battery, resistor, capacitor, switch, lamp, inductor, diode, atom-circle, bond-line, force-arrow-scaled, angle-arc, right-angle-mark)
- [ ] Update `TactilePlan` in `src/types/tactile.ts`: replace `page` with `PageDimensions`, add `titleZone`, `instructionsZone`, `keyZone` as `ZoneRect`; add new validation codes
- [ ] Add `symbolHint` and `explorationInstructions` instructions to `DIAGRAM_ANALYSIS_PROMPT` in `src/lib/prompts.ts`
- [ ] Add `TACTILE_ADAPTATION_PROMPT` to `src/lib/prompts.ts`
- [ ] Create `src/lib/svg/tactileAdaptor.ts` with domain classification, strategy selection, symbol resolution (3-tier), page split logic, and `buildTactileAdaptation()`
- [ ] Update `src/lib/svg/tactilePlanner.ts` to accept `TactilePageSpec` instead of `DiagramAnalysis`; add zone layout for title/instructions/key
- [ ] Add domain symbol draw functions to `src/lib/svg/tactileRenderer.ts` (all 12 symbols from Section 8.1)
- [ ] Add organic primitive draw functions to `src/lib/svg/tactileRenderer.ts` (rounded-lobe, pointed-lobe, bean-region + all modifiers)
- [ ] Add `drawRecipe()` dispatcher and lead-line label rendering to `src/lib/svg/tactileRenderer.ts`
- [ ] Add `drawInstructions()` zone renderer to `src/lib/svg/tactileRenderer.ts`
- [ ] Update `/api/tactile/route.ts`: call adaptor → loop planner/renderer per page → return `{ pages: string[], pageTitles: string[] }`
- [ ] Update `TactileSVG.tsx`: parse JSON response, add multi-page state, page indicator, Prev/Next buttons, zip download
- [ ] Install `elkjs` (server-only) and `jszip` (client)
- [ ] Write unit tests: adaptor domain classification, `normalizeSymbolHint`, symbol resolution tiers, recipe dispatcher, organic draw functions
- [ ] Zero TypeScript errors

### Definition of done (Phase 4.5)
- [ ] `symbolHint` and `explorationInstructions` present in `DiagramAnalysis` for all diagram types
- [ ] `tactileAdaptor.ts` classifies domain and selects strategy for all 14 domain types
- [ ] `normalizeSymbolHint` runs before all `KNOWN_SYMBOLS` lookups
- [ ] `SymbolResolution` union used throughout the symbol resolution pipeline
- [ ] Second Claude call fires under all complexity trigger conditions
- [ ] Second Claude call receives image for biology/anatomy/map/spatial; JSON-only for other domains
- [ ] All 12 domain symbols render correctly
- [ ] Organic primitives render with all modifiers
- [ ] `drawRecipe()` dispatcher resolves base + modifiers + label method
- [ ] Adaptation metadata flows adaptor → `TactilePageSpec` → planner → renderer without re-derivation
- [ ] Page zones: title → drawing → instructions → key on every page
- [ ] Exploration instructions render as braille in instructions zone; overflow emits `INSTRUCTIONS_OVERFLOW`
- [ ] Multi-page output: `flow-sequence` → overview + exploration; `labelled-region-map` → splits only on key overflow; `chart-reconstruction` → concrete thresholds
- [ ] Lead-line labels use bbox-aware routing; unresolved collisions emit `LEAD_LINE_COLLISION`
- [ ] `elkjs` drives layout for `flow-sequence` only
- [ ] `/api/tactile` returns `{ pages: string[], pageTitles: string[] }`
- [ ] `TactileSVG.tsx` shows page navigation and downloads zip for multi-page output
- [ ] BANA physical constants enforced; `ShapeParams` clamped before drawing
- [ ] All new validation codes fire correctly
- [ ] Zero TypeScript errors
- [ ] Existing Vitest tests pass; new unit tests for adaptor, normalization, resolution, recipe, organic draw functions

---

Before writing any code, read:
- `docs/superpowers/specs/2026-06-03-bana-tactile-generator-design.md` — full Phase 4.5 spec (authoritative)
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

---

## Phase 5 task summary — Navigable diagram map

**Status:** Not started (begins after Phase 4.5 is complete)

### Task
Build a keyboard and screen-reader navigable interface using `@react-aria/focus` and `@react-aria/live-announcer`. Use GSAP to animate element highlighting as the user traverses the diagram.

### Checklist (Phase 5)
- [ ] Query Context7 for `@react-aria/live-announcer`, `@react-aria/focus`, and `gsap` docs before writing
- [ ] Build `DiagramMap` component that takes `DiagramAnalysis`
- [ ] Render elements as focusable nodes; use `element.position` for spatial layout where available, sequential list otherwise
- [ ] Use `@react-aria/focus` for focus management — `FocusScope` to trap/manage focus within the map
- [ ] Keyboard: Tab/Shift+Tab between elements, Arrow keys spatial, Enter/Space expand details, Escape exit
- [ ] Use `@react-aria/live-announcer` to announce each element: label, type, value, relationships
- [ ] GSAP pulsing border on focused element, connection lines on expand
- [ ] "Map mode" toggle keyboard accessible

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

### Definition of done (Phase 4 — ✅)
1. ✅ Tactile SVG renders for all three diagram types
2. ✅ All labels are Unicode Braille
3. ✅ SVG has no fill colors — stroke only
4. ✅ ViewBox is A4 proportioned (794×1123)
5. ✅ `braille.ts` has Vitest unit tests covering ASCII range
6. ✅ Zoom controls work at all 6 levels; Fit resets to 100%
7. ✅ Download triggers `sonner` toast

---

## Phase 3 task summary

Take the `narration` steps from `DiagramAnalysis` and speak them using the Web Speech API. Add an OpenAI TTS fallback for unsupported browsers or MP3 export. Use Motion to animate the step list as audio plays.

### Checklist (Phase 3 — completed)
- [x] Query Context7 for Web Speech API and `motion` docs before writing
- [x] Build `AudioPlayer` component that accepts `NarrationStep[]`
- [x] Implement Web Speech API: chain steps sequentially, use `@react-aria/live-announcer` to also announce each step to screen readers independently of TTS
- [x] Detect Web Speech API support; if unavailable, render "Download MP3" button instead of play controls
- [x] Implement OpenAI TTS fallback via `/api/tts` POST route (sends full narration text, returns MP3 blob)
- [x] Wrap OpenAI TTS call in `p-retry`
- [x] Add play/pause/stop controls with full keyboard support and `aria-label` on every control
- [x] Use Motion to animate the active step highlight — smooth slide/fade as steps advance
- [x] Show current step text visually as it plays (for low-vision users)
- [x] `sonner` toast on MP3 download success

### Definition of done (Phase 3 — ✅)
1. ✅ Clicking "Play" speaks the full narration step by step
2. ✅ Active step is highlighted with a Motion animation as audio advances
3. ✅ `@react-aria/live-announcer` announces each step independently (screen reader test)
4. ✅ Play/pause/stop work correctly with keyboard
5. ✅ In a browser without Web Speech API, "Download MP3" appears and produces a valid MP3
6. ✅ All controls have `aria-label` attributes
7. ✅ `sonner` toast confirms MP3 download

---

## Phase history

| Phase | Status |
|---|---|
| Phase 1 — Scaffolding & image input | ✅ Done |
| Phase 2 — Claude Vision extraction | ✅ Done |
| Phase 3 — Audio walkthrough (TTS) | ✅ Done |
| Phase 4 — Tactile / braille SVG | ✅ Done |
| Phase 4.5 — BANA-compliant tactile upgrade | ▶ Active |
| Phase 5 — Navigable diagram map | 🔲 Not started |
| Phase 6 — Polish, animations & deploy | 🔲 Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`
