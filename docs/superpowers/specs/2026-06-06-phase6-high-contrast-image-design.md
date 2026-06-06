---
name: phase6-high-contrast-image
description: Phase 6 revised design — high-contrast image enhancement via sharp pipeline, not diagram regeneration from DiagramAnalysis
metadata:
  type: project
---

# Phase 6 — High-Contrast Image Enhancement

**Date:** 2026-06-06
**Status:** Approved, ready for implementation

## What changed from the original Phase 6 plan

The original plan generated a new diagram SVG from `DiagramAnalysis` using `xmlbuilder2`. This revision abandons that approach entirely.

**New approach:** Take the original uploaded image and produce a contrast-enhanced version using deterministic image processing (sharp). No AI, no SVG generation, no `DiagramAnalysis` needed. The output is an enhanced PNG embedded in a thin SVG shell.

**Why:** The original approach would regenerate the diagram layout from scratch, losing spatial fidelity and original design intent. For low-vision users, preserving the original layout is critical — they need to reference the enhanced image alongside physical or peer copies. Semantic colors (artery red vs vein blue in anatomy; series vs parallel in circuits) must remain intact.

---

## API: `/api/high-contrast`

**Method:** POST

**Input:**
```ts
{ image: string }  // base64 of original/preprocessed image (no data: prefix)
```

**Output:**
```ts
{ base64: string }  // enhanced PNG as base64 (no data: prefix)
```

No `DiagramAnalysis` is required. This is image-in, image-out.

---

## Processor: `src/lib/image/highContrastProcessor.ts`

Named `Processor` (not `Renderer`) — it enhances an existing raster image, not generates a new diagram.

**Exports:**
```ts
export async function processHighContrast(imageBase64: string): Promise<string>
```

**Processing pipeline (sharp-only, no morphological dilation):**

Named constants at top of file for easy tuning after visual testing:
```ts
const HC_NORMALISE_LOWER = 1      // percentile: ignore darkest 1% (noise)
const HC_NORMALISE_UPPER = 99     // percentile: ignore brightest 1% (noise)
const HC_CLAHE_WIDTH = 8          // tile width for local contrast
const HC_CLAHE_HEIGHT = 8         // tile height for local contrast
const HC_CLAHE_MAX_SLOPE = 4      // contrast limiting factor
const HC_SHARPEN_SIGMA = 1.2      // unsharp mask radius
const HC_SHARPEN_M1 = 0.5         // flat area sharpening threshold
const HC_SHARPEN_M2 = 2.5         // jagged area sharpening amount
const HC_SATURATION = 1.5         // colour vibrancy boost (hue unchanged)
```

**Pipeline stages:**
1. `normalise({ lower: HC_NORMALISE_LOWER, upper: HC_NORMALISE_UPPER })` — stretch luminance to full dynamic range; darkens text/outlines, whitens backgrounds
2. `clahe({ width: HC_CLAHE_WIDTH, height: HC_CLAHE_HEIGHT, maxSlope: HC_CLAHE_MAX_SLOPE })` — local contrast enhancement; brings out detail in low-contrast regions without washing out bright regions
3. `sharpen({ sigma: HC_SHARPEN_SIGMA, m1: HC_SHARPEN_M1, m2: HC_SHARPEN_M2 })` — edge crispness; makes lines appear visually bolder without morphological dilation
4. `modulate({ saturation: HC_SATURATION })` — boosts colour vibrancy (S in HSL); remaps weak/pastel colours to stronger versions while keeping hue unchanged — semantic colour meaning preserved

**No morphological dilation.** Sharp's sharpening pass is sufficient for low-vision readability without the risk of merging nearby thin strokes.

**Output:** PNG buffer → base64 string

---

## Component: `src/components/output/HighContrastImage.tsx`

**Props:**
```ts
interface HighContrastImageProps {
  analysis: DiagramAnalysis   // for aria-label and download filename
  imageBase64: string         // original preprocessed image
  imageMimeType: string       // original mime type
}
```

