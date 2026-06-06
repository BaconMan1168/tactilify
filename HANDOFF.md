# LLM Tactile Generation — Handoff

> TEMPORARY FILE — delete once implementation is verified working.

## What this branch is

`feat+llm-tactile-generation` worktree. This branch adds a second tactile SVG pipeline that uses Claude Vision to generate the diagram directly, as an alternative to the original deterministic pipeline (`/api/tactile`). The new route is `/api/llm-tactile` and its UI component is `TactileSVG.tsx`.

---

## Current state of the files

### `src/app/api/llm-tactile/route.ts`
- Calls `claude-sonnet-4-6` with the image + a long prompt
- Currently returns `{ svgPages: string[] }` (split on `<<<PAGE_BREAK>>>`)
- max_tokens: 16000
- No thinking, no output_config

### `src/components/output/TactileSVG.tsx`
- Fetches `/api/llm-tactile`, expects `{ svgPages: string[] }`
- Shows Prev/Next page navigation when multiple pages
- Zoom controls (50–200%)
- Downloads all pages as separate SVG files

---

## The agreed architecture (NOT YET IMPLEMENTED)

The current prompt asks the LLM to generate everything as SVG pages separated by `<<<PAGE_BREAK>>>`. This approach has a fatal flaw: when we eventually convert to braille, the LLM has no way to know braille cell dimensions (≈6mm wide × 10mm tall per cell), so text zones on the reference page will overflow.

### Solution: hybrid output format

The LLM outputs TWO types of blocks separated by delimiters:

```
<<<JSON>>>
{ ...structured text content... }
<<<END_JSON>>>
<<<SVG>>>
<svg>...diagram page 1...</svg>
<<<END_SVG>>>
<<<SVG>>>
<svg>...diagram page 2 if needed...</svg>
<<<END_SVG>>>
```

**JSON block** — reference page text content (our code generates the SVG for this):
```json
{
  "title": "Animal Cell",
  "shortDescription": "Cross-section of a typical animal cell showing the nucleus, cytoplasm, and mitochondria.",
  "explorationGuide": "Start at the center. A is the large central circle (nucleus). B are small ovals scattered around it (mitochondria). C is the outer boundary (cell membrane).",
  "keyEntries": [
    { "letter": "A", "label": "nucleus", "patternId": "lines-horiz" },
    { "letter": "B", "label": "mitochondria", "patternId": "lines-diag" },
    { "letter": "C", "label": "cell membrane", "patternId": null }
  ]
}
```

Key label format rule (mirrors `buildKeyLabel` from original pipeline):
- Format: `type, identifier (only if distinct from type), value (if present)`
- Never repeat same word twice
- Examples: "9V Battery" + value "9V" → `"battery, 9V"` | "Resistor R1" + value "100Ω" → `"resistor, r1, 100Ω"` | "Nucleus" no value → `"nucleus"`

**SVG block(s)** — diagram page(s) only. Each SVG:
- `viewBox="0 0 210 297"`, white background rect
- All structural elements within x: 15–195mm, y: [diagramTop]–282mm
- Title text at top + separator line below it (the only text in the diagram SVG)
- Texture patterns defined in `<defs>` using `<pattern patternUnits="userSpaceOnUse">`
- Letter labels as: `<text data-tactile-label="A" x="..." y="...">A</text>`
  - Reserved zone per label: 14mm wide × 12mm tall (fits 2 braille cells)
  - Always placed just outside the element boundary (2–4mm clearance)
  - For outermost boundary elements: outside the shape
  - No full-word labels anywhere in the diagram

---

## How the server processes the response

### Step 1 — Parse blocks
Split LLM response to extract the JSON block and all SVG blocks.

### Step 2 — Generate reference page SVG programmatically
Use the JSON content + the existing braille infrastructure:
- `normalizeStemText` (from `src/lib/braille.ts`)
- `brailleFootprintMm` (from `src/lib/brailleMetrics.ts`)
- `drawBrailleString` / `renderBrailleText` (from `src/lib/svg/tactileRenderer.ts`)

Layout zones (same pattern as original planner):
1. Title zone — braille, bold, centered
2. Separator line: `<line x1="15" y1="[titleBottom+2]" x2="195" y2="[titleBottom+2]" stroke="#000000" stroke-width="0.3"/>`
3. Short description zone — braille, left-aligned
4. Separator line
5. Exploration guide zone — braille, left-aligned
6. Separator line
7. Key header ("KEY") — braille
8. Key entries — one row per entry: braille letter + texture swatch rect + braille label
9. Separator line below key

If key overflows the page → emit continuation page(s) with title "[Title] (key continued)".

### Step 3 — Key texture swatches
- Extract `<defs>` from the first diagram SVG (contains all `<pattern>` definitions)
- Re-embed those pattern elements into the reference page SVG's `<defs>`
- For each key entry with a `patternId`: draw an 8×6mm `<rect fill="url(#patternId)"/>`
- For entries with `patternId: null`: draw an 8×6mm outlined rect with no fill

### Step 4 — Replace letter labels in diagram SVGs with braille
For each diagram SVG:
- Parse the SVG string
- Find all `<text data-tactile-label="X">` elements
- For each: read `x`, `y`, and the letter
- Run `encodeBraille(letter)` → `drawBrailleString` at those coordinates
- Remove the original `<text>` element

Single uppercase letters = 2 braille cells ≈ 12mm wide × 10mm tall — fits within the 14×12mm reserved zone.

### Step 5 — Return
```json
{ "svgPages": ["<svg>ref page</svg>", "<svg>diagram page 1</svg>", ...] }
```
Page order: reference page first, then diagram page(s), then any key continuation pages.

---

## Files to change

| File | What changes |
|------|-------------|
| `src/app/api/llm-tactile/route.ts` | New prompt (JSON+SVG blocks), new parser, braille post-processor, new response shape |
| `src/components/output/TactileSVG.tsx` | Already updated to handle `{ svgPages: string[] }` — no further changes needed |

### Files to reuse from original pipeline (import, don't copy)
- `src/lib/braille.ts` — `normalizeStemText`, `encodeBraille`
- `src/lib/brailleMetrics.ts` — `brailleFootprintMm`, `CELL_W`, `LINE_H`
- `src/lib/svg/tactileRenderer.ts` — `drawBrailleString`, `renderBrailleText` (these are internal; may need to export or extract)

---

## Tactile design rules for the prompt (summary)

- Outermost container region: blank (no texture)
- Max 3 textures total; one per structure type; no stacking
- All textures as `<pattern>` in `<defs>`, never hand-drawn
- Independent elements must not overlap; connected elements may touch but not pass through
- 15mm margin on all four sides for diagram content
- Separator lines: `<line x1="15" y1="Y" x2="195" y2="Y" stroke="#000000" stroke-width="0.3"/>`
- Primary stroke: ~2.5mm; secondary/connective: ~1.5mm

---

## What is NOT done yet
- [ ] Rewrite prompt to output JSON block + SVG block(s)
- [ ] Server-side parser for the new format
- [ ] Programmatic reference page SVG generator (braille zones)
- [ ] Key texture swatch extraction + embedding
- [ ] `data-tactile-label` → braille dot replacement post-processor
