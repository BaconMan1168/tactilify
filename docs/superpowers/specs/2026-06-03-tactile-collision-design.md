# Tactile SVG Collision & Layout Spec
Date: 2026-06-03

## Problem

The tactile SVG renderer places braille marker labels using full element labels (`obj.label`) instead of short numeric markers (`obj.marker`). This causes braille text to overflow across wires, component shapes, the title zone, and the key zone. Key entries with long labels can also wrap and silently overflow the page bottom.

## Goals

1. Marker labels near components show only the short numeric key reference (e.g. braille "1", "2") — full text stays in the key.
2. No braille overlaps any other object on the page: components, wires, other marker labels, title zone, key zone, or page margins.
3. Key entries never overflow the page bottom.
4. English label inside each component shape shows the marker number prefix (`#N`) for sighted reference.

## Non-goals

- Lead lines / complex label repositioning (if a label can't fit, it is omitted — the key is always complete).
- Dynamic page reflow (title stays 2-line max, page stays A4 portrait).
- Collision detection for wire-vs-wire or component-vs-component.

---

## Architecture

The collision model lives entirely at planning time. The renderer draws what the plan says — no layout decisions in the renderer.

```
buildTactilePlan()
  1. Compute title braille footprint
  2. Compute key total height (sum of per-entry heightMm)
  3. Derive DRAW_Y and KEY_SEP_Y from actual heights
  4. Build occupied[] with permanent zones:
       - title zone  (top of page → DRAW_Y)
       - key zone    (KEY_SEP_Y → page bottom)
       - left margin strip  (x 0 → MARGIN)
       - right margin strip (x PAGE_W-MARGIN → PAGE_W)
  5. For each component: compute componentBboxMm, add to occupied, set obj.bboxMm
  6. For each marker label: try candidate positions (priority ordered by side)
       → first non-colliding position wins, add its bbox to occupied, set obj.bboxMm
       → if all candidates collide: omit marker object entirely (label stays in key)

renderTactile()
  - drawMarker()       → obj.marker ?? obj.label ?? ''  (short number first)
  - drawLabeledShape() → "#N label…" inside shape
  - drawKey()          → uses entry.heightMm, hard-stops before page bottom
```

---

## New file: `src/lib/brailleMetrics.ts`

```typescript
export const CELL_W = 6.0   // mm per braille cell
export const LINE_H = 10.0  // mm per braille line

/**
 * Returns the bounding box of braille-encoded `normalizedText`
 * wrapped to fit within maxWidthMm.
 * Uses same word-wrap logic as renderBrailleText in the renderer.
 */
export function brailleFootprintMm(
  normalizedText: string,
  maxWidthMm: number,
): { widthMm: number; heightMm: number }
```

Imports `encodeBraille` from `@/lib/braille`. The renderer's `B.cellW` / `B.lineH` constants are replaced with imports from this module (no behaviour change, just single source of truth).

---

## Type changes: `src/types/tactile.ts`

```typescript
// New
export type Bbox = { x: number; y: number; w: number; h: number }

// Added to TactileObject
bboxMm?: Bbox   // placed footprint on page (set by planner, optional for non-blocking objects)

// Added to TactileKeyEntry
heightMm: number  // actual rendered height in mm (may span multiple braille lines)
```

---

## Planner changes: `src/lib/svg/tactilePlanner.ts`

### New private helpers

```
bboxOverlaps(a: Bbox, b: Bbox, pad?: number): boolean
  - Expands both boxes by pad (default 2mm) before testing intersection.

componentBboxMm(obj: TactileObject): Bbox
  - rect:    28 × 14 mm centred on (xMm, yMm)
  - circle:  20 × 20 mm centred
  - diamond: 28 × 18 mm centred
  - ellipse: 28 × 16 mm centred
  - wire:    bounding box of points[] + 1mm padding each side

placeMarkerLabel(
  side: 'top' | 'right' | 'bottom' | 'left',
  compBbox: Bbox,
  footprint: { widthMm: number; heightMm: number },
  occupied: Bbox[],
  clearance?: number,   // default 10mm
): { xMm: number; yMm: number; bboxMm: Bbox } | null
```

`placeMarkerLabel` candidate order by side:

| Side | Candidate order |
|------|----------------|
| top | above, right, left, below |
| right | right, above, below, left |
| bottom | below, right, left, above |
| left | left, above, below, right |

Each candidate computes a bbox for the footprint at that position and calls `bboxOverlaps` against every entry in `occupied`. First non-colliding candidate wins. If none: return `null`.

### Dynamic layout constants

Replace the hardcoded `DRAW_Y`, `KEY_SEP_Y`, `KEY_START_Y` with values derived at plan time:

```
actualTitleH = brailleFootprintMm(normTitle, PAGE_W - 2*MARGIN).heightMm
DRAW_Y       = MARGIN + actualTitleH + 4      // 4mm gap below title
KEY_ENTRY_TOTAL = sum of entry.heightMm for all key entries
KEY_SEP_Y    = PAGE_H - MARGIN - KEY_ENTRY_TOTAL - KEY_HEADER_H - 5
DRAW_H       = KEY_SEP_Y - 5 - DRAW_Y
```

`KEY_HEADER_H` = 10mm (the "key" braille word + separator line).

If `DRAW_H < 80`, warn and clamp — the diagram won't have enough room but it's better than crashing.

### Per-layout marker placement

All four layout functions (`planCyclic`, `planAxial`, `planPositional`, `planDirectional`) are updated to:
1. Use the shared `placeMarkerLabel` helper instead of hardcoded offset arithmetic.
2. Set `bboxMm` on every component object.
3. Only push a marker object if `placeMarkerLabel` returns non-null.

Each layout function receives an `initialOccupied: Bbox[]` parameter (the four permanent zones computed in `buildTactilePlan`) and builds its own local `occupied` list starting from that, appending component and marker bboxes as they are placed.

---

## Renderer changes: `src/lib/svg/tactileRenderer.ts`

### `drawMarker` fix

```typescript
// Before
const text = obj.label ?? obj.marker ?? ''

// After
const text = obj.marker ?? obj.label ?? ''
```

### `drawLabeledShape` marker prefix

```typescript
const prefix = obj.marker ? `#${obj.marker} ` : ''
const combined = prefix + (obj.label ?? '')
const display = combined.length > 11 ? combined.slice(0, 10) + '…' : combined
```

### `drawKey` hard-stop

```typescript
// Before (can overflow)
y += Math.max(wrapH, KEY_LINE_H)
if (y + KEY_LINE_H > page.heightMm - MARGIN) break

// After (uses pre-computed heightMm)
if (y + entry.heightMm > page.heightMm - MARGIN) {
  drawBrailleString(svg, encodeBraille('see attached key'), kx, y)
  break
}
// ... render entry ...
y += entry.heightMm
```

### Constants

Import `CELL_W` and `LINE_H` from `@/lib/brailleMetrics` and remove the local `B` object.

---

## Testing

- Existing Vitest suite for `braille.ts` continues to pass.
- New unit tests for `brailleMetrics.ts`: footprint of single cell, multi-word wrap, empty string.
- New unit tests for `bboxOverlaps`: touching boxes, overlapping, separated, pad behaviour.
- Manual visual check: upload the test circuit diagram; all braille marker numbers appear outside the loop with no overlaps visible.

---

## Files changed

| File | Change |
|------|--------|
| `src/lib/brailleMetrics.ts` | **new** — footprint calculation |
| `src/types/tactile.ts` | add `Bbox`, `bboxMm`, `heightMm` |
| `src/lib/svg/tactilePlanner.ts` | dynamic layout, collision helpers, per-layout updates |
| `src/lib/svg/tactileRenderer.ts` | drawMarker fix, marker prefix, drawKey hard-stop, import constants |

---

## Documentation updates

These existing docs must be updated as part of implementation (not deferred):

### `docs/02_repo_structure.md`

1. Add `brailleMetrics.ts` under `src/lib/`:
   ```
   ├── brailleMetrics.ts    # Braille cell/line footprint calculation (mm)
   ```
2. Add `tactile.ts` under `src/types/` (currently missing from the tree):
   ```
   ├── tactile.ts           # TactilePlan, TactileObject, Bbox, and related types
   ```
3. Add `tactilePlanner.ts` under `src/lib/svg/` (currently missing from the tree):
   ```
   └── svg/
       ├── tactilePlanner.ts    # DiagramAnalysis → collision-resolved TactilePlan
       └── tactileRenderer.ts   # TactilePlan → A4 SVG string
   ```
4. Update the `lib/svg/` convention description to explain the two-stage pipeline:
   > `tactilePlanner.ts` converts a `DiagramAnalysis` into a `TactilePlan` — a collision-resolved intermediate representation with all positions and bounding boxes in mm. `tactileRenderer.ts` consumes the plan and emits the final SVG string. No layout decisions happen in the renderer.

### `docs/01_build_phases.md` — Phase 4 section

Update the Steps bullet:
- **Before:** "Braille label encoded via `braille.ts` placed outside the shape, below or to the right"
- **After:** "Short numeric marker (e.g. braille '1', '2') placed outside the component in the first collision-free candidate position; full label in the keyed legend at the bottom of the page (BANA keyed-label approach)"

### `docs/00_build_spec.md` — Core AI pipeline

Update the tactile step in the data flow:
- **Before:** "→ Renderer: produce tactile/braille SVG from JSON"
- **After:** "→ Planner: convert `DiagramAnalysis` to collision-resolved `TactilePlan` (positions, bboxes, key entries) → Renderer: produce A4 SVG from `TactilePlan`"
