# BANA-Compliant Tactile Diagram Generator — Design Spec

**Date:** 2026-06-03
**Status:** Approved
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
// Known values trigger high-fidelity tactile symbol renderers (circuit, chemistry, geometry).
// Unknown values fall through to tactileSymbolRecipe from the adaptation plan.
// Examples: "battery", "resistor", "atom", "bond-double", "force-arrow",
//           "op-amp", "mitochondria", "contour-line", "golgi-apparatus"
```

**`DiagramAnalysisSchema`** — add Claude-authored exploration guide:

```typescript
explorationInstructions: z.string().nullish()
// Optional — 1–3 sentence plain-text guide for how a student should explore this
// specific diagram by touch: start point, direction, what to look for.
// Marked nullish because not all diagram analyses request tactile output.
// The adaptor falls back to AITactileAdaptationPlan.explorationInstructions
// (second Claude call) or a deterministic domain/strategy template when absent.
// Example: "Trace the raised circuit loop clockwise from the battery.
//           Components are numbered in order of encounter."
```

### 4.2 `src/types/tactile.ts`

New types added:

```typescript
// Concrete type for the visual shape field on DiagramElement.
// Derived from DiagramElement['visualShape'] — kept explicit for renderer dispatch clarity.
type VisualShape =
  | 'rect'
  | 'circle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'

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
  // 'irregular-region' deferred to Phase 2

// Modifiers applied on top of a base primitive — these describe marks drawn ON a shape.
// Label connection methods (lead-line, letter-key, etc.) live in LabelMethod only.
type TactileModifier =
  | 'inner-line'        // single straight line inside the shape
  | 'wavy-inner-line'   // sinusoidal line inside the shape (cristae, membranes)
  | 'parallel-lines'    // 2–3 evenly spaced horizontal lines (thylakoids, stacked structure)
  | 'cross'             // plus sign inside the shape
  | 'dot'               // single raised dot at the centre
  // 'texture-fill' deferred to Phase 2

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

// A recipe composes a base primitive + geometry params + modifiers into a single element.
// labelMethod here is recipe-level and overrides any element-level labelMethod when present.
// Element-level labelMethod (in AdaptedDiagramElement and elementsToPreserve) applies only
// when no recipe is assigned to that element.
type TactileSymbolRecipe = {
  basePrimitive: TactileBasePrimitive
  shapeParams?: ShapeParams
  modifiers?: TactileModifier[]
  labelMethod: LabelMethod   // recipe-level — takes precedence over element-level labelMethod
  simplificationReason?: string  // why the original was simplified this way
}

type LabelMethod =
  | 'direct'       // braille placed directly adjacent to element
  | 'lead-line'    // braille connected to element by raised guide line (0.5mm stroke)
  | 'letter-key'   // letter marker on element, decoded in key
  | 'number-key'   // number marker on element, decoded in key
  // 'texture-key' deferred to Phase 2

// The unified return type of the symbol resolution pipeline (see Section 6.4).
// Discriminating on 'kind' tells the renderer exactly how to draw the element.
type SymbolResolution =
  | { kind: 'componentShape'; shape: ComponentShape }
  | { kind: 'recipe'; recipe: TactileSymbolRecipe }
  | { kind: 'primitive'; primitive: TactileBasePrimitive }
  | { kind: 'visualShape'; visualShape: VisualShape }

// DiagramElement extended with per-element adaptation decisions from the adaptor.
// The adaptor produces these; the planner and renderer consume them.
type AdaptedDiagramElement = DiagramElement & {
  tactileSymbolRecipe?: TactileSymbolRecipe   // from AITactileAdaptationPlan (second Claude call)
  componentShape?: ComponentShape              // from KNOWN_SYMBOLS (Tier 1 circuit/chem/geometry)
  // element-level labelMethod; overridden by tactileSymbolRecipe.labelMethod when recipe present
  labelMethod?: LabelMethod
  importance?: 'essential' | 'helpful' | 'optional'
  adaptationWarnings?: string[]
}

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
    tactileSymbolRecipe?: TactileSymbolRecipe  // takes priority when present
    tactilePrimitive?: TactileBasePrimitive    // fallback when no recipe
    // element-level labelMethod; overridden by recipe.labelMethod when recipe present
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

