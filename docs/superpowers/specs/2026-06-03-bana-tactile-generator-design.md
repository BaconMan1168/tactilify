# BANA-Compliant Tactile Diagram Generator — Design Spec

**Date:** 2026-06-03
**Status:** Awaiting user approval
**Phase:** 4.5 — Tactile Generator Upgrade (before Phase 5)

---

## 1. Problem Statement

The current Phase 4 tactile renderer produces printable braille SVGs, but falls short of real-world usability for blind and low-vision students:

- All components render as generic labeled rectangles regardless of diagram type
- No domain-specific tactile symbols (no battery plates, zigzag resistors, bond lines, force arrows, angle arcs)
- No exploration path instructions for touch navigation
- Single-page output only — complex diagrams are cramped and cognitively overloading
- Label strategy is always numbered markers regardless of diagram complexity or ordering
- No awareness of BANA page zone requirements
- No handling for biology, anatomy, spatial, or process diagrams
- Braille collision detection is bbox-only; no lead-line support

---

## 2. Goal

Produce printable tactile graphics that:

- Are usable by a blind student exploring with a finger on swell paper
- Follow BANA Guidelines for Tactile Graphics: clear page zones, minimum spacing, readable labels, intentional simplification
- Preserve the educational meaning of the original diagram, not just its visual appearance
- Handle any STEM diagram input gracefully — known domains get high-fidelity tactile symbols; unknown domains still get a useful, well-structured output
- Split across multiple pages when complexity demands it, rather than cramming everything onto one page

---

## 3. Architecture Overview

```
Image upload
    ↓
/api/analyze   →   DiagramAnalysis (Claude Vision, existing)
    ↓
/api/tactile   →   tactileAdaptor.ts   →   AITactileAdaptationPlan
                        ↓
                   tactilePlanner.ts (once per TactilePageSpec)   →   TactilePlan[]
                        ↓
                   tactileRenderer.ts (once per TactilePlan)   →   SVG string[]
                        ↓
                   { pages: string[] }   →   TactileSVG.tsx (multi-page UI)
```

**Key principle:** Claude makes semantic/tactile adaptation decisions. The renderer executes them deterministically using BANA-safe primitives. The validator enforces physical constraints.

---

## 4. Schema Changes

### 4.1 `src/types/diagram.ts`

Two new fields added to existing schemas:

**`DiagramElementSchema`** — add optional free-text symbol hint:

```typescript
symbolHint: z.string().nullish()
// Claude fills this with the element's domain type as a free-text string.
// Known values trigger high-fidelity tactile symbol renderers.
// Unknown values fall through to tactilePrimitive from the adaptation plan.
// Examples: "battery", "resistor", "atom", "bond-double", "force-arrow",
//           "op-amp", "mitochondria", "contour-line", "golgi-apparatus"
```

**`DiagramAnalysisSchema`** — add Claude-authored exploration guide:

```typescript
explorationInstructions: z.string()
// 1–3 sentence plain-text guide for how a student should explore this specific
// diagram by touch: start point, direction, what to look for.
// Example: "Trace the raised circuit loop clockwise from the battery.
//           Components are numbered in order of encounter."
```

### 4.2 `src/types/tactile.ts`

New types added:

```typescript
type TactileDomain =
  | 'circuit'      // EE, physics circuits
  | 'fbd'          // free-body, mechanics
  | 'physics'      // optics, waves, fields
  | 'chemistry'    // molecular, structural, reaction
  | 'chart'        // bar, line, pie, scatter, titration
  | 'flowchart'    // CS diagrams, logic gates
  | 'process'      // biology processes, earth science cycles
  | 'geometry'     // angles, polygons, coordinate planes, proofs
  | 'biology'      // cell diagrams, food webs, ecology
  | 'anatomy'      // anatomy cross-sections, plant diagrams
  | 'map'          // geographic, conceptual maps
  | 'spatial'      // orbital, crystal structure, 3D projection
  | 'generic'      // handled by local adaptor logic
  | 'unknown'      // triggers second Claude call for adaptation plan

type TactileStrategy =
  | 'direct-symbol-diagram'      // circuit, FBD, chemistry, geometry — known tactile symbols
  | 'simplified-spatial-diagram' // anatomy, physics spatial — simplified shapes + regions
  | 'labelled-region-map'        // cell diagrams, anatomy cross-sections — regions + lead-lines
  | 'flow-sequence'              // life cycles, food chains, process flows — elkjs layout
  | 'chart-reconstruction'       // bar, line, pie, scatter — axes + data primitives
  | 'fallback-locator-map'       // too dense or photo-like — numbered locators, defer to audio

type TactilePrimitive =
  | 'outer-boundary'   // outermost container shape (cell wall, diagram border)
  | 'inner-region'     // contained sub-region (organelle, compartment)
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'diamond'
  | 'triangle'
  | 'irregular-region' // Phase 2 — arbitrary polygon path
  | 'line'
  | 'arrow'
  | 'connector'
  | 'texture-fill'     // Phase 2 — SVG pattern for region distinction
  | 'letter-marker'    // letter reference marker (unordered dense diagrams)
  | 'number-marker'    // number reference marker (ordered sequences)

type LabelMethod =
  | 'direct'       // braille placed directly adjacent to element
  | 'lead-line'    // braille connected to element by raised line
  | 'letter-key'   // letter marker on element, decoded in key
  | 'number-key'   // number marker on element, decoded in key
  | 'texture-key'  // texture pattern, decoded in key (Phase 2)

type AITactileAdaptationPlan = {
  educationalPurpose: string          // what the diagram is teaching
  domain: TactileDomain
  tactileStrategy: TactileStrategy

  elementsToPreserve: {
    id: string
    label: string
    role:
      | 'primary-structure'
      | 'region'
      | 'connector'
      | 'arrow'
      | 'label'
      | 'annotation'
      | 'decorative'
    tactilePrimitive: TactilePrimitive
    labelMethod: LabelMethod
    importance: 'essential' | 'helpful' | 'optional'
  }[]

  elementsToOmit: {
    label: string
    reason: string
  }[]

  pagePlan: {
    pageType: 'single' | 'overview' | 'detail' | 'key' | 'exploration'
    purpose: string
    includedElementIds: string[]
  }[]

  explorationInstructions: string
  warnings?: string[]
}

type TactilePageSpec = {
  pageType: 'single' | 'overview' | 'detail' | 'key' | 'exploration'
  purpose: string
  elements: DiagramElement[]
  relationships: Relationship[]
  title: string
  pageNumber: number
  totalPages: number
}
```

New `ComponentShape` values added:

```typescript
// Domain-specific tactile symbols
| 'battery-symbol'      // long plate + short plate (circuit)
| 'resistor-symbol'     // zigzag polyline (circuit)
| 'capacitor-symbol'    // two parallel plates with gap (circuit)
| 'switch-symbol'       // open gap with angled lever (circuit)
| 'lamp-symbol'         // circle with X (circuit)
| 'inductor-symbol'     // series of raised bumps (circuit)
| 'diode-symbol'        // triangle + bar (circuit)
| 'atom-circle'         // circle labeled with element symbol (chemistry)
| 'bond-line'           // single/double/triple raised line between atoms (chemistry)
| 'force-arrow-scaled'  // arrow with length proportional to value (FBD)
| 'angle-arc'           // raised arc for geometry angle marker
| 'right-angle-mark'    // small square corner marker (geometry)
```

---

## 5. Prompt Changes

### 5.1 `src/lib/prompts.ts`

Two additions to `DIAGRAM_ANALYSIS_PROMPT`:

**`symbolHint` instruction** — added to the elements array description:

> For each element, provide a `symbolHint` string identifying its domain-specific type. Use precise technical names: "battery", "resistor", "capacitor", "switch", "lamp", "inductor", "diode", "atom", "bond-single", "bond-double", "bond-triple", "reaction-arrow", "force-arrow", "object-mass", "angle-arc", "right-angle-mark", "process-box", "decision-diamond", "bar", "axis-line", "data-point", "pie-sector". For elements that do not fit a known type, use a descriptive free-text name such as "op-amp", "mitochondria", "chloroplast", "contour-line", "synapse". Omit `symbolHint` only if the element has no meaningful type identity beyond its shape.