**Behaviour:**
- Calls `/api/high-contrast` on mount with `{ image: imageBase64 }`
- Loading state: "Enhancing image for low-vision..." placeholder in viewport
- Error state: alert box with message
- Zoom controls: same 6-level pattern as `TactileSVG` (50 / 75 / 100 / 125 / 150 / 200%)
- Viewport: white background, scrollable, renders `<img>` from enhanced base64
- Two download buttons side by side:
  - **Download PNG** — base64 → Blob → anchor click → `sonner` toast
  - **Download SVG** — constructs `<svg xmlns="..." viewBox="0 0 W H"><image href="data:image/png;base64,..." width="W" height="H"/></svg>` → Blob → anchor click → `sonner` toast
- On-screen note: "Enhanced for low-vision users. Increase browser zoom for best results."

The SVG wrapping happens client-side. The server returns only the PNG base64. This keeps the server pure image-processing and gives the component full control over both download formats.

---

## Tab wiring (`src/app/page.tsx`)

Add to `OUTPUT_TABS`:
```ts
{ id: 'high-contrast', label: 'Hi-contrast' }
```

Add `TabsContent`:
```tsx
<TabsContent value="high-contrast">
  <HighContrastImage
    analysis={analysis}
    imageBase64={image.base64}
    imageMimeType={image.mimeType}
  />
</TabsContent>
```

`image.base64` and `image.mimeType` are already available in `page.tsx` state.

---

## Docs to update

### `docs/00_build_spec.md`
- High-contrast row in the outputs table: change description from "Simplified diagram with bold outlines, high-contrast fill, large labels — rendered in-browser" to "Contrast-enhanced version of the original diagram image — stronger colours, crisper lines, white background — for direct low-vision viewing"
- Core AI pipeline: remove "Renderer: produce high-contrast SVG from JSON" step; replace with "sharp: enhance original image for low-vision (normalise → CLAHE → sharpen → saturation boost)"

### `docs/01_build_phases.md` — Phase 6 section
Rewrite task, steps, and definition of done:
- Task: enhance the original image (not generate from DiagramAnalysis)
- Steps: query Context7 for sharp docs; create `highContrastProcessor.ts`; create `/api/high-contrast`; build `HighContrastImage.tsx`; wire tab; dual download
- DoD: works on circuit/chart/free-body/anatomical/other; color preserved; labels readable; lines visually bolder; download (PNG + SVG) triggers sonner toast; zero TS errors

### `docs/02_repo_structure.md`
- Add `/api/high-contrast/route.ts` entry
- Add `src/lib/image/` directory with `highContrastProcessor.ts`
- Update `output/` section: change `HighContrastSVG.tsx` placeholder comment → `HighContrastImage.tsx` (Phase 6)
- Update `lib/svg/` section note: clarify it is tactile-only; high-contrast processing lives in `lib/image/`

### `docs/04_user_flow.md`
- Results page ASCII diagram: update "Hi-Contra-st SVG" tab label
- HIGH-CONTRAST SVG panel box: update to describe image enhancement (sharp pipeline) not SVG rendering from DiagramAnalysis
- Data flow section: update `HighContrastSVG` block — it receives `imageBase64` from client state (not elements[]/relationships[]) and calls `POST /api/high-contrast`

### `docs/05_current_phase.md`
- Rewrite checklist and definition of done to match this design

---

## Definition of done

- [ ] `/api/high-contrast` returns enhanced PNG base64 for JPEG, PNG, WebP inputs
- [ ] Color is preserved in all outputs; semantic colors remain distinguishable
- [ ] Labels/text appear darker and more readable vs original
- [ ] Lines/edges appear crisper and visually stronger vs original
- [ ] Low-contrast pastels and midtones are strengthened
- [ ] Original layout is preserved (no re-generation)
- [ ] Download PNG triggers sonner toast, produces valid PNG file
- [ ] Download SVG triggers sonner toast, produces valid SVG file with embedded image
- [ ] Preview renders inline with zoom controls (50–200%)
- [ ] Works on circuit, chart, free-body, anatomical, and other diagram types
- [ ] Zero TypeScript errors
