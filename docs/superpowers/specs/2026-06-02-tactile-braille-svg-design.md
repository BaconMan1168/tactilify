# Phase 4 — Tactile / Braille SVG Design Spec

**Date:** 2026-06-02
**Phase:** 4 of 6
**Status:** Approved, ready for implementation

---

## Overview

Generate a braille-print-ready SVG from a `DiagramAnalysis` object. The SVG uses stroke-only paths (no fills), Unicode Grade 1 Braille labels, and per-diagram-type element symbols. Output is A4-sized (794×1123px) and optimised with `svgo` for direct swell-paper or tactile embossing printing.

The result is shown inline in the existing "Tactile / braille" results tab with zoom controls, and can be downloaded as a `.svg` file.

---

## Architecture

Three new files, wired into the existing results tab:

| File | Purpose |
|---|---|
| `src/lib/braille.ts` | ASCII → Unicode Grade 1 Braille encoder (hand-rolled lookup table) |
| `src/lib/svg/tactileRenderer.ts` | Generates the A4 SVG string from `DiagramAnalysis` using `xmlbuilder2` + `svgo` |
| `src/components/output/TactileSVG.tsx` | React component: inline preview with zoom, download button, print note |

No new API route needed — the SVG is generated client-side from `DiagramAnalysis` which is already in React state.

---

## `src/lib/braille.ts`

A pure function `encodeBraille(text: string): string` that maps each ASCII character to its Unicode Grade 1 Braille equivalent (U+2800–U+28FF).

- Hand-rolled lookup table — no npm package.
- Covers: letters a–z (upper and lower mapped to same Braille cell), digits 0–9 (prefixed with number indicator ⠼), space, and common punctuation (period, comma, colon, hyphen, question mark, exclamation).
- Unknown characters pass through unchanged.
- Exported as a named export: `export function encodeBraille(text: string): string`
- Vitest unit tests in `src/lib/braille.test.ts` covering the full ASCII printable range (32–126).

---

## `src/lib/svg/tactileRenderer.ts`

Exported function signature:
```ts
export function renderTactile(analysis: DiagramAnalysis): string
```

Returns a complete SVG string. Steps:

1. Create an `xmlbuilder2` document with `viewBox="0 0 794 1123"` (A4 at 96dpi), `xmlns="http://www.w3.org/2000/svg"`.
2. Set a white background rect (`fill="#ffffff"`).
3. Add a title and diagram summary as braille text near the top.
4. Dispatch to a per-type renderer based on `analysis.type`:
   - `circuit` → `renderCircuit()`
   - `graph` → `renderGraph()`
   - `free-body` → `renderFreeBody()`
   - `unknown` → `renderGeneric()` (labeled nodes, no geometry)
5. Run the resulting XML string through `svgo` with `removeDoctype`, `removeComments`, `cleanupIds`, `minifyStyles` plugins. No plugins that alter stroke/fill (we control those explicitly).
6. Return the optimised SVG string.

### Circuit renderer
Uses `element.position` (normalised 0–1) scaled to a 700×900px drawing area centered in the A4 canvas (margin: 47px top/bottom, 47px left/right). If `element.position` is absent, elements are arranged in a sequential grid (4 columns) within the same drawing area.

Per element type:
- **battery**: stacked long/short horizontal lines (classic IEC symbol), always rendered horizontally
- **resistor**: zigzag polyline (6 peaks) inside a bounding box
- **capacitor**: two parallel vertical lines
- **inductor**: series of arcs (bumps)
- **bulb / lamp**: circle with crosshair (×)
- **switch**: line with angled gap and open terminal dot
- **wire**: straight line segment connecting elements (from `relationships`)
- **unknown element**: labeled rectangle

All elements: `stroke="#000000"`, `stroke-width="2"`, `fill="none"`. Labels rendered via `encodeBraille()` at 10px `font-size`, placed offset from element center to avoid overlap.

### Graph renderer
- **bar chart**: outlined unfilled rectangles proportional to value, baseline axis, vertical axis with tick marks. Bar widths evenly distributed across drawing area. Braille labels on x-axis (category) and value annotations above each bar.
- **line chart**: connected `<polyline>` over axis grid lines.
- **pie chart**: `<path>` arc sectors, no fill, each sector labeled with braille at its centroid.
- Axes rendered as plain lines with 5px tick marks.

### Free-body renderer
- Objects: rounded rectangle (`rx="6"`) with braille label.
- Force vectors: `<line>` + `<polygon>` arrowhead pointing in the direction from `relationship.label` (e.g., "up", "right", "45deg"). Arrow length proportional to force magnitude if `element.value` is numeric.
- Labels: braille-encoded force name + value on each arrow.

### Generic renderer (unknown type)
All elements rendered as rounded rectangles arranged in a grid, with braille label inside each. Relationships drawn as straight lines between centers.

---

## `src/components/output/TactileSVG.tsx`

**Props:** `{ analysis: DiagramAnalysis }`

**Behaviour:**
1. On mount, calls `renderTactile(analysis)` synchronously (pure function, no async needed).
2. Renders the SVG inline via `dangerouslySetInnerHTML` inside a white-background scrollable viewport (height: 360px, `overflow: auto`).
3. Zoom controls sit in a header row above the viewport:
   - `−` and `+` buttons step through levels: 50%, 75%, 100%, 125%, 150%, 200%.
   - Current zoom % displayed between the buttons.
   - "Fit" button resets to 100%.
   - All controls have `aria-label`.
   - Zoom is implemented via CSS `transform: scale()` on the inner SVG wrapper with `transform-origin: top left`; the wrapper width is set to `794 * (zoom/100)` so horizontal scroll works.
4. Below the viewport: print note ("Optimised for swell-paper or tactile embossing printers. Print at 100% scale on A4.") inside a dark info box.
5. "Download Tactile SVG" button:
   - Creates a `Blob` from the SVG string, triggers `<a download>` click.
   - `sonner` toast: "Tactile SVG downloaded" on success.
   - Button has `aria-label="Download tactile SVG for printing"`.

**Wiring:** In `page.tsx`, replace the `tactile` placeholder `TabsContent` with:
```tsx
<TabsContent value="tactile">
  <TactileSVG analysis={analysis} />
</TabsContent>
```

---

## Error handling

- If `renderTactile` throws (malformed analysis), `TactileSVG` catches it and renders an `<ErrorMessage>` component with the message "Could not generate tactile SVG."
- If `DiagramAnalysis.elements` is empty, renders a minimal SVG with just the title and a braille message: "No elements detected."

---

## Testing

- `src/lib/braille.test.ts`: Vitest unit tests
  - Each letter a–z maps to correct braille cell
  - Digits 0–9 get number indicator prefix
  - Space maps to U+2800 (blank braille cell)
  - Round-trip: `encodeBraille("Hello 123")` matches expected string character by character
  - Unknown characters (e.g., emoji) pass through unchanged

---

## Definition of done (matches Phase 4 spec)

- [ ] Tactile SVG renders for all three diagram types
- [ ] All labels are Unicode Braille (verified character by character against braille chart)
- [ ] SVG has no fill colors — stroke only
- [ ] ViewBox is A4 proportioned (794×1123)
- [ ] Downloaded SVG opens correctly in Inkscape/Illustrator without errors
- [ ] `braille.ts` has Vitest unit tests covering full ASCII range
- [ ] Zoom controls work at all 6 levels; "Fit" resets to 100%
- [ ] Download triggers `sonner` toast
- [ ] Error state renders `<ErrorMessage>` if render throws