**`explorationInstructions` instruction** — added as a top-level field:

> Provide `explorationInstructions`: 1–3 plain-text sentences describing how a blind student should explore this specific diagram by touch. State a clear start point, direction, and what to pay attention to. Example: "Start at the battery on the left side. Trace the circuit loop clockwise. Each component is numbered in the order you encounter it."

### 5.2 Second Claude call for unknown/complex domains

A new prompt `TACTILE_ADAPTATION_PROMPT` is added to `prompts.ts`. This prompt is called from `/api/tactile` when the domain is `biology`, `anatomy`, `map`, `spatial`, or `unknown`. It receives the `DiagramAnalysis` JSON as input (not the image) and returns an `AITactileAdaptationPlan` as structured JSON.

The prompt instructs Claude to act as a tactile transcriber: identify the educational purpose, choose the tactile strategy, classify each element (primitive, label method, importance), decide what to omit and why, lay out the page plan, and write exploration instructions.

---

## 6. New File: `src/lib/svg/tactileAdaptor.ts`

### 6.1 Responsibilities

1. **Domain classification** — infers domain from `layoutHint` + distribution of `symbolHint` values
2. **Strategy selection** — maps domain to default tactile strategy; overridden by Claude plan for complex domains
3. **Symbol resolution** — maps each element to its `ComponentShape` using three-tier fallback
4. **Page split decision** — driven by `AITactileAdaptationPlan.pagePlan` (authoritative); fallback thresholds for known domains
5. **Adaptation plan generation** — local for known domains, second Claude call for unknown/complex domains

### 6.2 Domain → Strategy Defaults

| Domain | Default Strategy |
|---|---|
| `circuit`, `fbd`, `physics` | `direct-symbol-diagram` |
| `chemistry` | `direct-symbol-diagram` |
| `geometry` | `direct-symbol-diagram` |
| `chart` | `chart-reconstruction` |
| `flowchart`, `process` | `flow-sequence` |
| `biology`, `anatomy` | `labelled-region-map` |
| `map`, `spatial` | `simplified-spatial-diagram` (via Claude call) |
| `generic` | local adaptor logic |
| `unknown` | second Claude call → `AITactileAdaptationPlan` |

### 6.3 Domain Dispatch Table

```typescript
const DOMAIN_HANDLERS: Record<TactileDomain, DomainHandler> = {
  circuit:   circuitHandler,
  fbd:       fbdHandler,
  physics:   fbdHandler,        // shares FBD handler
  chemistry: chemistryHandler,
  chart:     chartHandler,
  flowchart: flowHandler,
  process:   flowHandler,       // shares flow handler
  geometry:  geometryHandler,
  biology:   aiAdaptedHandler,  // triggers Claude call
  anatomy:   aiAdaptedHandler,
  map:       aiAdaptedHandler,
  spatial:   aiAdaptedHandler,  // triggers Claude call
  generic:   genericHandler,
  unknown:   aiAdaptedHandler,
}
```

Each handler exports:
- `resolveShape(element: DiagramElement): ComponentShape`
- `shouldSplit(analysis: DiagramAnalysis): boolean`
- `buildPagePlan(analysis: DiagramAnalysis): TactilePageSpec[]`

### 6.4 Symbol Resolution — Three-Tier

```
Tier 1: symbolHint ∈ KNOWN_SYMBOLS map
        → high-fidelity named ComponentShape (battery-symbol, resistor-symbol, bond-line, etc.)

Tier 2: symbolHint is a string not in KNOWN_SYMBOLS
        → render using tactilePrimitive from AITactileAdaptationPlan
        → fallback to visualShape if no plan

Tier 3: symbolHint is null
        → render using visualShape (rect / circle / diamond / ellipse / arrow)
```

`KNOWN_SYMBOLS` is a `Map<string, ComponentShape>` in the adaptor. Adding a new high-fidelity symbol requires: (1) add entry to `KNOWN_SYMBOLS`, (2) add draw function to `tactileRenderer.ts`.

