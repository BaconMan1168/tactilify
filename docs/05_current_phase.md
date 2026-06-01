# 05 — Current Phase

## ▶ Active phase: Phase 1 — Project scaffolding & image input

**Status:** Not started

Before writing any code, read:
- `docs/00_build_spec.md` — what you're building and why
- `docs/02_repo_structure.md` — where every file goes
- `docs/03_tech_stack.md` — what libraries to use (query Context7 for any library before using it)

---

## Phase 1 task summary

Set up the Next.js 16 project, install all dependencies, and build the image input UI. No AI yet — just get an image into the app.

### Checklist
- [ ] Init Next.js 16 with TypeScript 6, Tailwind CSS 4, App Router
- [ ] Run full install command from `docs/03_tech_stack.md`
- [ ] Run `npx shadcn@latest init` and add base components via shadcn MCP
- [ ] Configure `.env.local` and `.env.example`
- [ ] Build `ImageUploader` component using `react-dropzone` (drag-and-drop + click-to-browse, accepts JPEG/PNG/WebP/PDF)
- [ ] Build `CameraCapture` component (`getUserMedia` + capture button, saves frame as base64)
- [ ] Wire up `/api/preprocess` route: `file-type` validation, `sharp` resize/normalize, `pdfjs-dist` PDF→image, `nanoid` upload ID
- [ ] Display image preview after upload/capture with Motion fade-in
- [ ] Basic accessible layout (skip-nav, semantic landmarks, visible focus indicators)
- [ ] Wire up `@axe-core/react` in dev mode

### Definition of done
Phase 1 is complete when:
1. User can drag-and-drop or click to upload JPEG/PNG/WebP/PDF and see a preview ✅
2. User can open camera, capture a frame, and see a preview ✅
3. Both inputs produce a preprocessed base64 string (via `sharp`) + `nanoid` ID in React state ✅
4. PDF uploads convert to image via `pdfjs-dist` before preview ✅
5. Invalid file types surface as a `sonner` toast error ✅
6. Page passes axe scan with zero critical errors ✅

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
| Phase 7 — Polish, animations & deploy | 🔲 Not started |

---

## How to advance the phase

When the current phase's definition of done is fully met:
1. Mark all checklist items above as ✅
2. Update the phase history table (mark current as ✅ Done)
3. Change "Active phase" at the top to the next phase
4. Copy the next phase's task summary and checklist from `docs/01_build_phases.md`