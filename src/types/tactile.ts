// Tactile plan types — intermediate representation between DiagramAnalysis and SVG output.
// All positions are in millimetres. 1 SVG unit = 1 mm in the final output.

export type TactilePlan = {
  page: {
    widthMm: number
    heightMm: number
    marginMm: number
    orientation: 'portrait' | 'landscape'
  }
  drawingArea: {
    xMm: number
    yMm: number
    widthMm: number
    heightMm: number
  }
  diagramType: 'circuit' | 'graph' | 'free-body' | 'unknown'
  layout: 'orthogonal-series-loop' | 'orthogonal-parallel' | 'custom'
  title: string
  objects: TactileObject[]
  connections: TactileConnection[]
  key: TactileKeyEntry[]
  transcriberNotes: string[]
  warnings: TactileValidationIssue[]
}

export type ComponentShape =
  | 'battery'
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'bulb'
  | 'switch'
  | 'generic-component'
  | 'wire'
  | 'axis'
  | 'bar'
  | 'line-chart'
  | 'pie-sector'
  | 'object-rect'
  | 'force-arrow'
  | 'marker-label'

export type TactileObject = {
  id: string
  sourceElementId?: string
  role: 'component' | 'wire' | 'marker' | 'key-entry'
  shape: ComponentShape
  xMm: number
  yMm: number
  widthMm?: number
  heightMm?: number
  rotated?: boolean
  marker?: string
  label?: string
  // Polyline / multi-point shapes (wire, line-chart, force-arrow)
  points?: { xMm: number; yMm: number }[]
  // Extra data for specialised shapes
  extra?: Record<string, number | string | boolean>
}

export type TactileConnection = {
  from: string
  to: string
  path: { xMm: number; yMm: number }[]
}

export type TactileKeyEntry = {
  marker: string
  elementId: string
  /** Raw label + value from DiagramAnalysis */
  text: string
  /** After STEM symbol normalisation */
  normalizedText: string
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
  message: string
}