### 6.5 Page Splitting — Strategy-Aware Defaults

| Strategy | Page Structure |
|---|---|
| `direct-symbol-diagram` | Single page if ≤10 elements; overview + key page if more |
| `chart-reconstruction` | Always single page |
| `flow-sequence` | Overview page + step-by-step exploration page |
| `labelled-region-map` | Diagram page + key page |
| `simplified-spatial-diagram` | Overview + detail pages per region |
| `fallback-locator-map` | Single page with numbered locators; defer detail to audio |

When `AITactileAdaptationPlan.pagePlan` is present, it is authoritative — the planner does not override it.

---

## 7. Changes to `src/lib/svg/tactilePlanner.ts`

- Accepts `TactilePageSpec` (from the adaptor) instead of raw `DiagramAnalysis`
- Returns a single `TactilePlan` per call (caller loops over pages)
- Adds `instructionsZone` to every plan, between `drawingArea` and the key
- `elkjs` used for layout when strategy is `flow-sequence` or `directional`

### 7.1 Updated Page Zones

Every `TactilePlan` has four zones (all measurements in mm):

```
┌─────────────────────────────────────────┐
│  TITLE ZONE                             │  MARGIN → title_bottom
│  (braille, max 2 lines)                 │
├─────────────────────────────────────────┤
│                                         │
│  DRAWING AREA                           │  title_bottom + 4mm gap
│                                         │
├── 5mm separator line ───────────────────┤
│  INSTRUCTIONS ZONE                      │  drawing_bottom + 5mm
│  (braille, max 2 lines single-page,     │
│   max 4 lines overview page)            │
├── 5mm separator line ───────────────────┤
│  KEY ZONE                               │  instructions_bottom + 5mm
│  (braille key entries)                  │
└─────────────────────────────────────────┘
```

### 7.2 New Validation Codes

Added to `TactileValidationIssue`:

```typescript
| 'INSTRUCTIONS_OVERFLOW'  // exploration instructions too long for instructions zone
| 'SYMBOL_NOT_RENDERED'    // symbolHint provided but no renderer implemented
| 'SHAPE_TOO_SIMILAR'      // adjacent elements have tactilely indistinguishable shapes
| 'SYMBOL_TOO_DENSE'       // drawing area too crowded for reliable touch reading
```

---

## 8. Changes to `src/lib/svg/tactileRenderer.ts`

### 8.1 New Draw Functions

One draw function per new `ComponentShape`:

| Shape | Visual description |
|---|---|
| `battery-symbol` | Short thick plate + long thin plate, spaced 3mm |
| `resistor-symbol` | 5-peak zigzag polyline, 8mm wide |
| `capacitor-symbol` | Two parallel 6mm lines, 3mm gap between |
| `switch-symbol` | Open line gap, angled lever line at 45° |
| `lamp-symbol` | 8mm circle with X (two diagonal lines inside) |
| `inductor-symbol` | 4 raised bumps (semicircle arcs) in series |
| `diode-symbol` | Filled triangle + perpendicular bar at tip |
| `atom-circle` | Circle sized to element, braille element symbol inside |
| `bond-line` | 1 / 2 / 3 parallel lines (1.5mm gap between) based on bond type |
| `force-arrow-scaled` | Arrow, length = base 25mm + (magnitude/maxMag) × 50mm |
| `angle-arc` | Arc drawn between two line segments at their intersection |
| `right-angle-mark` | Small 3mm square at corner |

### 8.2 New: Lead-Line Labels

When `labelMethod === 'lead-line'`, the renderer draws a thin raised line (0.3mm stroke) from the braille label to the element edge. The line bends at 90° once if needed to avoid crossing other elements. Lead-line endpoint is placed at the nearest cardinal edge of the element bbox.

### 8.3 New: `drawInstructions` Zone

Called between `drawObject` loop and `drawKey`. Renders `explorationInstructions` as word-wrapped braille text in the instructions zone, respecting the zone height limit.

### 8.4 BANA Physical Constants