// TactilePageSpec is the adaptor's output and the planner's input for a single page.
// All adaptation decisions — domain, strategy, recipes, label methods — are carried here
// so the planner and renderer never need to re-derive what the adaptor already decided.
type TactilePageSpec = {
  pageType: 'single' | 'overview' | 'detail' | 'key' | 'exploration'
  purpose: string
  domain: TactileDomain
  tactileStrategy: TactileStrategy
  elements: AdaptedDiagramElement[]
  relationships: Relationship[]
  title: string
  explorationInstructions: string
  pageNumber: number
  totalPages: number
  warnings?: string[]
}
```

New `ComponentShape` values added (domain symbols only — organic shapes are `TactileBasePrimitive` and handled through the recipe system, not the `ComponentShape` dispatch path):

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
```

---

## 5. Prompt Changes

### 5.1 `src/lib/prompts.ts`

Two additions to `DIAGRAM_ANALYSIS_PROMPT`:

**`symbolHint` instruction** — added to the elements array description:

> For each element, provide a `symbolHint` string identifying its domain-specific type. Use precise technical names: "battery", "resistor", "capacitor", "switch", "lamp", "inductor", "diode", "atom", "bond-single", "bond-double", "bond-triple", "reaction-arrow", "force-arrow", "object-mass", "angle-arc", "right-angle-mark", "process-box", "decision-diamond", "bar", "axis-line", "data-point", "pie-sector". For biology/anatomy, use precise names such as "mitochondria", "nucleus", "chloroplast", "petal", "sepal", "anther", "filament", "stigma", "style", "ovary", "cell-wall", "vacuole". For elements with no known type, use a descriptive free-text name. Omit `symbolHint` only if the element has no meaningful type identity beyond its shape.

**`explorationInstructions` instruction** — added as a top-level optional field:

> If the diagram has a clear spatial or sequential structure that lends itself to tactile exploration, provide `explorationInstructions`: 1–3 plain-text sentences describing how a blind student should explore it by touch. State a clear start point, direction, and what to pay attention to. Omit the field entirely if the diagram has no clear exploration path (e.g., an abstract concept map or a heavily textual diagram). Example: "Start at the battery on the left side. Trace the circuit loop clockwise. Each component is numbered in the order you encounter it."

### 5.2 Second Claude call (`TACTILE_ADAPTATION_PROMPT`)

A new prompt `TACTILE_ADAPTATION_PROMPT` is added to `prompts.ts`. This prompt is called from `/api/tactile` when any of the following conditions are true:

- Domain is `biology`, `anatomy`, `map`, `spatial`, or `unknown`
- Element count > 12
- Relationship count > 15
- Any single element has more than 4 relationships (node degree > 4)
- Selected strategy is `fallback-locator-map`
- More than 30% of elements have `symbolHint` values not in `KNOWN_SYMBOLS`
- Estimated key height (one braille line per entry) exceeds the key zone line budget (8 lines)

**Image access decision:** For domains `biology`, `anatomy`, `map`, and `spatial`, the second Claude call receives both the `DiagramAnalysis` JSON and the original image (base64). These domains depend on visual topology — organelle arrangement, cell structure hierarchy, plant part positions, spatial layout — that the first-pass JSON may not fully capture. For all other domains, the second call receives JSON only.

The prompt instructs Claude to act as a tactile transcriber: identify the educational purpose, choose the tactile strategy, classify each element (recipe, label method, importance), decide what to omit and why, lay out the page plan, and write exploration instructions. For biology/anatomy elements, Claude should prefer `tactileSymbolRecipe` over bare `tactilePrimitive`.

**Known-domain advisory scope:** When the second Claude call runs for a known-symbol domain (`circuit`, `chemistry`, `geometry`, `fbd`, `physics`, `chart`), its output is advisory only for: page planning, label method selection, element importance, omissions, simplification warnings, and exploration instructions. It must not override Tier 1 symbol rendering. Symbol resolution precedence is always:

```
KNOWN_SYMBOLS match → Claude tactileSymbolRecipe → Claude tactilePrimitive → visualShape fallback
```

Example: a circuit diagram with 15 elements triggers the second Claude call for page planning and label strategy, but batteries, resistors, capacitors, switches, lamps, inductors, and diodes still render through `KNOWN_SYMBOLS`.

---

