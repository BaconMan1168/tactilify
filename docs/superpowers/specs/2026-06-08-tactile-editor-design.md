# Tactile SVG Editor — Design Spec
**Date:** 2026-06-08
**Status:** Approved

---

## Overview

A full-screen SVG editor that lets teachers and accessibility coordinators correct Claude's tactile diagram output before printing. Built on Fabric.js v6 with custom adapters for Braille, patterns, and A4 SVG serialization. Integrated as a new app state in the existing `page.tsx` state machine — no new route.

---

## Mandatory: Fabric.js Documentation

> **Every Fabric.js API call must be preceded by a Context7 MCP lookup for the current 2026 Fabric.js v6 documentation.** Fabric.js v6 has breaking changes from v5 (Promise-based loaders, overhauled group system, new dispose lifecycle). Never rely on training-data knowledge for Fabric.js API signatures — always fetch live docs via Context7 before writing canvas code.

---

## What teachers can edit

| Element type | Edit capability |
|---|---|
| `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` | Move, resize, rotate, delete |
| `<path>`, `<line>` (wires, arrows) | Move, scale, delete — no point editing |
| `<text>` on reference page (title, description, guide) | Inline double-click edit via `fabric.IText` |
| Braille labels (dot clusters) | Move as a unit; Unicode character shown in panel — dots regenerate on export |
| Texture fills (hatch patterns) | Swap between 4 presets via picker |
| New shapes from toolbar | Add rect, circle, arrow, text — tactile defaults applied automatically |

---

## Architecture

### App state

One new state added to the existing `AppState` union in `page.tsx`:

```
idle → preview → processing → results ⇄ editing
```

No new route. The editor is rendered full-screen when `appState === 'editing'`, using the same `AnimatePresence` pattern as existing states.

### Data contract

`TactileEditor` is a pure component — no internal API calls:

| Prop | Type | Purpose |
|---|---|---|
| `pages` | `string[]` | SVG page strings from Claude — reference page first, then diagram pages |
| `onDone` | `(result: { pages: string[], speechScript: string \| null }) => void` | Called when teacher saves |
| `onCancel` | `() => void` | Called on Back without saving — results unchanged |

### Revert strategy

On mount, `originalPages` is captured in a `useRef` — a frozen snapshot of the incoming `pages` prop. Never mutated. "Revert to original" destroys and reloads all Fabric canvases from `originalPages` and clears the history stack. Zero cost — no API call, no re-upload.

### Existing files touched

| File | Change |
|---|---|
| `src/app/page.tsx` | Add `'editing'` to AppState; add `tactilePages: string[]` state; wire Edit button; render `<TactileEditor>` in editing state; handle `onDone` |
| `src/components/output/TactileSVG.tsx` | Accept optional `pages` prop (renders post-edit pages without re-fetching); add "Edit tactile diagram" button that fires `onEditRequest(pages)` |
| `src/hooks/useNarration.ts` | Accept optional `speechScript` override; AudioPlayer uses it when reference page text was edited |
| `src/app/api/llm-tactile/route.ts` | Extract `extractSpeechScript` into `src/lib/speechScript.ts` so it can be shared with the editor |

---

## File structure

```
src/
  components/
    editor/
      TactileEditor.tsx       ← root shell, owns page index + pending speech script
      EditorCanvas.tsx        ← one Fabric.js canvas instance per page
      EditorToolbar.tsx       ← tool buttons + keyboard shortcuts
      PageNav.tsx             ← page tabs at bottom (Reference | Diagram 1 | ...)
      PropertiesPanel.tsx     ← context-sensitive right sidebar
      TexturePicker.tsx       ← 4-swatch hatch pattern picker
    output/
      TactileSVG.tsx          ← existing, modified
  lib/
    svgLoader.ts              ← SVG string → configured Fabric canvas
    svgExporter.ts            ← Fabric canvas → clean A4 SVG string
    brailleAdapter.ts         ← dot-circle collapse on load; Unicode → dots on export
    patternAdapter.ts         ← SVG pattern defs → fabric.Pattern; export back
    speechScript.ts           ← extractSpeechScript (extracted from route, shared)
    braille.ts                ← existing, unchanged
  hooks/
    useEditorHistory.ts       ← 20-step undo/redo stack per canvas
```

