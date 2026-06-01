export type SupportedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'application/pdf'

export interface UploadedImage {
  id: string
  base64: string
  mimeType: SupportedMimeType
}

export type DiagramType = 'circuit' | 'graph' | 'freebody' | 'unknown'

export interface DiagramElement {
  id: string
  type: string
  label: string
  description: string
  position?: { x: number; y: number }
  connections?: string[]
}

export interface DiagramAnalysis {
  id: string
  diagramType: DiagramType
  title: string
  summary: string
  elements: DiagramElement[]
  narration: string[]
}
