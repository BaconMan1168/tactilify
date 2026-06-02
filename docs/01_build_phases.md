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
- Handle the three diagram types with type-discriminated Zod schemas
- Return structured JSON to the client; display raw JSON in a collapsible debug panel (dev only)
- Loading state shows a `sonner` toast: "Analyzing your diagram…"
- Error states surface as `sonner` toast errors with retry affordance

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

### Definition of done ✅
- [ ] `/api/analyze` returns valid, Zod-validated `DiagramAnalysis` JSON for a circuit diagram test image
- [ ] `/api/analyze` returns valid JSON for a bar chart test image
- [ ] `/api/analyze` returns valid JSON for a free-body diagram test image
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
**Complexity:** Medium-High | **Risk:** Medium

### Task
Generate a braille-print SVG variant using `xmlbuilder2`, optimised with `svgo`: outline-only strokes, no fills, braille-encoded labels via a hand-rolled `braille.ts` encoder. A4 sized for direct swell-paper printing.

### Steps
- Query Context7 for `xmlbuilder2` docs if needed
- Implement `src/lib/braille.ts` — a lookup-table ASCII → Unicode Grade 1 Braille (U+2800–U+28FF) encoder. Do NOT use an npm braille package; hand-roll the lookup table for reliability
- Build `TactileRenderer` using `xmlbuilder2`:
  - All fills removed (stroke only, min 2pt stroke-width)
  - No color — pure black strokes on white
  - Labels replaced with `braille.ts`-encoded Unicode Braille characters
  - Standard tactile symbol conventions for circuit elements where possible
  - ViewBox sized to A4 (794×1123px at 96dpi)
- Run output through `svgo`
- Add "Download Tactile SVG" button with `sonner` toast
- On-screen note: "Optimised for swell-paper or tactile embossing printers. Print at 100% scale."

### Definition of done ✅
- [ ] Tactile SVG renders for all three diagram types
- [ ] All labels are Unicode Braille (verified character by character against braille chart)
- [ ] SVG has no fill colors — stroke only, confirmed by `svgo` output inspection
- [ ] ViewBox is A4 proportioned (794×1123)
- [ ] Downloaded SVG opens correctly in Inkscape/Illustrator without errors
- [ ] `braille.ts` has unit tests (Vitest) covering full ASCII range

---

## Phase 5 — Navigable diagram map
**Complexity:** High | **Risk:** Medium-High

### Task
Build a keyboard and screen-reader navigable interface using `@react-aria/focus` and `@react-aria/live-announcer`. Use GSAP to animate element highlighting as the user traverses the diagram.

### Steps
- Query Context7 for `@react-aria/live-announcer`, `@react-aria/focus`, and `gsap` docs before writing
- Build `DiagramMap` component that takes `DiagramAnalysis`
- Render elements as focusable nodes; use `element.position` for spatial layout where available, sequential list otherwise
- Use `@react-aria/focus` for focus management — `FocusScope` to trap/manage focus within the map
- Keyboard interactions:
  - `Tab` / `Shift+Tab` — move between elements
  - `Arrow keys` — move spatially when positions are available
  - `Enter` / `Space` — expand element details (value, connected elements)
  - `Escape` — exit map mode back to results view
- Use `@react-aria/live-announcer` (not raw `aria-live`) to announce each element: label, type, value, relationships
- Use GSAP to animate the active node highlight — draw a pulsing border around the focused element
- Use GSAP to draw connection lines between the active element and its related elements on expand
- "Map mode" toggle switches results panel to diagram map; toggle is keyboard accessible

### Definition of done ✅
- [ ] All diagram elements reachable by Tab navigation
- [ ] Arrow key spatial navigation works when positions available
- [ ] `@react-aria/live-announcer` announces element on focus — verified with VoiceOver or NVDA
- [ ] `@react-aria/focus` manages focus scope correctly — no focus escaping the map unintentionally
- [ ] Enter/Space expands element and shows connections, announced via live announcer
- [ ] Escape exits map mode cleanly
- [ ] GSAP animates active node highlight and connection lines on expand
- [ ] Map mode toggle is keyboard accessible with visible focus indicator

---

## Phase 6 — Polish, animations & Vercel deploy
**Complexity:** Low | **Risk:** Low

### Task
Full UI polish pass with Motion animations throughout, sample images for the demo, error hardening, and production deploy.

### Steps
- Query Context7 for `motion` docs for any new animation patterns
- Add 3 sample diagram images (`/public/samples/`) with one-click "Try this example" buttons — these should work instantly without upload
- Landing page: app name, tagline, brief how-to, and Motion staggered entrance animation on load
- Results page: Motion stagger the three output panels appearing after analysis completes
- Ensure all three output panels are in a clean layout on desktop using shadcn `Card` components
- Mobile layout: single column, all panels accessible, touch targets minimum 44×44px
- Add `<meta>` tags, favicon, `og:image` for Vercel share preview
- Final accessibility audit: axe scan + full keyboard walkthrough of all panels
- Set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in Vercel dashboard
- Set `vercel.json` `maxDuration: 60` on `/api/analyze` and `/api/tts`
- Smoke test on production URL with all three sample diagrams

### Definition of done ✅
- [ ] Three sample diagrams work end-to-end on the production Vercel URL
- [ ] All three output panels render correctly on desktop and mobile
- [ ] Motion stagger animation plays when results appear
- [ ] Zero critical or serious axe violations
- [ ] App loads in under 3 seconds on a standard connection
- [ ] Production URL is live and demo-ready