## 6. New File: `src/lib/svg/tactileAdaptor.ts`

### 6.1 Responsibilities

1. **Domain classification** — infers domain from `layoutHint` + distribution of `symbolHint` values; applies precedence order to resolve ambiguous cases
2. **Strategy selection** — maps domain to default tactile strategy; overridden by Claude plan for complex domains
3. **Symbol resolution** — maps each element to a `SymbolResolution` using three-tier fallback
4. **Page split decision** — driven by `AITactileAdaptationPlan.pagePlan` (authoritative); fallback thresholds for known domains
5. **Adaptation plan generation** — local for known domains, second Claude call when complexity triggers apply

### 6.2 Domain Classification Precedence

When a diagram has signals matching multiple domains, the adaptor applies this precedence order (highest confidence wins):

| Priority | Domain | Wins because |
|---|---|---|
| 1 | `chart` | Axis/data-point structures are unambiguous |
| 2 | `circuit` | IEC electrical symbols are unambiguous |
| 3 | `chemistry` | Molecular bond notation is unambiguous |
| 4 | `geometry` | Formal angle/polygon notation is unambiguous |
| 5 | `fbd` | Force vectors on isolated objects |
| 6 | `physics` | Optics, wave, field — broader than FBD |
| 7 | `flowchart` | Decision diamonds + control flow |
| 8 | `process` | Sequential steps without strict control flow |
| 9 | `anatomy` | Named cross-section or labeled structure |
| 10 | `biology` | Cell, ecology, food web |
| 11 | `map` | Geographic or conceptual map |
| 12 | `spatial` | 3D projection, orbital, crystal |
| 13 | `generic` | Rule-based fallback |
| 14 | `unknown` | Triggers second Claude call |

`anatomy` ranks above `biology` because it is the narrower, more specific classification — if anatomy signals are present, classify as `anatomy`.

### 6.3 Domain → Strategy Defaults

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

### 6.4 Domain Dispatch Table

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

### 6.5 `symbolHint` vs `DiagramElement.type`

`DiagramElement.type` remains the general semantic type used by the analysis renderer and narration. It may be broad, visual, or inconsistent across domains (e.g., `"line"`, `"arrow"`, `"circle"`).

`symbolHint` is a tactile-specific lookup hint used solely for `KNOWN_SYMBOLS` matching and tactile recipe selection. It should be more precise when tactile rendering requires specificity that `type` does not provide:

```typescript
{ type: 'line',    symbolHint: 'bond-double'   }
{ type: 'arrow',   symbolHint: 'force-arrow'   }
{ type: 'circle',  symbolHint: 'atom'          }
{ type: 'ellipse', symbolHint: 'mitochondria'  }
```

If `symbolHint` is absent, the adaptor uses `type` as a secondary symbol hint before falling through to `visualShape`. This means the three-tier resolution in Section 6.7 effectively has a pre-Tier-1 step: normalize `symbolHint ?? type` and check `KNOWN_SYMBOLS` before falling to recipe/primitive/visual.

### 6.6 `symbolHint` Normalization

All lookups into `KNOWN_SYMBOLS` normalize the `symbolHint` string before matching. Normalization rules:

1. Lowercase
2. Replace spaces and underscores with hyphens
3. Singularize common biology plurals

Key examples:

| Raw input | Normalized |
|---|---|
| `mitochondria` | `mitochondrion` |
| `chloroplasts` | `chloroplast` |
| `petals` | `petal` |
| `sepals` | `sepal` |
| `cell wall`, `cell_wall` | `cell-wall` |
| `right angle mark` | `right-angle-mark` |
| `bond double` | `bond-double` |
| `Nucleus` | `nucleus` |

The normalization logic lives in `src/lib/svg/tactileAdaptor.ts`. It does not need to be exhaustive — unrecognized hints fall through to Tier 2 (recipe from plan) or Tier 3 (visual shape) gracefully.

### 6.7 Symbol Resolution — Three-Tier

All resolution returns `SymbolResolution`. The renderer dispatches on `kind`.

