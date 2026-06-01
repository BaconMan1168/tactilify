# Phase 1 Design — Scaffolding & Image Input

**Date:** 2026-06-01  
**Phase:** 1 — Project scaffolding & image input  
**Status:** Approved

---

## What this phase delivers

A Next.js 16 project with a fully functional image input page. No AI calls. The output of this phase is a preprocessed base64 image string + `nanoid` ID in React state, ready for Phase 2 to consume.

---

## Page layout

Single-page shell. Asymmetric layout — not centered, not card-in-a-box:

- **Headline**: top-left, large display type (~52px, letter-spacing -3px). Takes up the left half of the viewport vertically.
- **Upload card**: bottom-right, fixed width (~260px). Never full-width.
- **Background**: the rest is the near-black canvas (`#010102`) with the circuit animation running behind everything.

No traditional nav bar in Phase 1. The Tactilify wordmark appears as the eyebrow label above the headline.

---

## Background & entrance animation

The "WOW" is the background: SVG circuit traces that slowly draw themselves on page load, looping indefinitely.

- **Traces**: 3 SVG `<path>` elements with `stroke-dashoffset` draw-on animation. Slow cycles (7–10s per path, staggered). Color: `#5e6ad2` (primary) and `#828fff` (lighter variant), plus a dim `#3a3f6b` tertiary trace.
- **Nodes**: `<circle>` elements at path junctions that pulse in radius and opacity (3–5px, 3–4s cycles).
- **Implementation**: Pure CSS keyframe animations on SVG elements. No JS required for the circuit itself.
- **No emojis anywhere.** Text labels, SVG icons, or nothing.

---

## 4-state flow

### State 1 — Landing

- Circuit traces animate at full opacity.
- Headline visible at full size: "Make any diagram accessible".
- Tagline below headline (16px, `#8a8f98`): describes what the tool does.
- Upload card bottom-right: `react-dropzone` dropzone + "Use camera instead" text button below it.
- No preview panel yet.

### State 2 — Preview (after upload/capture)

- Circuit dims to ~30% opacity via CSS transition.
- Preview card animates in beside the upload card (Motion `width` + `opacity` spring, ~0.8s).
- Preview card shows: image thumbnail, filename, file size, "Analyze this diagram" confirm button.
- Upload card shrinks slightly in flex width to accommodate the preview card.
- Headline and tagline remain visible — no layout shift above.

### State 3 — Processing (after confirm)

- Circuit traces switch from slow draw-on to fast pulse mode (opacity 0.15 → 1.0, ~1s cycle). Circuit opacity ~55%.
- The layout above fades. A processing card appears bottom-right (same position as upload card).
- Processing card contains:
  - Image thumbnail with an animated scan line sweeping top-to-bottom (CSS keyframe, `box-shadow` glow on the line).
  - Progress label + percentage counter.
  - Single `<div>` progress bar track with a `linear-gradient` fill (`#5e6ad2` → `#828fff`).
  - 4 step indicators with dot + label: Classifying diagram type → Extracting objects & relationships → Generating narration → Building accessible outputs. Each transitions: pending (dim) → active (white + pulsing dot) → done (green).
- Auto-advances to State 4 when progress reaches 100%.

### State 4 — Results

- Circuit fades entirely (opacity 0, 1.4s transition).
- Page cross-fades to a clean results layout (no circuit, no hero headline).
- **Thin top nav**: Tactilify wordmark left · "Analysis complete" status badge (green dot) center · "New diagram" secondary button right.
- **Body split**:
  - Left (44%): image preview thumbnail + filename + diagram type metadata.
  - Right (56%): "Accessible outputs" section label + 4 output chips (Audio walkthrough, High-contrast SVG, Tactile/braille SVG, Navigable diagram map) + "Explore outputs" primary button.
- Output chips animate in with Motion `translateY` + `opacity` stagger (0.06s delay between each).
- "New diagram" clears the current image from React state and resets to State 1 (circuit resumes, landing layout restored).

**Note:** In Phase 1, the outputs are not yet generated. The output chips are present in the UI as placeholders — they will be wired to real data in Phase 2. The "Explore outputs" button is disabled/inert in Phase 1.

---

## Components

### `ImageUploader` (`src/components/input/ImageUploader.tsx`)

- `react-dropzone` for drag-and-drop + click-to-browse.
- Accepts: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- On drop: calls `/api/preprocess` route.
- On invalid type: fires `sonner` toast error — no modal, no inline error state.
- Renders the dropzone zone + "Use camera instead" button.
- Props: `onImageReady(base64: string, id: string): void`.

### `CameraCapture` (`src/components/input/CameraCapture.tsx`)

