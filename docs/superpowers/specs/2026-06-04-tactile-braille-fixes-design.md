# Tactile Braille Generator — Bug Fix Design
**Date:** 2026-06-04  
**Phase:** 4.5 (active)

---

## Problem summary

Six distinct bugs interact to produce broken output for circuit diagrams (and, by extension, any cyclic domain):

1. **Key label duplication** — `elementLabel()` concatenates `el.label + el.value`, but Claude often encodes the value inside the label text, producing entries like `"#1 #9 volts battery #9 volts"`.
2. **Missing key entry #5 (lamp)** — duplicated text inflates each entry's Braille height so the 5th entry overflows the key zone and is silently replaced with `"see attached key"`.
3. **Key appears after the drawing** — BANA tactile convention requires the legend before the diagram so the reader knows the symbols before touching the drawing.
4. **Transcriber rearrangement note** — `planCyclic` always appends an unsolicited "Diagram rearranged into a rectangle…" note.
5. **Component order depends on relationship-array order** — `orderLoopComponents` uses BFS from the battery; the traversal order is unstable across runs because it follows the order Claude wrote the `relationships` array.
6. **Domain symbols always render horizontally** — `drawBatterySymbol`, `drawResistorSymbol`, etc. are hard-coded left-to-right; components on segments that run vertically must rotate 90°.

All fixes are domain-agnostic — they operate on `el.type`, `el.value`, `el.position`, and `el.symbolHint`, which exist for every diagram type, not just circuits.

---

## Architecture

### 1. Page zone layout reorder

**Old order:**
```
title → drawing area → instructions → key
```

**New order (BANA — read top to bottom):**
```
title → instructions → key → drawing area
```

The drawing area takes whatever space remains at the bottom of the page after the other zones are laid out downward. If the drawing area would fall below `MIN_DRAW_H = 80mm`, emit `SYMBOL_TOO_DENSE` and clamp.

**Key zone height cap** — For diagrams with many elements (bar charts with 15 bars, complex flowcharts, etc.) the raw sum of key entry heights can consume most of the page. Cap the key zone at `KEY_ZONE_MAX_H = 60mm`. Any entries that do not fit within the cap are already handled by `drawKey`'s `"see attached key"` fallback.

Zone computation in `buildTactilePlan`:

```
titleZone.yMm       = MARGIN
titleZone.heightMm  = max(titleTextH, LINE_H) + 4

instrZone.yMm       = titleZone.yMm + titleZone.heightMm + GAP
instrZone.heightMm  = maxInstrLines × LINE_H

rawKeyH             = sum of all keyEntryHeights
keyZone.yMm         = instrZone.yMm + instrZone.heightMm + GAP
keyZone.heightMm    = min(rawKeyH, KEY_ZONE_MAX_H)

drawY               = keyZone.yMm + keyZone.heightMm + GAP
drawH               = max(PAGE_H − MARGIN − drawY, MIN_DRAW_H)
drawingArea         = { yMm: drawY, heightMm: drawH }
```

Constants: `GAP = 4mm`, `MIN_DRAW_H = 80mm`, `KEY_ZONE_MAX_H = 60mm`.

---

### 2. Key label format

**New function** `buildKeyLabel(el: AdaptedDiagramElement): string`

Used only inside `buildKeyEntry` in place of `elementLabel()`. The existing `elementLabel()` is retained unchanged for SVG shape labels drawn inside generic rects and circles.

**Rules (applied in order):**

1. **Canonical type** — `el.type.toLowerCase().trim()`. Replace `_` and consecutive whitespace with a single space. If `el.type` is empty, fall back to `el.label.trim()` and skip steps 2–3.

2. **Identifier** — Tokenise `el.label` on whitespace. Keep tokens that satisfy ALL of:
   - Not a case-insensitive substring of the canonical type string.
   - Not purely numeric (does not match `/^\d+(\.\d+)?$/`).
   - Not a unit word: `volt`, `ohm`, `farad`, `amp`, `watt`, `henry`, `uf`, `pf`, `nf`, `kilo`, `micro`, `milli`, `nano`, `μ`, `ω`, `hz`, `db`, `pa`, `n` (newton).
   Join surviving tokens with a space. If the result is empty, omit.