```typescript
const BANA = {
  MIN_SYMBOL_SIZE_MM:    6,    // smallest renderable tactile symbol
  MIN_LINE_GAP_MM:       3,    // minimum gap between parallel raised lines
  MIN_STROKE_MM:         0.7,  // minimum stroke width for swell paper detectability
  MIN_ELEMENT_SEP_MM:    4,    // minimum space between adjacent diagram elements
  MIN_BRAILLE_CLEAR_MM:  10,   // minimum clearance between braille text and raised lines
  MIN_LEAD_LINE_LEN_MM:  8,    // minimum lead-line length before it becomes unusable
}
```

All draw functions clamp to these. Violations are added to `TactilePlan.warnings`.

---

## 9. Changes to `/api/tactile/route.ts`

```typescript
// Before
POST → { svg: string }

// After
POST → { pages: string[] }
```

The route:
1. Parses `DiagramAnalysis` from the request body
2. Calls `buildTactileAdaptation(analysis)` — runs the adaptor (may make a second Claude call for unknown domains)
3. Loops over `adaptation.pages` calling `buildTactilePlan(pageSpec)` then `renderTactile(plan)` for each
4. Returns `{ pages: svgStrings[] }`

---

## 10. Changes to `TactileSVG.tsx`

- Accepts `{ pages: string[] }` instead of a single SVG string
- Shows page indicator: "Page 1 of 2 — Overview" / "Page 2 of 2 — Key"
- Prev / Next buttons for multi-page navigation (keyboard accessible, `aria-label`)
- Download button downloads all pages: single page → single `.svg` file; multi-page → `.zip` containing `page-1.svg`, `page-2.svg`, etc.
- Existing zoom controls (50%–200%) apply per page

---

## 11. New Dependencies

| Package | Purpose | Scope |
|---|---|---|
| `elkjs` | Graph layout for `flow-sequence` and `directional` strategies | Server-only, `/api/tactile` |
| `jszip` | Zip multi-page SVG downloads in `TactileSVG.tsx` | Client |
| `@flatten-js/core` | Phase 2 — lead-line collision detection, irregular region intersection | Server-only |

Explicitly excluded:
- `liblouis` — hand-rolled `braille.ts` retained; Grade 2 deferred to future phase
- `paper.js` — wrong execution model for server-side SVG generation

---

## 12. Phase 2 (Deferred, Design Now)

The following are explicitly out of scope for this implementation but designed now to avoid rework:

- **`irregular-region`** — arbitrary SVG polygon paths for biology/anatomy shapes
- **`texture-fill`** — SVG pattern fills (hatching, crosshatch, dots) for region distinction in `labelled-region-map`
- **`texture-key`** label method — texture pattern decoded in key
- **`@flatten-js/core`** validation — lead-line and irregular region collision checking
- **Grade 2 / Nemeth braille** — expanded `braille.ts` or replacement

---

## 13. Definition of Done

- [ ] `symbolHint` and `explorationInstructions` present in `DiagramAnalysis` for all diagram types
- [ ] `tactileAdaptor.ts` classifies domain and selects strategy for all 13 domain types
- [ ] Second Claude call fires for `biology`, `anatomy`, `map`, `spatial`, `unknown` domains
- [ ] Known tactile symbols render correctly: battery, resistor, capacitor, switch, lamp, inductor, diode, atom, bond (single/double/triple), force-arrow-scaled, angle-arc, right-angle-mark
- [ ] Page zones: title → drawing → instructions → key on every page
- [ ] Exploration instructions render as braille in instructions zone
- [ ] Multi-page: flow-sequence produces overview + exploration page; labelled-region-map produces diagram + key page
- [ ] Lead-line labels render and avoid crossing braille text
- [ ] `elkjs` drives layout for `flow-sequence` and `directional` strategies
- [ ] `/api/tactile` returns `{ pages: string[] }`
- [ ] `TactileSVG.tsx` shows page navigation and downloads zip for multi-page output
- [ ] BANA physical constants enforced; violations appear in `TactilePlan.warnings`
- [ ] All new validation codes fire correctly
- [ ] Zero TypeScript errors
- [ ] Existing Vitest tests pass; new tests for adaptor domain classification and symbol resolution
