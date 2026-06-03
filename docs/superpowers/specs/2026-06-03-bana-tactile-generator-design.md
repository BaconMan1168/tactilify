# BANA-Compliant Tactile Diagram Generator — Design Spec

**Date:** 2026-06-03
**Status:** Awaiting user approval
**Phase:** 4.5 — Tactile Generator Upgrade (before Phase 5)

---

## 1. Problem Statement

The current Phase 4 tactile renderer produces printable braille SVGs, but falls short of real-world usability for blind and low-vision students:

- All components render as generic labeled rectangles regardless of diagram type
- No domain-specific tactile symbols (no battery plates, zigzag resistors, bond lines, force arrows, angle arcs)
- No organic shape support — cell/anatomy/flower diagrams collapse to generic ellipses
- No exploration path instructions for touch navigation
- Single-page output only — complex diagrams are cramped and cognitively overloading
- Label strategy is always numbered markers regardless of diagram complexity or ordering
- No awareness of BANA page zone requirements
- Braille collision detection is bbox-only; no lead-line support

---

## 2. Goal

Produce printable tactile graphics that:

- Are usable by a blind student exploring with a finger on swell paper
- Follow BANA Guidelines for Tactile Graphics: clear page zones, minimum spacing, readable labels, intentional simplification
- Preserve the educational meaning of the original diagram, not just its visual appearance
- Handle any STEM diagram input gracefully — known domains get high-fidelity tactile symbols; unknown domains still get a useful, well-structured output using safe parameterized recipes
- Prevent common complex diagrams (mitochondria, flower parts, cell organelles) from degrading into generic shapes
- Split across multiple pages when complexity demands it, not by default

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

**Key principle:** Claude makes semantic/tactile adaptation decisions. The renderer executes them deterministically using BANA-safe primitives and recipes. The validator enforces physical constraints.

---

## 4. Schema Changes

### 4.1 `src/types/diagram.ts`

Two new fields added to existing schemas:

**`DiagramElementSchema`** — add optional free-text symbol hint:

```typescript
symbolHint: z.string().nullish()
// Claude fills this with the element's domain type as a free-text string.
// Known values trigger high-fidelity tactile symbol renderers or named biology recipes.
// Unknown values fall through to tactileSymbolRecipe from the adaptation plan.
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

// Base shape categories for the recipe system
type TactileBasePrimitive =
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'outer-boundary'    // outermost container shape (cell wall, diagram border)
  | 'inner-region'      // contained sub-region (organelle, compartment)
  | 'rounded-lobe'      // petal-like shape — two symmetric bezier curves to a rounded tip
  | 'pointed-lobe'      // sepal-like shape — two symmetric bezier curves to a sharp tip
  | 'bean-region'       // mitochondrion-like — ellipse with slight concavity on one side
  | 'irregular-region'  // Phase 2 — arbitrary polygon path

// Modifiers applied on top of a base primitive
type TactileModifier =
  | 'inner-line'        // single straight line inside the shape
  | 'wavy-inner-line'   // sinusoidal line inside the shape (cristae, membranes)
  | 'parallel-lines'    // 2–3 evenly spaced horizontal lines (thylakoids, stacked structure)
  | 'cross'             // plus sign inside the shape
  | 'dot'               // single raised dot at the centre
  | 'texture-fill'      // Phase 2 — SVG pattern fill
  | 'lead-line'         // thin raised line from label to element
  | 'letter-marker'     // letter reference marker
  | 'number-marker'     // number reference marker

// Geometry parameters — renderer clamps all values to BANA-safe limits
type ShapeParams = {
  widthMm?: number
  heightMm?: number
  radiusMm?: number
  rotationDeg?: number
  aspectRatio?: number    // width/height — renderer clamps to 0.5–4.0
  lineLengthMm?: number
  curvature?: number      // 0 = straight, 1 = maximum curve
}

// A recipe composes a base primitive + geometry params + modifiers into a single element
type TactileSymbolRecipe = {
  basePrimitive: TactileBasePrimitive
  shapeParams?: ShapeParams
  modifiers?: TactileModifier[]
  labelMethod: LabelMethod
  simplificationReason?: string  // why the original was simplified this way
}

type LabelMethod =
  | 'direct'       // braille placed directly adjacent to element
  | 'lead-line'    // braille connected to element by raised guide line (0.5mm stroke)
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
    // tactileSymbolRecipe takes priority when present; tactilePrimitive is the fallback
    tactileSymbolRecipe?: TactileSymbolRecipe
    tactilePrimitive?: TactileBasePrimitive
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
// Domain-specific tactile symbols (Phase 4.5)
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
// Organic shape primitives (Phase 4.5 — hand-authored bezier SVG helpers)
| 'rounded-lobe'        // petal shape
| 'pointed-lobe'        // sepal shape
| 'bean-region'         // mitochondrion-like concave oval
```

