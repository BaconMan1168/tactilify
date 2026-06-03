// Tactile plan types — intermediate representation between DiagramAnalysis and SVG output.
// All positions are in millimetres. 1 SVG unit = 1 mm in the final output.

import type { DiagramElement, LayoutHint, Relationship } from './diagram'

export type Bbox = { x: number; y: number; w: number; h: number }

// ── Page geometry types ───────────────────────────────────────────────────────

// Positioned rectangle within the page — used for every zone that has a position.
export type ZoneRect = {
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
}

// Page physical dimensions — no position because the page origin is always 0,0.
export type PageDimensions = {
  widthMm: number
  heightMm: number
  marginMm: number
  orientation: 'portrait' | 'landscape'
}

// ── Domain & strategy classification ─────────────────────────────────────────

export type TactileDomain =
  | 'circuit'
  | 'fbd'
  | 'physics'
  | 'chemistry'
  | 'chart'
  | 'flowchart'
  | 'process'
  | 'geometry'
  | 'biology'
  | 'anatomy'
  | 'map'
  | 'spatial'
  | 'generic'
  | 'unknown'

export type TactileStrategy =
  | 'direct-symbol-diagram'
  | 'simplified-spatial-diagram'
  | 'labelled-region-map'
  | 'flow-sequence'
  | 'chart-reconstruction'
  | 'fallback-locator-map'

// ── Recipe system ─────────────────────────────────────────────────────────────

export type TactileBasePrimitive =
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'diamond'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'outer-boundary'
  | 'inner-region'
  | 'rounded-lobe'
  | 'pointed-lobe'
  | 'bean-region'

export type TactileModifier =
  | 'inner-line'
  | 'wavy-inner-line'
  | 'parallel-lines'
  | 'cross'
  | 'dot'

export type ShapeParams = {
  widthMm?: number
  heightMm?: number
  radiusMm?: number
  rotationDeg?: number
  aspectRatio?: number
  lineLengthMm?: number
  curvature?: number
}

export type LabelMethod =
  | 'direct'
  | 'lead-line'
  | 'letter-key'
  | 'number-key'

export type TactileSymbolRecipe = {
  basePrimitive: TactileBasePrimitive
  shapeParams?: ShapeParams
  modifiers?: TactileModifier[]
  labelMethod: LabelMethod
  simplificationReason?: string
}

// ── Symbol resolution pipeline ────────────────────────────────────────────────

// VisualShape mirrors DiagramElement['visualShape'] values — kept explicit for dispatch clarity.
export type VisualShape = 'rect' | 'circle' | 'diamond' | 'ellipse' | 'arrow'

export type SymbolResolution =
  | { kind: 'componentShape'; shape: ComponentShape }
  | { kind: 'recipe'; recipe: TactileSymbolRecipe }
  | { kind: 'primitive'; primitive: TactileBasePrimitive }
  | { kind: 'visualShape'; visualShape: VisualShape }

// ── Adapted element ───────────────────────────────────────────────────────────

export type AdaptedDiagramElement = DiagramElement & {
  tactileSymbolRecipe?: TactileSymbolRecipe
  componentShape?: ComponentShape
  labelMethod?: LabelMethod
  importance?: 'essential' | 'helpful' | 'optional'
  adaptationWarnings?: string[]
}

// ── AI adaptation plan ────────────────────────────────────────────────────────

export type AITactileAdaptationPlan = {
  educationalPurpose: string
  domain: TactileDomain
  tactileStrategy: TactileStrategy
  elementsToPreserve: {
    id: string
    label: string
    role: 'primary-structure' | 'region' | 'connector' | 'arrow' | 'label' | 'annotation' | 'decorative'
    tactileSymbolRecipe?: TactileSymbolRecipe
    tactilePrimitive?: TactileBasePrimitive
    labelMethod: LabelMethod
    importance: 'essential' | 'helpful' | 'optional'
  }[]
  elementsToOmit: { label: string; reason: string }[]
  pagePlan: {
    pageType: 'single' | 'overview' | 'detail' | 'key' | 'exploration'
    purpose: string
    includedElementIds: string[]
  }[]
  explorationInstructions: string
  warnings?: string[]
}

// ── Page spec (adaptor output / planner input) ────────────────────────────────

export type TactilePageSpec = {
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

// ── Component shapes ──────────────────────────────────────────────────────────

export type ComponentShape =
  | 'rect'
  | 'circle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'wire'
  | 'axis'
  | 'bar'
  | 'line-chart'
  | 'pie-sector'
  | 'marker-label'
  | 'anchor'
  // Phase 4.5 domain symbols
  | 'battery-symbol'
  | 'resistor-symbol'
  | 'capacitor-symbol'
  | 'switch-symbol'
  | 'lamp-symbol'
  | 'inductor-symbol'
  | 'diode-symbol'
  | 'atom-circle'
  | 'bond-line'
  | 'force-arrow-scaled'
  | 'angle-arc'
  | 'right-angle-mark'

// ── Tactile object ────────────────────────────────────────────────────────────

export type TactileObject = {
  id: string
  sourceElementId?: string
  role: 'component' | 'wire' | 'marker' | 'key-entry'
  shape: ComponentShape
  xMm: number
  yMm: number
  widthMm?: number
  heightMm?: number
  marker?: string
  markerSide?: 'top' | 'right' | 'bottom' | 'left'
  label?: string
  labelMethod?: LabelMethod
  // Polyline / multi-point shapes
  points?: { xMm: number; yMm: number }[]
  // Extra data for specialised shapes
  extra?: Record<string, number | string | boolean>
  // Recipe for organic/unknown primitives — when set, renderer calls drawRecipe
  recipe?: TactileSymbolRecipe
  // Lead-line target: set on marker-label objects to draw a raised guide line
  leadLineTo?: { xMm: number; yMm: number }
  // Placed footprint on page
  bboxMm?: Bbox
}

export type TactileConnection = {
  from: string
  to: string
  directed?: boolean
  path: { xMm: number; yMm: number }[]
}

export type TactileKeyEntry = {
  marker: string
  elementId: string
  text: string
  normalizedText: string
  heightMm: number
}

export type TactileValidationIssue = {
  severity: 'error' | 'warning'
  code:
    | 'LABEL_TOO_CLOSE'
    | 'TEXT_OVERFLOW'
    | 'UNKNOWN_SYMBOL'
    | 'COMPONENT_TOO_SMALL'
    | 'LINE_TOO_THIN'
    | 'MISSING_CONNECTION'
    | 'NO_LEGEND'
    | 'OBJECTS_TOO_CLOSE'
    | 'NORMALIZED_LAYOUT_WITHOUT_NOTE'
    | 'INSTRUCTIONS_OVERFLOW'
    | 'SYMBOL_NOT_RENDERED'
    | 'SHAPE_TOO_SIMILAR'
    | 'SYMBOL_TOO_DENSE'
    | 'LEAD_LINE_COLLISION'
  message: string
}

// ── Tactile plan ──────────────────────────────────────────────────────────────

export type TactilePlan = {
  page: PageDimensions
  titleZone: ZoneRect
  drawingArea: ZoneRect
  instructionsZone: ZoneRect
  keyZone: ZoneRect
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