```
Tier 1: normalize(symbolHint) ∈ KNOWN_SYMBOLS
        → { kind: 'componentShape', shape: ComponentShape }

Tier 2: symbolHint present but not in KNOWN_SYMBOLS
        → tactileSymbolRecipe from AITactileAdaptationPlan
          → { kind: 'recipe', recipe }
        OR tactilePrimitive from plan
          → { kind: 'primitive', primitive }
        OR visualShape fallback
          → { kind: 'visualShape', visualShape }

Tier 3: symbolHint is null
        → { kind: 'visualShape', visualShape }
```

`KNOWN_SYMBOLS` is a `Map<string, ComponentShape>` for standardized circuit/chemistry/geometry/FBD symbols — domains with one correct tactile representation. Biology structures have no standardized tactile notation; their recipes come entirely from the second Claude call. Adding a new known symbol requires an entry in `KNOWN_SYMBOLS` and a draw function in `tactileRenderer.ts`.

### 6.8 Page Splitting — Strategy-Aware Defaults

| Strategy | Page Structure |
|---|---|
| `direct-symbol-diagram` | Single page if ≤10 elements; overview + key page if more |
| `chart-reconstruction` | Single page by default; split when any category label > 8 braille cells, legend entries > 6, or data point count > 12 in scatter/bar |
| `flow-sequence` | Overview page + step-by-step exploration page |
| `labelled-region-map` | Single page if labels/key fit (≤8 key entries); diagram + key page if key overflows |
| `simplified-spatial-diagram` | Overview + detail pages per region |
| `fallback-locator-map` | Single page with numbered locators; defer detail to audio |

When `AITactileAdaptationPlan.pagePlan` is present, it is authoritative — the planner does not override it.

### 6.9 `explorationInstructions` Precedence

The adaptor resolves a single `explorationInstructions` string per `TactilePageSpec` using the following priority:

1. **`AITactileAdaptationPlan.explorationInstructions`** — used when the second Claude call ran. Tactile-specific, authoritative; replaces the first-pass value for every generated page.
2. **`DiagramAnalysis.explorationInstructions`** — used when no second Claude call ran.
3. **Deterministic adaptor fallback** — generated from `domain`, `tactileStrategy`, and `pageType` when neither value exists or the resolved string is empty.

The fallback templates are simple and domain-aware. Examples:
- `circuit` + `single`: `"Trace the circuit loop from the power source. Components are labeled in order of encounter."`
- `flow-sequence` + `overview`: `"Follow the sequence from the first step to the last. Each step is numbered."`
- `labelled-region-map` + `single`: `"Explore the regions from the outer boundary inward. Each region is identified by a lead-line label or key entry."`

---

## 7. Changes to `src/lib/svg/tactilePlanner.ts`

- Accepts `TactilePageSpec` (from the adaptor) instead of raw `DiagramAnalysis`
- Returns a single `TactilePlan` per call (caller loops over pages)
- Adds `instructionsZone`, `titleZone`, and `keyZone` as explicit typed zones to `TactilePlan`; content zones share `ZoneRect`; the page itself uses a separate `PageDimensions` type (no position coordinates — it always starts at 0,0)
- `elkjs` used for layout when strategy is `flow-sequence` only — not for `directional` layoutHint or any other strategy; spatial diagrams (FBD, ray, reaction) must preserve original layout

**Updated `TactilePlan` type:**

```typescript
// Positioned rectangle within the page — all measurements in mm.
// Used for every zone that has a position on the page.
type ZoneRect = {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

// Page physical dimensions — no xMm/yMm because the page origin is always 0,0.
// Distinct from ZoneRect to avoid confusing page size with zone position.
type PageDimensions = {
  widthMm: number
  heightMm: number
  marginMm: number
  orientation: 'portrait' | 'landscape'
}

type TactilePlan = {
  page: PageDimensions
  titleZone: ZoneRect         // braille title, max 2 lines
  drawingArea: ZoneRect       // main diagram content
  instructionsZone: ZoneRect  // exploration instructions, max 2 lines (single), 4 lines (overview)
  keyZone: ZoneRect           // braille key entries
  layoutHint: LayoutHint
  layout: 'cyclic-loop' | 'axial-chart' | 'positional' | 'directional' | 'grid'
  title: string
  explorationInstructions: string
  objects: TactileObject[]
  connections: TactileConnection[]
  key: TactileKeyEntry[]
  transcriberNotes: string[]
  warnings: TactileValidationIssue[]
}
```

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
| 'INSTRUCTIONS_OVERFLOW'  // exploration instructions too long for instructions zone; renderer truncates to available lines
| 'SYMBOL_NOT_RENDERED'    // symbolHint provided but no renderer implemented
| 'SHAPE_TOO_SIMILAR'      // adjacent elements have tactilely indistinguishable shapes
| 'SYMBOL_TOO_DENSE'       // drawing area too crowded for reliable touch reading
| 'LEAD_LINE_COLLISION'    // lead-line could not be routed without crossing text/objects using Phase 4.5 bbox routing
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
| `atom-circle` | Circle sized to element. Chemical identity via external label (direct, lead-line, or key entry). Braille is not placed inside unless the circle is large enough to satisfy `MIN_BRAILLE_CLEAR_MM`. Phase 4.5 default: labels are always external. |
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