---

## 5. Prompt Changes

### 5.1 `src/lib/prompts.ts`

Two additions to `DIAGRAM_ANALYSIS_PROMPT`:

**`symbolHint` instruction** — added to the elements array description:

> For each element, provide a `symbolHint` string identifying its domain-specific type. Use precise technical names: "battery", "resistor", "capacitor", "switch", "lamp", "inductor", "diode", "atom", "bond-single", "bond-double", "bond-triple", "reaction-arrow", "force-arrow", "object-mass", "angle-arc", "right-angle-mark", "process-box", "decision-diamond", "bar", "axis-line", "data-point", "pie-sector". For biology/anatomy, use precise names such as "mitochondria", "nucleus", "chloroplast", "petal", "sepal", "anther", "filament", "stigma", "style", "ovary", "cell-wall", "vacuole". For elements with no known type, use a descriptive free-text name. Omit `symbolHint` only if the element has no meaningful type identity beyond its shape.

**`explorationInstructions` instruction** — added as a top-level field:

> Provide `explorationInstructions`: 1–3 plain-text sentences describing how a blind student should explore this specific diagram by touch. State a clear start point, direction, and what to pay attention to. Example: "Start at the battery on the left side. Trace the circuit loop clockwise. Each component is numbered in the order you encounter it."

### 5.2 Second Claude call (`TACTILE_ADAPTATION_PROMPT`)

A new prompt `TACTILE_ADAPTATION_PROMPT` is added to `prompts.ts`. This prompt is called from `/api/tactile` when any of the following conditions are true:

- Domain is `biology`, `anatomy`, `map`, `spatial`, or `unknown`
- Element count > 12
- Relationships count > 15
- Selected strategy is `fallback-locator-map`
- More than 30% of elements have `symbolHint` values not in `KNOWN_SYMBOLS`

The prompt receives `DiagramAnalysis` JSON (not the image) and returns `AITactileAdaptationPlan` as structured JSON, validated with Zod.

The prompt instructs Claude to act as a tactile transcriber: identify the educational purpose, choose the tactile strategy, classify each element (recipe, label method, importance), decide what to omit and why, lay out the page plan, and write exploration instructions. For biology/anatomy elements, Claude should prefer `tactileSymbolRecipe` over bare `tactilePrimitive`.

---

## 6. New File: `src/lib/svg/tactileAdaptor.ts`

### 6.1 Responsibilities

1. **Domain classification** — infers domain from `layoutHint` + distribution of `symbolHint` values
2. **Strategy selection** — maps domain to default tactile strategy; overridden by Claude plan for complex domains
3. **Symbol resolution** — maps each element to its `ComponentShape` or `TactileSymbolRecipe` using three-tier fallback
4. **Page split decision** — driven by `AITactileAdaptationPlan.pagePlan` (authoritative); fallback thresholds for known domains
5. **Adaptation plan generation** — local for known domains, second Claude call when complexity triggers apply

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
  physics:   fbdHandler,
  chemistry: chemistryHandler,
  chart:     chartHandler,
  flowchart: flowHandler,
  process:   flowHandler,
  geometry:  geometryHandler,
  biology:   aiAdaptedHandler,  // triggers Claude call (complexity checks apply)
  anatomy:   aiAdaptedHandler,
  map:       aiAdaptedHandler,
  spatial:   aiAdaptedHandler,
  generic:   genericHandler,
  unknown:   aiAdaptedHandler,
}
```

Each handler exports:
- `resolveRecipe(element: DiagramElement): TactileSymbolRecipe` — primary resolution
- `resolveShape(element: DiagramElement): ComponentShape` — legacy fallback
- `shouldTriggerClaudeCall(analysis: DiagramAnalysis): boolean`
- `buildPagePlan(analysis: DiagramAnalysis): TactilePageSpec[]`

### 6.4 Symbol Resolution — Three-Tier

```
Tier 1: symbolHint ∈ KNOWN_SYMBOLS map
        → high-fidelity named ComponentShape (battery-symbol, resistor-symbol, bond-line, etc.)
          OR named biology recipe from BIOLOGY_RECIPES