---

## Components

### `TactileEditor.tsx`
Root shell. Full-screen overlay via `AnimatePresence`. Owns:
- `currentPage: number` — active page index
- `pendingSpeechScript: string | null` ref — updated if reference page text changes
- `activeTool` state passed to `EditorCanvas`
- Topbar: Back (fires `onCancel`), Revert (reloads from `originalPages`), Done (exports + fires `onDone`)
- Layout: topbar → toolbar → body (canvas + properties panel) → page nav

### `EditorCanvas.tsx`
Wraps a single `fabric.Canvas` instance. Receives `svgString`, `activeTool`. On mount runs the full `svgLoader` pipeline. On tool change swaps Fabric drawing mode. Exposes `exportSVG()` and `revert(svgString)` via `useImperativeHandle`. Fires `onSelectionChange(obj | null)` to feed `PropertiesPanel`.

> Use Context7 MCP for `fabric.Canvas` constructor, `loadSVGFromString`, `useImperativeHandle` pattern with Fabric, and `canvas.dispose()` cleanup before writing this file.

### `EditorToolbar.tsx`
Stateless. Buttons: Select / Rect / Circle / Arrow / Text / Undo / Redo / Delete.
Keyboard shortcuts: V (select), R (rect), C (circle), A (arrow), T (text), Cmd+Z (undo), Cmd+Shift+Z (redo), Delete/Backspace (delete).
Uses shadcn `Button` and `Tooltip` for every tool button. Uses shadcn `Separator` between groups.

### `PageNav.tsx`
Tabs at the bottom of the canvas area. One tab per page: "Reference", "Diagram 1", "Diagram 2", etc. Uses shadcn `Tabs` primitive. Shows a small dot indicator on tabs with unsaved changes. Clicking a tab switches `currentPage` in `TactileEditor`.

### `PropertiesPanel.tsx`
Right sidebar, 200px wide. Context-sensitive based on `EditorCanvas` selection:
- **No selection:** "Select an element to edit its properties"
- **Shape selected:** X, Y, W, H inputs; Rotate; Stroke width; `TexturePicker` if shape has a pattern fill; Delete button
- **IText (reference page text) selected:** font size; the text content; if Braille element: Unicode character input with note "dots regenerate on export"
- **Arrow / line selected:** position + stroke width + delete

Uses shadcn `Button` for Delete. All inputs styled to match existing app form elements.

### `TexturePicker.tsx`
Four SVG swatches rendered inline: None (open) / Diagonal / Horizontal / Vertical / Crosshatch. Active swatch gets `border-color: #5e6ad2`. On click: calls `patternAdapter.applyPattern(fabricObject, type)` and triggers canvas re-render.

---

## Custom lib modules

### `svgLoader.ts`
```
SVG string
  → scale mm coordinates → Fabric pixels  (210×297mm → 595×842px)
  → brailleAdapter.load()                  (dot clusters → Unicode IText)
  → patternAdapter.load()                  (url(#id) → fabric.Pattern)
  → Text → IText conversion (all <text>)
  → fabric.Canvas
```
> Use Context7 MCP for `loadSVGFromString` Promise API in Fabric.js v6.

### `svgExporter.ts`
```
fabric.Canvas
  → canvas.toSVG()
  → strip Fabric-specific attributes
  → restore viewBox="0 0 210 297" + mm coordinates (inverse scale)
  → brailleAdapter.export()               (Unicode IText → dot circles)
  → patternAdapter.export()               (fabric.Pattern → <defs> blocks)
  → clean A4 SVG string
```
> Use Context7 MCP for `canvas.toSVG()` options and output format in Fabric.js v6.

### `brailleAdapter.ts`
- `load(svgString)` — finds clusters of `<circle r="0.7" fill="#000000">` within 15mm proximity; collapses each cluster into a single `fabric.IText` with the Unicode Braille character at the cluster centroid. Marks element with `data-braille="true"` custom property.
- `export(svgString)` — finds Braille IText elements; calls `encodeBraille()` from `braille.ts` + `textToBrailleCircles()` to regenerate dot geometry.

