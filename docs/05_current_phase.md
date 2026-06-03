# 05 — Current Phase

## ▶ Active phase: Phase 5 — Navigable diagram map

**Status:** Not started

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

Before writing any code, read:
- `docs/00_build_spec.md` — what you're building and why
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

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
| Phase 5 — Navigable diagram map | 🔲 Not started |
| Phase 6 — Polish, animations & deploy | 🔲 Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`