- Activated by the "Use camera instead" button in `ImageUploader`.
- Opens via `getUserMedia({ video: true })`.
- Shows live feed + "Capture" button. Captures current frame as base64 via `<canvas>`.
- On capture: calls `/api/preprocess` route with the base64 frame.
- Renders inline (not a modal): the dropzone content inside the upload card is swapped out for the live camera feed. The card container stays in place.
- "Use photo instead" link appears below the feed to switch back to the dropzone.
- Props: `onImageReady(base64: string, id: string): void`.

### `/api/preprocess` (`src/app/api/preprocess/route.ts`)

- `POST`: accepts `multipart/form-data` (file upload) or `application/json` (base64 string from camera).
- Server-side: `file-type` validation → reject if not JPEG/PNG/WebP/PDF → `sonner` toast on client.
- PDFs: `pdfjs-dist` renders first page to canvas → extract as PNG buffer.
- Images: `sharp` resize to max 1920px on longest side, convert to JPEG, normalize.
- Returns: `{ id: string (nanoid), base64: string, mimeType: string }`.
- Never writes to disk. All processing is in-memory.

### `SampleImages` (`src/components/input/SampleImages.tsx`)

- Three "Try this example" buttons: circuit, graph, free-body.
- On click: fetches image from `/public/samples/`, calls `/api/preprocess`, triggers the same flow as a real upload.
- Renders below the upload card as small text links. Hidden in States 3 and 4 (not relevant once an image is confirmed).

---

## Animations — implementation rules

| Animation | Tool | Notes |
|---|---|---|
| Circuit trace draw-on | CSS keyframes (`stroke-dashoffset`) | No JS. Runs on mount, loops. |
| Circuit dim/pulse state change | CSS `transition: opacity` | Driven by class toggling in React state. |
| Preview card slide-in | Motion (`width`, `opacity`) | Spring easing, ~0.8s. |
| Scan line sweep | CSS keyframes (`top`) | Glowing line via `box-shadow`. |
| Progress fill | CSS `transition: width` | Simple, no library needed. |
| Results chip stagger | Motion (`y`, `opacity`) | `staggerChildren: 0.06s`. |
| State 4 cross-fade | Motion (`opacity`) on page sections | 1s ease. |

GSAP is not used in Phase 1. It is reserved for Phase 6 (navigable diagram map SVG sequencing).

---

## Accessibility

- `<a href="#main-content">Skip to content</a>` skip-nav as first element in `layout.tsx`.
- Semantic landmarks: `<header>`, `<main>`, `<nav>` where appropriate.
- All interactive elements: `aria-label`, correct `role`, visible focus ring (2px `#5e6ad2` outline).
- `@axe-core/react` imported in `layout.tsx` behind `process.env.NODE_ENV === 'development'` guard.
- `sonner` toasts: `role="alert"` (default in sonner).

---

## Design tokens (from `docs/06_design.md`)

| Token | Value | Use in Phase 1 |
|---|---|---|
| `canvas` | `#010102` | Page background |
| `surface-1` | `#0f1011` | Upload card, preview card, processing card |
| `primary` | `#5e6ad2` | Circuit traces, dropzone accent, confirm button, progress fill, focus rings |
| `primary-hover` | `#828fff` | Circuit secondary trace, progress gradient end |
| `ink` | `#f7f8f8` | Headline, body text |
| `ink-subtle` | `#8a8f98` | Tagline, secondary labels, camera button |
| `ink-tertiary` | `#62666d` | Dropzone hint text, metadata |
| `hairline` | `#23252a` | Card borders, dividers |
| `hairline-strong` | `#34343a` | Dropzone dashed border |
| `semantic-success` | `#27a644` | "Analysis complete" badge, done step dots |
| `rounded-md` | `8px` | Buttons |
| `rounded-lg` | `12px` | Cards |

Typography: display headline uses `SF Pro Display` fallback at 600 weight, -3px tracking. Body/labels use system-ui at 400/500 weight.

---

## Environment & config

```bash
# .env.local (not committed)
ANTHROPIC_API_KEY=sk-ant-...   # not used in Phase 1, but required for Phase 2
OPENAI_API_KEY=sk-...          # not used in Phase 1

# .env.example (committed)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

```json
// vercel.json
{
  "functions": {
    "src/app/api/analyze/route.ts": { "maxDuration": 60 },
    "src/app/api/tts/route.ts": { "maxDuration": 60 }
  }
}
```

---

## Definition of done (from `docs/05_current_phase.md`)

1. User can drag-and-drop or click to upload JPEG/PNG/WebP/PDF and see a preview.
2. User can open camera, capture a frame, and see a preview.
3. Both inputs produce a preprocessed base64 string (via `sharp`) + `nanoid` ID in React state.
4. PDF uploads convert to image via `pdfjs-dist` before preview.
5. Invalid file types surface as a `sonner` toast error.
6. Page passes axe scan with zero critical errors.