3. **Value** — `el.value?.trim()`. If null, undefined, or empty string, omit.

**Format:** `type[, identifier][, value]`

**Examples — circuits:**

| `el.type` | `el.label` | `el.value` | Output |
|-----------|-----------|-----------|--------|
| `battery` | `9V Battery` | `9 volts` | `battery, 9 volts` |
| `resistor` | `100 Ohm Resistor` | `100 ohms` | `resistor, 100 ohms` |
| `resistor` | `R1` | `100 ohms` | `resistor, R1, 100 ohms` |
| `switch` | `Switch SW1` | `normally open` | `switch, SW1, normally open` |
| `capacitor` | `47 μF Capacitor` | `47 microfarads` | `capacitor, 47 microfarads` |
| `lamp` | `Lamp` | *(none)* | `lamp` |

**Examples — other STEM types:**

| `el.type` | `el.label` | `el.value` | Output |
|-----------|-----------|-----------|--------|
| `force` | `Gravity` | `9.8 N downward` | `force, Gravity, 9.8 N downward` |
| `data-point` | `Q1 2024` | `42%` | `data-point, Q1 2024, 42%` |
| `process` | `Evaporation` | *(none)* | `process, Evaporation` |
| `atom` | `Carbon` | *(none)* | `atom, Carbon` |
| `mitochondrion` | `Mitochondrion` | *(none)* | `mitochondrion` |
| `angle` | `Angle A` | `45°` | `angle, A, 45°` |

Note: `"angle"` is in the type string, so `"Angle"` is filtered from the label; `"A"` survives as the identifier.

`buildKeyLabel` lives in `tactilePlanner.ts`, collocated with `buildKeyEntry`.

---

### 3. Component ordering — spatial clockwise sort

**New function** `spatialClockwiseOrder(elements: AdaptedDiagramElement[]): AdaptedDiagramElement[]`

Replaces `orderLoopComponents`. Used **only in `planCyclic`**.

**Algorithm:**

1. Partition elements into `positioned` (those with `el.position`) and `unpositioned` (those without).
2. If `positioned.length < 2`, return the original array unchanged (too little data for a meaningful spatial sort; original array order is the safest fallback).
3. Compute centroid: `cx = mean(pos.x)`, `cy = mean(pos.y)` over all positioned elements.
4. For each positioned element compute `rawAngle = atan2(pos.y − cy, pos.x − cx)`.
5. Normalise to clockwise-from-top: `angle = (rawAngle + π/2 + 2π) mod 2π`. This maps the top of the diagram (SVG y decreases upward) to angle 0 and proceeds clockwise.
6. Sort `positioned` ascending by `angle`. Use stable sort; ties preserve original array order.
7. Interleave `unpositioned` elements back at their original indices (i.e., an unpositioned element at original index `k` is inserted at position `k` in the final sorted array, shifting others right). If this is ambiguous, append all unpositioned elements after all positioned ones.

**Why this is domain-agnostic:**
- Works for any closed loop: series circuit, Krebs cycle, water cycle, circular flowchart.
- Uses only `el.position.x/y` (present for all diagram types when Claude provides spatial information).
- No dependency on `el.type`, relationship array order, or any domain-specific key (battery, source, etc.).

**Known limitation — parallel (multi-loop) circuits:**  
`planCyclic` currently places ALL 2–12 components on a single rectangle, regardless of whether the circuit is series or parallel. This is pre-existing behaviour outside this spec's scope. `spatialClockwiseOrder` degrades gracefully in this case — it derives a geometrically consistent order from Claude's original positions, which is at least stable and repeatable, even if the rectangle layout does not faithfully represent the schematic topology.

---

### 4. Remove transcriber rearrangement note

Delete from `planCyclic`:
```ts
transcriberNotes.push(
  'Diagram rearranged into a rectangle to make the cyclic connection easier to trace by touch. Follow the numbered components in order around the loop.'
)
```

`drawTranscriberNotes` returns early on an empty array. No other change.

---

### 5. Symbol rotation — wire-angle-based

