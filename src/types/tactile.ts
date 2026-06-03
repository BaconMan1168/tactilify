// Tactile plan types — intermediate representation between DiagramAnalysis and SVG output.
// All positions are in millimetres. 1 SVG unit = 1 mm in the final output.

import type { LayoutHint } from './diagram'

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
  layoutHint: LayoutHint
  layout: 'cyclic-loop' | 'axial-chart' | 'positional' | 'directional' | 'grid'
  title: string
  objects: TactileObject[]
  connections: TactileConnection[]
  key: TactileKeyEntry[]
  transcriberNotes: string[]
  warnings: TactileValidationIssue[]
}

// Generic outline shapes — no domain-specific symbols.
// Every component is rendered as one of these with an English label inside
// and a Braille label placed outside.
export type ComponentShape =
  | 'rect'         // default rectangle
  | 'circle'       // circular element
  | 'diamond'      // decision / junction
  | 'ellipse'      // oval element
  | 'arrow'        // directional arrow (force, ray, flow)
  | 'wire'         // plain polyline connection
  | 'axis'         // chart axis line
  | 'bar'          // bar chart bar
  | 'line-chart'   // line chart series
  | 'pie-sector'   // pie chart sector
  | 'marker-label' // Braille label placed outside a component

export type TactileObject = {
  id: string
  sourceElementId?: string
  role: 'component' | 'wire' | 'marker' | 'key-entry'
  shape: ComponentShape
  xMm: number
  yMm: number
  widthMm?: number
  heightMm?: number
  marker?: string   // key reference number
  label?: string    // English text (for component) or Braille text source (for marker-label)
  // Polyline / multi-point shapes (wire, line-chart, arrow)
  points?: { xMm: number; yMm: number }[]
  // Extra data for specialised shapes (pie-sector)
  extra?: Record<string, number | string | boolean>
}

export type TactileConnection = {
  from: string
  to: string
  directed?: boolean  // if true, renderer draws arrowhead at 'to' end
  path: { xMm: number; yMm: number }[]
}

export type TactileKeyEntry = {
  marker: string
  elementId: string
  text: string          // raw label + value
  normalizedText: string // after STEM symbol normalisation
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