Reuses: `src/lib/braille.ts` (existing, unchanged).

### `patternAdapter.ts`
- `load(svgString, canvas)` — parses `<defs>`, classifies each `<pattern>` as `diagonal | horizontal | vertical | crosshatch`, creates `fabric.Pattern` via canvas API, applies to shapes with matching `fill="url(#id)"`.
- `applyPattern(obj, type)` — swaps the canvas pattern on a selected Fabric object.
- `export(svgString, patternMap)` — writes correct `<pattern>` blocks into `<defs>` of the output SVG.

> Use Context7 MCP for `fabric.Pattern` constructor and application in Fabric.js v6.

### `useEditorHistory.ts`
Listens to `object:modified`, `object:added`, `object:removed` events on the Fabric canvas. Snapshots `canvas.toJSON(['data-braille', 'data-pattern-type'])` on each event — custom property names must be passed explicitly so Fabric includes them in the snapshot. Capped at 20 entries. Exposes: `undo()`, `redo()`, `canUndo: boolean`, `canRedo: boolean`, `reset()`, `isDirty: boolean` (true if current snapshot differs from the initial one — used by `PageNav` to show the unsaved-changes dot indicator).

### `speechScript.ts`
Extracted from `src/app/api/llm-tactile/route.ts`. The `extractSpeechScript(referenceSvg: string): string` function is moved here and imported by both the route and `TactileEditor`. No logic change.

### `spacingGuard.ts` *(nice-to-have)*
On `object:modified`: computes bounding box distances between all canvas objects. Any pair closer than 3mm (in scaled coordinates) gets a temporary `fabric.Rect` warning highlight. Uses Motion `animate()` for a 2s fade-out — consistent with the app's animation layer.

### `labelManager.ts` *(nice-to-have)*
On new shape added from toolbar: scans existing Braille letter markers (A–Z) for the next unused letter, creates an adjacent Braille IText element, queues a stub KEY row update on the reference page canvas.

---

## Shape defaults for teacher-drawn elements

Applied via `canvas.on('object:added')` for any shape created by the teacher (not loaded from SVG):

```ts
{
  stroke: '#000000',
  strokeWidth: 2.5,   // BANA tactile primary stroke
  fill: 'none',
  strokeUniform: true,
}
```

---

## Design system integration

| Concern | What to use |
|---|---|
| Buttons (Back, Revert, Done, Delete) | shadcn `Button` — use MCP to scaffold if not present |
| Page tabs | shadcn `Tabs` |
| Toolbar tooltips | shadcn `Tooltip` |
| Toolbar separators | shadcn `Separator` |
| Full-screen enter/exit | Motion `AnimatePresence` — same pattern as existing states in `page.tsx` |
| Page switch animation | Motion `AnimatePresence` fade |
| Spacing guard fade | Motion `animate()` |
| Background color | `#010102` (canvas area), `#0f1011` (panels) |
| Primary / selection | `#5e6ad2` — applied to Fabric selection handles via `fabric.Object.prototype` defaults |
| Borders | `#23252a` |
| Primary text | `#f7f8f8` |
| Secondary text | `#8a8f98`, `#62666d` |
| All colors | Source from `docs/06_design.md` — do not hardcode values not in the design system |

> Always use shadcn MCP to add any shadcn component not already in the project rather than building from scratch.

---

## Accessibility

The editor itself must be accessible (it is an accessibility tool):
- Every toolbar button has `aria-label` and `aria-pressed` where relevant
- Keyboard shortcuts listed in `Tooltip` content
- `PageNav` tabs are keyboard-navigable (shadcn Tabs handles this)
- `PropertiesPanel` inputs have associated `<label>` elements
- Canvas area has `role="application"` and `aria-label="Tactile diagram editor"`

---

## Out of scope

- Editing individual Braille dot positions
- Changing the A4 page size or margins
- Path point editing (bezier handles)
- Collaboration / multi-user editing
- Persisting edits across sessions (in-session only)