The previous approach ("`left`/`right` side → 90°") was tied to a single-rectangle abstraction and would assign wrong angles in any topology where the rectangle's sides do not align with actual wire directions.

**Correct rule:** derive rotation from the positions of the component's two immediate neighbours in the ordered loop.

**Type change** — add `rotationDeg?: number` to `TactileObject` in `src/types/tactile.ts`.

**Planner (`planCyclic`)** — after `spatialClockwiseOrder` produces `ordered` and `loopPoints`:

```ts
const n = ordered.length
ordered.forEach((el, idx) => {
  const prev = loopPoints[(idx - 1 + n) % n]
  const next = loopPoints[(idx + 1) % n]
  const dx = next.xMm - prev.xMm
  const dy = next.yMm - prev.yMm
  // If the wire between neighbours runs more vertically than horizontally,
  // the component interrupting that wire must also be oriented vertically.
  const rotationDeg = (Math.abs(dy) > Math.abs(dx)) ? 90 : 0
  // Guard: identical neighbour positions → leave horizontal
  compObj.rotationDeg = (dx === 0 && dy === 0) ? 0 : rotationDeg
})
```

**Why this generalises:**
- For a simple rectangle loop this gives the same result as the side-based rule.
- For a multi-loop circuit laid out on the same rectangle, each component independently reads its own neighbours' positions — no global topology assumption.
- For any other cyclic diagram shape (oval, irregular polygon), the angle naturally follows the local wire direction.
- For a diagram where all neighbours collapse to the same point (degenerate), the guard ensures `rotationDeg = 0` rather than undefined.

**Which symbols rotate:**  
Only symbols with a fixed internal horizontal orientation that represents the circuit convention:

| Symbol | Rotates |
|--------|---------|
| `battery-symbol` | ✓ |
| `resistor-symbol` | ✓ |
| `capacitor-symbol` | ✓ |
| `switch-symbol` | ✓ |
| `lamp-symbol` | ✓ |
| `inductor-symbol` | ✓ |
| `diode-symbol` | ✓ |
| `force-arrow-scaled` | ✗ — direction encoded in `points` |
| `bond-line` | ✗ — direction encoded in `points` / chemical convention |
| `atom-circle` | ✗ — radially symmetric |
| `angle-arc` | ✗ — orientation is the content |
| `right-angle-mark` | ✗ — orientation is the content |

Symbols with `points`-based geometry already encode direction in their coordinates. Applying a `rotationDeg` transform on top would double-rotate them.

**Renderer — `withRotation` helper:**

```ts
// Only call for the 7 listed symbols, not for points-based or symmetric symbols.
function withRotation(svg: El, obj: TactileObject, drawFn: (g: El) => void): void {
  if (!obj.rotationDeg) { drawFn(svg); return }
  const g = svg.ele('g', {
    transform: `rotate(${obj.rotationDeg}, ${f(obj.xMm)}, ${f(obj.yMm)})`
  })
  drawFn(g)
  g.up()
}
```

Used in `drawObject` only for the seven symbols above:
```ts
case 'battery-symbol':   withRotation(svg, obj, g => drawBatterySymbol(g, obj));  break
case 'resistor-symbol':  withRotation(svg, obj, g => drawResistorSymbol(g, obj)); break
// … and so on for the other five
```

**Bounding box under rotation (`componentBboxMm` in planner):**

When `obj.rotationDeg === 90`, the symbol's physical footprint has its width and height swapped, and the bounding box must be recentred:

```
original:  { x: cx − W/2, y: cy − H/2, w: W, h: H }
rotated:   { x: cx − H/2, y: cy − W/2, w: H, h: W }
```

Update `componentBboxMm` to apply this swap for the seven circuit symbols whenever `rotationDeg === 90`.

**Effect on other diagram types:**  
Non-cyclic layout functions (`planAxial`, `planPositional`, `planDirectional`, `planGrid`, `planFlowSequence`) never set `rotationDeg`. The field is optional; `withRotation` is a no-op when it is absent. FBD force arrows and chemistry bond lines use `points`-based geometry and are explicitly excluded from `withRotation`.

---

### 6. Label placement clearance