When `labelMethod === 'lead-line'`, the renderer draws a raised guide line from the braille label to the nearest cardinal edge of the element bbox. Stroke width: `GUIDE_LINE_STROKE_MM` (0.5mm — lighter than structural elements at 0.7mm, but still detectable on swell paper). Lead-line minimum length: `MIN_LEAD_LINE_LEN_MM` (8mm).

**Phase 4.5 routing (bbox-only):** The renderer tries candidates in this order:
1. Straight guide line from label to nearest element edge.
2. One-bend orthogonal path (horizontal then vertical, or vertical then horizontal) — two candidates tried.

For each candidate, it checks bounding-box intersection against all braille text bboxes. It should also avoid element bboxes when doing so is trivial (i.e., at least one non-colliding candidate exists). If no candidate avoids all text bboxes, the renderer emits `LEAD_LINE_COLLISION` and uses the least-colliding candidate.

Full polygon intersection, irregular-region routing, and multi-obstacle avoidance are deferred to Phase 2 with `@flatten-js/core`.

### 8.5 New: `drawInstructions` Zone

Called between `drawObject` loop and `drawKey`. Renders `explorationInstructions` as word-wrapped braille text in the instructions zone, respecting the zone height limit.

### 8.6 BANA Physical Constants

```typescript
const BANA = {
  MIN_SYMBOL_SIZE_MM:    6,    // smallest renderable tactile symbol
  MIN_LINE_GAP_MM:       3,    // minimum gap between parallel raised lines
  MIN_STROKE_MM:         0.7,  // minimum stroke width for structural elements on swell paper
  GUIDE_LINE_STROKE_MM:  0.5,  // lead-line and cell-membrane stroke — lighter but detectable
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
POST → { pages: string[], pageTitles: string[] }
```

The route:
1. Parses `DiagramAnalysis` from the request body
2. Calls `buildTactileAdaptation(analysis)` — runs the adaptor (may make a second Claude call)
3. Loops over `adaptation.pages` calling `buildTactilePlan(pageSpec)` then `renderTactile(plan)` for each
4. Returns `{ pages: svgStrings[], pageTitles: string[] }` where `pageTitles` mirrors `AITactileAdaptationPlan.pagePlan[].purpose` and is used by `TactileSVG.tsx` to render page indicator labels without parsing SVG

---

## 10. Changes to `TactileSVG.tsx`

**Props interface is unchanged:** the component keeps `{ analysis: DiagramAnalysis }` as its prop. It continues to call `/api/tactile` itself with `analysis` in the request body.

**What changes internally:**
- `fetch` response is now parsed as JSON (`res.json()`) instead of plain text (`res.text()`)
- Internal state changes from `svgString: string | null` to `pages: string[] | null` + `currentPage: number` (0-indexed)
- Shows page indicator: "Page 1 of 2 — Overview" / "Page 2 of 2 — Key" (pulled from the page type in the SVG title or a separate metadata field — see below)
- Prev / Next buttons for multi-page navigation (keyboard accessible, `aria-label`)
- Download: single page → `.svg` file; multi-page → `.zip` via `jszip` containing `page-1.svg`, `page-2.svg`, etc.
- Existing zoom controls (50%–200%) apply per page

**Page label metadata:** `/api/tactile` returns `{ pages: string[], pageTitles: string[] }` so the component can show "Page 1 of 2 — Overview" without parsing the SVG. The `pageTitles` array mirrors `AITactileAdaptationPlan.pagePlan[].purpose`.

---

## 11. New Dependencies