Tier 2: symbolHint is a string not in KNOWN_SYMBOLS
        → render using tactileSymbolRecipe from AITactileAdaptationPlan (if present)
        → fallback to tactilePrimitive from plan
        → fallback to visualShape if no plan

Tier 3: symbolHint is null
        → render using visualShape (rect / circle / diamond / ellipse / arrow)
```

`KNOWN_SYMBOLS` is a `Map<string, ComponentShape>` in the adaptor. `BIOLOGY_RECIPES` is a `Map<string, TactileSymbolRecipe>`. Adding a new high-fidelity symbol requires adding an entry to `KNOWN_SYMBOLS` and a draw function to `tactileRenderer.ts`.

### 6.5 Biology Recipes (`BIOLOGY_RECIPES`)

Named biology recipes Claude can reference by `symbolHint`. The renderer owns the actual SVG drawing.

```typescript
const BIOLOGY_RECIPES: Map<string, TactileSymbolRecipe> = new Map([
  ['mitochondrion', {
    basePrimitive: 'bean-region',
    shapeParams: { aspectRatio: 2.2 },
    modifiers: ['wavy-inner-line', 'letter-marker'],
    labelMethod: 'letter-key',
  }],
  ['nucleus', {
    basePrimitive: 'ellipse',
    shapeParams: { aspectRatio: 1.1 },
    modifiers: ['dot', 'letter-marker'],
    labelMethod: 'letter-key',
  }],
  ['chloroplast', {
    basePrimitive: 'ellipse',
    shapeParams: { aspectRatio: 2.0 },
    modifiers: ['parallel-lines', 'letter-marker'],
    labelMethod: 'letter-key',
  }],
  ['petal', {
    basePrimitive: 'rounded-lobe',
    shapeParams: { aspectRatio: 1.8 },
    modifiers: [],
    labelMethod: 'lead-line',
  }],
  ['sepal', {
    basePrimitive: 'pointed-lobe',
    shapeParams: { aspectRatio: 1.7 },
    modifiers: [],
    labelMethod: 'lead-line',
  }],
  ['ovary', {
    basePrimitive: 'ellipse',
    shapeParams: { aspectRatio: 1.2 },
    modifiers: ['letter-marker'],
    labelMethod: 'letter-key',
  }],
  ['style', {
    basePrimitive: 'line',
    modifiers: [],
    labelMethod: 'lead-line',
  }],
  ['stigma', {
    basePrimitive: 'circle',
    modifiers: ['dot'],
    labelMethod: 'lead-line',
  }],
  ['filament', {
    basePrimitive: 'line',
    modifiers: [],
    labelMethod: 'lead-line',
  }],
  ['anther', {
    basePrimitive: 'ellipse',
    shapeParams: { aspectRatio: 2.0 },
    modifiers: [],
    labelMethod: 'lead-line',
  }],
  ['cell-wall', {
    basePrimitive: 'outer-boundary',
    shapeParams: {},
    modifiers: [],
    labelMethod: 'letter-key',
  }],
  ['vacuole', {
    basePrimitive: 'ellipse',
    shapeParams: { aspectRatio: 1.3 },
    modifiers: ['inner-line'],
    labelMethod: 'letter-key',
  }],
])
```

### 6.6 Page Splitting — Strategy-Aware Defaults

| Strategy | Page Structure |
|---|---|
| `direct-symbol-diagram` | Single page if ≤10 elements; overview + key page if more |
| `chart-reconstruction` | Single page by default; split if >12 data points, long labels, or key overflows |
| `flow-sequence` | Overview page + step-by-step exploration page |
| `labelled-region-map` | Single page if labels/key fit; diagram + key page if key overflows |
| `simplified-spatial-diagram` | Overview + detail pages per region |
| `fallback-locator-map` | Single page with numbered locators; defer detail to audio |

When `AITactileAdaptationPlan.pagePlan` is present, it is authoritative — the planner does not override it.

---

## 7. Changes to `src/lib/svg/tactilePlanner.ts`

- Accepts `TactilePageSpec` (from the adaptor) instead of raw `DiagramAnalysis`
- Returns a single `TactilePlan` per call (caller loops over pages)
- Adds `instructionsZone` to `TactilePlan` type, between `drawingArea` and the key
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

### 8.1 New Draw Functions — Domain Symbols

| Shape | Description |
|---|---|
| `battery-symbol` | Short thick plate + long thin plate, spaced 3mm |
| `resistor-symbol` | 5-peak zigzag polyline, 8mm wide |
| `capacitor-symbol` | Two parallel 6mm lines, 3mm gap between |
| `switch-symbol` | Open line gap, angled lever line at 45° |
| `lamp-symbol` | 8mm circle with X (two diagonal lines inside) |
| `inductor-symbol` | 4 raised bumps (semicircle arcs) in series |
| `diode-symbol` | Filled triangle + perpendicular bar at tip |
| `atom-circle` | Circle sized to element, braille element symbol inside |
| `bond-line` | 1/2/3 parallel lines (1.5mm gap) based on bond type |
| `force-arrow-scaled` | Arrow, length = base 25mm + (magnitude/maxMag) × 50mm |
| `angle-arc` | Arc drawn between two line segments at their intersection |
| `right-angle-mark` | Small 3mm square at corner |

### 8.2 New Draw Functions — Organic Primitives (Phase 4.5)

Hand-authored SVG bezier path helpers. All use `xmlbuilder2` `<path>` elements with cubic bezier curves. `ShapeParams` are consumed to scale the path; renderer clamps to BANA minimums before drawing.

| Primitive | SVG approach |
|---|---|
| `rounded-lobe` | Two symmetric cubic bezier curves from base midpoint to rounded tip |
| `pointed-lobe` | Two symmetric cubic bezier curves from base midpoint to sharp tip |
| `bean-region` | Ellipse-like closed path with one side gently concave, via 4 cubic bezier segments |

Modifiers applied on top of a base primitive:

| Modifier | SVG approach |
|---|---|
| `wavy-inner-line` | Quadratic bezier wave path inside bounding box, 2–3 full cycles |
| `parallel-lines` | 2–3 evenly spaced horizontal lines clipped to shape bounds |
| `inner-line` | Single straight line at shape midpoint |
| `dot` | Small filled circle at centre (radius = 1mm) |
| `cross` | Two perpendicular lines through centre |

### 8.3 Recipe Dispatcher

New `drawRecipe(svg: El, obj: TactileObject, recipe: TactileSymbolRecipe)` function:

1. Calls the appropriate base primitive draw function with `recipe.shapeParams`
2. Iterates `recipe.modifiers` and applies each in order
3. Resolves `recipe.labelMethod` to the appropriate label placement strategy

### 8.4 New: Lead-Line Labels

When `labelMethod === 'lead-line'`, the renderer draws a raised guide line from the braille label to the nearest cardinal edge of the element bbox. Stroke width: `GUIDE_LINE_STROKE_MM` (0.5mm — lighter than structural elements at 0.7mm, but still detectable on swell paper). The line bends at 90° once if needed to clear other elements. Lead-line minimum length: `MIN_LEAD_LINE_LEN_MM` (8mm).

### 8.5 New: `drawInstructions` Zone

Called between `drawObject` loop and `drawKey`. Renders `explorationInstructions` as word-wrapped braille text in the instructions zone, respecting the zone height limit.

### 8.6 BANA Physical Constants

```typescript
const BANA = {
  MIN_SYMBOL_SIZE_MM:    6,    // smallest renderable tactile symbol
  MIN_LINE_GAP_MM:       3,    // minimum gap between parallel raised lines
  MIN_STROKE_MM:         0.7,  // minimum stroke width for structural elements on swell paper
  GUIDE_LINE_STROKE_MM:  0.5,  // lead-line stroke — lighter than structural, still detectable
  MIN_ELEMENT_SEP_MM:    4,    // minimum space between adjacent diagram elements
  MIN_BRAILLE_CLEAR_MM:  10,   // minimum clearance between braille text and raised lines
  MIN_LEAD_LINE_LEN_MM:  8,    // minimum lead-line length before it becomes unusable
  MAX_ASPECT_RATIO:      4.0,  // ShapeParams.aspectRatio upper clamp
  MIN_ASPECT_RATIO:      0.5,  // ShapeParams.aspectRatio lower clamp
}
```

All draw functions clamp to these. Violations are added to `TactilePlan.warnings`.

---

## 9. Changes to `/api/tactile/route.ts`

```typescript
// Before: bare SVG string, Content-Type: image/svg+xml
// After:  JSON, Content-Type: application/json
POST → { pages: string[] }
```

The route:
1. Parses `DiagramAnalysis` from the request body
2. Calls `buildTactileAdaptation(analysis)` — runs the adaptor (may make a second Claude call)
3. Loops over `adaptation.pages` calling `buildTactilePlan(pageSpec)` then `renderTactile(plan)` for each
4. Returns `{ pages: svgStrings[] }`

---

## 10. Changes to `TactileSVG.tsx`

- Accepts `{ pages: string[] }` instead of a single SVG string
- Shows page indicator: "Page 1 of 2 — Overview" / "Page 2 of 2 — Key"
- Prev / Next buttons for multi-page navigation (keyboard accessible, `aria-label`)
- Download: single page → `.svg` file; multi-page → `.zip` via `jszip` containing `page-1.svg`, `page-2.svg`, etc.
- Existing zoom controls (50%–200%) apply per page

---

## 11. New Dependencies

| Package | Purpose | Scope |
|---|---|---|
| `elkjs` | Graph layout for `flow-sequence` and `directional` strategies | Server-only |
| `jszip` | Zip multi-page SVG downloads | Client |

Explicitly excluded (for now):
- `liblouis` — hand-rolled `braille.ts` retained; Grade 2 / Nemeth deferred to future phase
- `@flatten-js/core` — deferred to Phase 2 when lead-line and irregular region collision checking is implemented
- `paper.js` — deferred for re-evaluation; hand-authored bezier helpers cover Phase 4.5 organic shapes. Re-evaluate if organic path generation becomes hard to maintain at scale.

---

## 12. Phase 2 (Deferred)

The following are out of scope for Phase 4.5 but designed now to avoid rework:

- **`irregular-region`** — arbitrary SVG polygon paths for fully custom biology/anatomy shapes
- **`texture-fill` modifier + `texture-key` label method** — SVG pattern fills (hatching, crosshatch, dots) for region distinction
- **`@flatten-js/core` validation** — polygon intersection checks for lead-lines and irregular regions
- **Grade 2 / Nemeth braille** — expanded `braille.ts` encoding
- **Paper.js evaluation** — if organic path recipes grow to 20+ shapes, evaluate paper.js as a Node.js-mode path generation backend

---

## 13. Definition of Done

- [ ] `symbolHint` and `explorationInstructions` present in `DiagramAnalysis` for all diagram types
- [ ] `tactileAdaptor.ts` classifies domain and selects strategy for all 14 domain types
- [ ] Second Claude call fires under all complexity trigger conditions (domain + element count + label density + fallback strategy)
- [ ] Known tactile symbols render: battery, resistor, capacitor, switch, lamp, inductor, diode, atom, bond (single/double/triple), force-arrow-scaled, angle-arc, right-angle-mark
- [ ] Organic primitives render: `rounded-lobe`, `pointed-lobe`, `bean-region` with all modifiers (wavy-inner-line, parallel-lines, inner-line, dot, cross)
- [ ] `BIOLOGY_RECIPES` all render correctly: mitochondrion, nucleus, chloroplast, petal, sepal, ovary, style, stigma, filament, anther, cell-wall, vacuole
- [ ] `drawRecipe` dispatcher resolves base + modifiers + label method for any `TactileSymbolRecipe`
- [ ] Page zones: title → drawing → instructions → key on every page
- [ ] Exploration instructions render as braille in instructions zone
- [ ] Multi-page: `flow-sequence` produces overview + exploration page; `labelled-region-map` splits only when key overflows; `chart-reconstruction` splits only on density
- [ ] Lead-line labels render at `GUIDE_LINE_STROKE_MM` (0.5mm) and avoid crossing braille text
- [ ] `elkjs` drives layout for `flow-sequence` and `directional` strategies
- [ ] `/api/tactile` returns `{ pages: string[] }` as JSON
- [ ] `TactileSVG.tsx` shows page navigation and downloads zip for multi-page output
- [ ] BANA physical constants enforced; `ShapeParams` values clamped before drawing
- [ ] All new validation codes fire correctly
- [ ] Zero TypeScript errors
- [ ] Existing Vitest tests pass; new unit tests for adaptor domain classification, symbol resolution, recipe dispatcher, and organic draw functions
