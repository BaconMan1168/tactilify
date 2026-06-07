# 01 — Build Phases

Phases are ordered by complexity: simplest and highest-confidence first, most complex last. Each phase is independently shippable. If time runs out, earlier phases form a complete demo.

---

## Phase 1 — Project scaffolding & image input
**Complexity:** Low | **Risk:** Low

### Task
Set up the Next.js 16 project, environment config, all dependencies, and the image input UI (upload + camera capture). No AI yet — just get an image into the app and display it.

### Steps
- Init Next.js 16 app with TypeScript 6, Tailwind CSS 4, App Router
- Run full install command from `docs/03_tech_stack.md`
- Run `npx shadcn@latest init` and add base components via the shadcn MCP
- Configure `.env.local` with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`
- Query Context7 for `react-dropzone` docs, then build `ImageUploader` component using `react-dropzone` — drag-and-drop + click-to-browse, accepts JPEG/PNG/WebP/PDF
- Build `CameraCapture` component: `getUserMedia` live feed, capture button saves frame as base64 using `nanoid` for upload ID
- Basic `sharp` preprocessing on upload: resize to max 2048px, normalize to JPEG — do this client-side via a `/api/preprocess` route so Claude gets consistent input
- Display captured/uploaded image in a preview panel using a Motion fade-in
- Basic accessible layout: skip-to-main link, semantic landmarks, visible focus indicators
- `@axe-core/react` wired up in dev mode

### Definition of done ✅
- [ ] User can drag-and-drop or click to upload an image (JPEG/PNG/WebP/PDF); preview renders
- [ ] User can open camera, see live feed, click capture; preview renders
- [ ] Both inputs produce a preprocessed base64 string (via `sharp`) stored in React state with a `nanoid` ID
- [ ] PDF uploads are converted to an image via `pdfjs-dist` before preview
- [ ] `file-type` validates file on the server — invalid types show a `sonner` toast error
- [ ] Page passes axe scan with zero critical errors

---

## Phase 2 — Claude Vision: diagram classification & structured extraction
**Complexity:** Medium | **Risk:** Medium

### Task
Send the preprocessed image to Claude Vision via a Next.js API route. Claude classifies the diagram type and returns a validated, structured JSON object describing all components and relationships. Use `zod` for schema validation and `jsonrepair` to handle near-valid JSON from Claude.

### Steps
- Query Context7 for `@anthropic-ai/sdk` and `zod` docs before writing
- Create `/api/analyze` POST route that accepts base64 image
- Design the extraction prompt (see schema below)
- Define Zod schemas in `src/types/diagram.ts` — these are the source of truth for `DiagramAnalysis` and all sub-types
- In the API route: send image to Claude → run response through `jsonrepair` → validate with Zod schema → return typed JSON
- Wrap Claude call in `p-retry` (3 attempts, exponential backoff) for transient failures
- Classify into a rendering category (`connected-graph`, `chart`, `vector-field`, `spatial`, `other`) — not a closed list of domain types
- Return structured JSON to the client; display raw JSON in a collapsible debug panel (dev only)
- Loading state shows a `sonner` toast: "Analyzing your diagram…"
- Error states surface as `sonner` toast errors with retry affordance

### DiagramAnalysis Zod schema (source of truth)
```ts
// src/types/diagram.ts
import { z } from 'zod'
import { nanoid } from 'nanoid'

// Rendering category — drives layout algorithm. Not a closed list of science domains.
// 'connected-graph': circuits, logic gates, flowcharts, reaction mechanisms
// 'chart':           bar, line, pie, titration curves, decay curves, scatter plots
// 'vector-field':    free-body, ray diagrams, electric field lines, momentum diagrams
// 'spatial':         orbital diagrams, crystal structures, atomic models, Punnett squares
// 'other':           fallback grid layout
export const DiagramCategorySchema = z.enum([
  'connected-graph',
  'chart',
  'vector-field',
  'spatial',
  'other',
])

export const DiagramElementSchema = z.object({
  id: z.string().default(() => nanoid()),
  label: z.string(),          // e.g. "9V Battery", "Resistor", "Gravitational Force"
  type: z.string(),           // free-text domain type from Claude, e.g. "battery", "bar", "lens"
  value: z.string().optional(),              // e.g. "9V", "100Ω", "32N"
  position: z.object({                       // Normalised 0–1 centroid position
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }).optional(),
  visualShape: z.enum(['rect', 'circle', 'diamond', 'arrow', 'arc', 'path']).optional(),
  boundingBox: z.object({                    // Normalised 0–1 bounding box
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0).max(1),
    h: z.number().min(0).max(1),
  }).optional(),
})

export const RelationshipSchema = z.object({
  from: z.string(),                          // element id
  to: z.string(),                            // element id
  type: z.string(),                          // e.g. "connected-to", "acts-on", "reacts-with"
  label: z.string().optional(),
  directed: z.boolean().optional(),          // true → render arrowhead on tactile line
  geometry: z.array(z.object({              // intermediate waypoints (normalised 0–1)
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })).optional(),
})

export const NarrationStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string(),                          // Full TTS sentence
  elementId: z.string().optional(),          // Links step to a diagram element
})