Change the default `clearance` parameter in `placeMarkerLabel` from `10` to `5` mm (≈ 3/16 inch, centre of the 1/8–1/4 inch BANA range).

This is a single constant in `tactilePlanner.ts`. Applies universally to all diagram types and all marker placements.

---

### 7. Title auto-augmentation

**New function** `augmentTitle(title: string, elements: AdaptedDiagramElement[]): string`

Ensures no meaningful component type is silently absent from the title — the specific failure case was a circuit where Claude omitted the lamp.

**Rules:**

1. Collect unique canonical types from `elements` using the same normalisation as `buildKeyLabel` step 1.
2. Filter to types whose canonical string does NOT appear as a case-insensitive substring in `title`.
3. **Only augment if** `elements.length ≤ 8` AND `missing.length ≤ 3`. For larger diagrams (charts with 20 bars, complex flowcharts), enumerating every component in the title is unhelpful and unreadable.
4. If the conditions are met: `return title + ', ' + missing.join(', ')`.
5. Otherwise: return `title` unchanged.

**Why the cap matters:** For a bar chart with 12 bars, appending 12 category names to the title would be absurd. For a 5-component circuit, appending one omitted component type is exactly the right fix.

Called in `buildTactilePlan` after computing `meaningful`:
```ts
const finalTitle = augmentTitle(pageSpec.title, meaningful)
// then use finalTitle everywhere title was used
```

---

## Files changed

| File | Change |
|------|--------|
| `src/types/tactile.ts` | Add `rotationDeg?: number` to `TactileObject` |
| `src/lib/svg/tactilePlanner.ts` | Zone layout reorder + key zone cap; `buildKeyLabel`; `spatialClockwiseOrder`; remove transcriber note; wire-angle `rotationDeg`; label clearance 10→5; `augmentTitle` |
| `src/lib/svg/tactileRenderer.ts` | `withRotation` helper; apply in `drawObject` for 7 circuit symbols only; rotation-aware `componentBboxMm` |

`src/types/diagram.ts`, `src/lib/svg/tactileAdaptor.ts`, and all route/component files are unchanged.

---

## What does NOT change

- `elementLabel()` — keeps `label + value` concatenation for SVG shape text labels (rects, circles, etc.).
- All non-cyclic layout functions (`planAxial`, `planPositional`, `planDirectional`, `planGrid`, `planFlowSequence`) — unaffected by every fix in this spec.
- The adaptor pipeline, domain classification, Claude calls, symbol resolution tiers.
- The renderer's lead-line routing, braille dot geometry, SVGO pass.
- All existing `TactileValidationIssue` codes and the `validate()` function.

---

## Edge cases and failure modes

| Scenario | Handling |
|----------|----------|
| All elements lack `el.position` | `spatialClockwiseOrder` returns original array — stable, repeatable fallback |
| Only 1 element has `el.position` | Same fallback (< 2 positioned → original order) |
| Two elements at identical angle from centroid | Stable sort preserves original relative order |
| `dx === 0 && dy === 0` (neighbour positions identical) | `rotationDeg = 0` by guard |
| `el.type` is empty string | `buildKeyLabel` falls back to `el.label.trim()` |
| `el.label` is identical to `el.type` | Identifier tokens all filter out → key entry shows type only (or type + value) |
| `el.value` is empty string | Treated as absent; omitted from key entry |
| `rotationDeg` absent or 0 | `withRotation` skips `<g>` wrapper entirely — no SVG overhead |
| Key zone raw height > 60mm | Key zone capped at 60mm; `drawKey` emits "see attached key" for overflow entries |
| Drawing area < 80mm after all zones | `SYMBOL_TOO_DENSE` warning emitted; `drawH` clamped to 80mm |
| Parallel / multi-loop circuit (≤ 12 elements) | Placed on rectangle as before (pre-existing). `spatialClockwiseOrder` gives geometrically stable order; `rotationDeg` derives from computed layout positions, which approximate but do not guarantee schematic wire directions — documented limitation, not a regression |
| Non-circuit domain uses cyclic layout (e.g., process) | All fixes apply unchanged: clockwise spatial order, wire-angle rotation (only if symbols happen to be circuit-type, which they won't be), key format, zone layout |
