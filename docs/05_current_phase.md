# 05 — Current Phase

## ▶ Active phase: Phase 3 — Audio walkthrough (TTS narration)

**Status:** Not started

Before writing any code, read:
- `docs/00_build_spec.md` — what you're building and why
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

---

## Phase 3 task summary

Take the `narration` steps from `DiagramAnalysis` and speak them using the Web Speech API. Add an OpenAI TTS fallback for unsupported browsers or MP3 export. Use Motion to animate the step list as audio plays.

### Checklist
- [ ] Query Context7 for Web Speech API and `motion` docs before writing
- [ ] Build `AudioPlayer` component that accepts `NarrationStep[]`
- [ ] Implement Web Speech API: chain steps sequentially, use `@react-aria/live-announcer` to also announce each step to screen readers independently of TTS
- [ ] Detect Web Speech API support; if unavailable, render "Download MP3" button instead of play controls
- [ ] Implement OpenAI TTS fallback via `/api/tts` POST route (sends full narration text, returns MP3 blob)
- [ ] Wrap OpenAI TTS call in `p-retry`
- [ ] Add play/pause/stop controls with full keyboard support and `aria-label` on every control
- [ ] Use Motion to animate the active step highlight — smooth slide/fade as steps advance
- [ ] Show current step text visually as it plays (for low-vision users)
- [ ] `sonner` toast on MP3 download success

### Definition of done
Phase 3 is complete when:
1. Clicking "Play" speaks the full narration step by step
2. Active step is highlighted with a Motion animation as audio advances
3. `@react-aria/live-announcer` announces each step independently (screen reader test)
4. Play/pause/stop work correctly with keyboard
5. In a browser without Web Speech API, "Download MP3" appears and produces a valid MP3
6. All controls have `aria-label` attributes
7. `sonner` toast confirms MP3 download

---

## Phase history

| Phase | Status |
|---|---|
| Phase 1 — Scaffolding & image input | ✅ Done |
| Phase 2 — Claude Vision extraction | ✅ Done |
| Phase 3 — Audio walkthrough (TTS) | ▶ In progress |
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
