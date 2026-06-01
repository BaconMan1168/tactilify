# 05 — Current Phase

## ▶ Active phase: Phase 1 — Project scaffolding & image input

**Status:** Not started

Before writing any code, read:
- `docs/00_build_spec.md` — what you're building and why
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use

---

## Phase 1 task summary

Set up the Next.js project and build the image input UI. No AI yet — just get an image into the app.

### Checklist
- [ ] Init Next.js with TypeScript, Tailwind CSS, App Router
- [ ] Configure `.env.local` and `.env.example`
- [ ] Build `ImageUploader` component (drag-and-drop + click-to-browse)
- [ ] Build `CameraCapture` component (getUserMedia + capture button)
- [ ] Display image preview after upload/capture
- [ ] Basic accessible layout (skip-nav, semantic landmarks, focus indicators)
- [ ] Deploy to Vercel, confirm zero build errors

### Definition of done
Phase 1 is complete when:
1. User can upload an image and see a preview ✅
2. User can open camera, capture a frame, and see a preview ✅
3. Both inputs produce a base64 string in React state ✅
4. Page passes axe scan with zero critical errors ✅
5. App is live on Vercel ✅

---

## Phase history

| Phase | Status |
|---|---|
| Phase 1 — Scaffolding & image input | 🔲 Not started |
| Phase 2 — Claude Vision extraction | 🔲 Not started |
| Phase 3 — Audio walkthrough (TTS) | 🔲 Not started |
| Phase 4 — High-contrast SVG renderer | 🔲 Not started |
| Phase 5 — Tactile / braille SVG | 🔲 Not started |
| Phase 6 — Navigable diagram map | 🔲 Not started |
| Phase 7 — Polish & deploy | 🔲 Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`