export const DiagramAnalysisSchema = z.object({
  type: DiagramCategorySchema,
  title: z.string(),
  summary: z.string(),
  elements: z.array(DiagramElementSchema),
  relationships: z.array(RelationshipSchema),
  narration: z.array(NarrationStepSchema),
})

export type DiagramCategory = z.infer<typeof DiagramCategorySchema>
export type DiagramAnalysis = z.infer<typeof DiagramAnalysisSchema>
export type DiagramElement = z.infer<typeof DiagramElementSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type NarrationStep = z.infer<typeof NarrationStepSchema>
```

### Definition of done ✅
- [ ] `/api/analyze` returns valid, Zod-validated `DiagramAnalysis` JSON for a circuit diagram test image
- [ ] `/api/analyze` returns valid JSON for a bar chart test image
- [ ] `/api/analyze` returns valid JSON for a free-body diagram test image
- [ ] `/api/analyze` returns valid JSON for a diagram outside the three common types (e.g. ray diagram)
- [ ] `jsonrepair` handles a deliberately malformed Claude response without crashing
- [ ] `p-retry` retries on transient 5xx errors; logs retry attempts
- [ ] Zod types are the single source of truth — no separate `interface` declarations
- [ ] `sonner` toast shows during loading and on error
- [ ] Error toast includes a retry button that re-fires the API call

---

## Phase 3 — Audio walkthrough (TTS narration)
**Complexity:** Low | **Risk:** Low

### Task
Take the `narration` steps from `DiagramAnalysis` and speak them using the Web Speech API. Add an OpenAI TTS fallback for unsupported browsers or MP3 export. Use Motion to animate the step list as audio plays.

### Steps
- Query Context7 for Web Speech API and `motion` docs before writing
- Build `AudioPlayer` component that accepts `NarrationStep[]`
- Implement Web Speech API: chain steps sequentially, use `@react-aria/live-announcer` to also announce each step to screen readers independently of TTS
- Detect Web Speech API support; if unavailable, render "Download MP3" button instead of play controls
- Implement OpenAI TTS fallback via `/api/tts` POST route (sends full narration text, returns MP3 blob)
- Wrap OpenAI TTS call in `p-retry`
- Add play/pause/stop controls with full keyboard support and `aria-label` on every control
- Use Motion to animate the active step highlight — smooth slide/fade as steps advance
- Show current step text visually as it plays (for low-vision users)
- `sonner` toast on MP3 download success

### Definition of done ✅
- [ ] Clicking "Play" speaks the full narration step by step
- [ ] Active step is highlighted with a Motion animation as audio advances
- [ ] `@react-aria/live-announcer` announces each step independently (screen reader test)
- [ ] Play/pause/stop work correctly with keyboard
- [ ] In a browser without Web Speech API, "Download MP3" appears and produces a valid MP3
- [ ] All controls have `aria-label` attributes
- [ ] `sonner` toast confirms MP3 download

---

## Phase 4 — Tactile / braille-print SVG
**Complexity:** Medium-High | **Risk:** Medium | **Status:** Superseded by Phase 6

Initial programmatic SVG generation via `xmlbuilder2`/`svgo` and a 5-stage adapt→plan→render→validate→repair pipeline. Replaced by LLM-direct generation (Phase 6), which produces higher-quality tactile output without a custom renderer.

`src/lib/braille.ts` — the ASCII → Unicode Grade 1 Braille encoder built in this phase — is still used for Braille dot post-processing in `/api/llm-tactile`.

---

## Phase 6 — LLM-direct tactile SVG generation
**Complexity:** Medium | **Risk:** Low | **Status:** ✅ Done

### Task
Replace the programmatic pipeline with direct Claude Vision SVG generation. Claude receives the raw image and a detailed tactile design prompt, then produces multi-page A4 SVG output. A post-processing pass converts letter markers and key entries to Braille dot geometry using `braille.ts`.

### Definition of done ✅
- [x] `/api/llm-tactile` calls Claude Vision with image + tactile prompt; returns `{ svgPages, speechScript }`
- [x] Braille dot post-processing applied to letter markers (diagram pages) and KEY section (reference page)
- [x] `speechScript` extracted from reference page before Braille conversion — used for TTS read-aloud
- [x] `TactileSVG.tsx` calls `/api/llm-tactile` with raw image; displays multi-page preview with zoom and download
- [x] NOT_A_DIAGRAM sentinel guards against non-diagram uploads
- [x] Zero TypeScript errors

---

## Phase 7 — Polish, animations & Vercel deploy
**Complexity:** Low | **Risk:** Low

### Task
Error hardening, and production deploy.

### Steps
- Query Context7 for `motion` docs for any new animation patterns
- Mobile layout: single column, all panels accessible, touch targets minimum 44×44px
- Add `<meta>` tags, favicon, `og:image` for Vercel share preview
- Final accessibility audit: axe scan + full keyboard walkthrough of all panels

### Definition of done ✅
- [ ] Zero critical or serious axe violations
- [ ] App loads in under 3 seconds on a standard connection
- [ ] Production URL is live and demo-ready