| Package | Purpose | Scope |
|---|---|---|
| `elkjs` | Graph layout for `flow-sequence` strategy only | Server-only |
| `jszip` | Zip multi-page SVG downloads | Client |

Explicitly excluded (for now):
- `liblouis` — hand-rolled `braille.ts` retained; Grade 2 / Nemeth deferred to future phase
- `@flatten-js/core` — deferred to Phase 2 when lead-line and irregular region collision checking is implemented
- `paper.js` — deferred for re-evaluation; hand-authored bezier helpers cover Phase 4.5 organic shapes. Re-evaluate if organic path generation becomes hard to maintain at scale.

---

## 12. Phase 2 (Deferred)

The following are out of scope for Phase 4.5 but designed now to avoid rework:

- **`irregular-region`** — arbitrary SVG polygon paths for fully custom biology/anatomy shapes; not in active `TactileBasePrimitive` enum until implemented
- **`texture-fill` modifier** — SVG pattern fills (hatching, crosshatch, dots) for region distinction; not in active `TactileModifier` enum until implemented
- **`texture-key` label method** — texture pattern decoded in key; not in active `LabelMethod` enum until implemented
- **Output profile (`outputProfile`)** — `'swell-paper' | 'embosser' | 'screen-preview'`; Phase 4.5 targets swell paper only; stroke/spacing constants may vary per profile
- **`@flatten-js/core` validation** — polygon intersection checks for lead-lines and irregular regions
- **Grade 2 / Nemeth braille** — expanded `braille.ts` encoding
- **Paper.js evaluation** — if organic path recipes grow to 20+ shapes, evaluate paper.js as a Node.js-mode path generation backend

---

## 13. Definition of Done

- [ ] `symbolHint` and `explorationInstructions` present in `DiagramAnalysis` for all diagram types
- [ ] `tactileAdaptor.ts` classifies domain and selects strategy for all 14 domain types; applies classification precedence from Section 6.2
- [ ] `normalizeSymbolHint` runs before all `KNOWN_SYMBOLS` lookups
- [ ] `SymbolResolution` union used as the return type throughout the symbol resolution pipeline
- [ ] Second Claude call fires under all complexity trigger conditions (domain + element count + relationship count + node degree + label density + fallback strategy + key overflow)
- [ ] Second Claude call receives image for biology/anatomy/map/spatial; JSON-only for other domains
- [ ] Known tactile symbols render: battery, resistor, capacitor, switch, lamp, inductor, diode, atom, bond (single/double/triple), force-arrow-scaled, angle-arc, right-angle-mark
- [ ] Organic primitives render: `rounded-lobe`, `pointed-lobe`, `bean-region` with all modifiers (wavy-inner-line, parallel-lines, inner-line, dot, cross)
- [ ] `drawRecipe` dispatcher resolves base + modifiers + label method for any `TactileSymbolRecipe`
- [ ] Adaptation metadata (domain, strategy, recipes, label methods) flows from adaptor into `TactilePageSpec` → planner → renderer without re-derivation
- [ ] Page zones: title → drawing → instructions → key on every page
- [ ] Exploration instructions render as braille in instructions zone; overflow truncates to available lines and emits `INSTRUCTIONS_OVERFLOW`
- [ ] Multi-page: `flow-sequence` produces overview + exploration page; `labelled-region-map` splits only when key overflows; `chart-reconstruction` splits on concrete thresholds from Section 6.8: category label length > 8 braille cells, legend entries > 6, or scatter/bar data point count > 12
- [ ] Lead-line labels render at `GUIDE_LINE_STROKE_MM` and use simple bbox-aware routing to avoid braille text where possible; unresolved collisions emit `LEAD_LINE_COLLISION`
- [ ] `elkjs` drives layout for `flow-sequence` strategy only
- [ ] `/api/tactile` returns `{ pages: string[] }` as JSON
- [ ] `TactileSVG.tsx` shows page navigation and downloads zip for multi-page output
- [ ] BANA physical constants enforced; `ShapeParams` values clamped before drawing
- [ ] All new validation codes fire correctly
- [ ] Zero TypeScript errors
- [ ] Existing Vitest tests pass; new unit tests for adaptor domain classification, symbolHint normalization, symbol resolution, recipe dispatcher, and organic draw functions
