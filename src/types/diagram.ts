import { z } from 'zod'
import { nanoid } from 'nanoid'

// Preserved from Phase 1 — used by preprocess route and client
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

// Zod schemas — single source of truth for all diagram types
export const DiagramTypeSchema = z.enum(['circuit', 'graph', 'free-body', 'unknown'])

export const DiagramElementSchema = z.object({
  id: z.string().default(() => nanoid()),
  label: z.string(),
  type: z.string(),
  value: z.string().nullish(),
  position: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .nullish(),
  brailleLabel: z.string().nullish(),
})

export const RelationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
  label: z.string().nullish(),
})

export const NarrationStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string(),
  elementId: z.string().nullish(),
})

export const DiagramAnalysisSchema = z.object({
  type: DiagramTypeSchema,
  title: z.string(),
  summary: z.string(),
  elements: z.array(DiagramElementSchema),
  relationships: z.array(RelationshipSchema),
  narration: z.array(NarrationStepSchema),
})

export type DiagramType = z.infer<typeof DiagramTypeSchema>
export type DiagramAnalysis = z.infer<typeof DiagramAnalysisSchema>
export type DiagramElement = z.infer<typeof DiagramElementSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type NarrationStep = z.infer<typeof NarrationStepSchema>
