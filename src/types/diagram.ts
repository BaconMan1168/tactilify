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

// Rendering category — drives layout algorithm, not a closed list of science domains.
// cyclic:      connections form a loop (circuits, metabolic pathways, circular flows)
// axial:       diagram has coordinate axes with scale (charts, titration curves, decay curves)
// directional: connections are directed without a dominant cycle (reaction steps, logic gates, flowcharts)
// positional:  element positions carry spatial meaning (free-body, ray diagrams, field lines)
// none:        no clear spatial structure → grid fallback
export const LayoutHintSchema = z.enum(['cyclic', 'axial', 'directional', 'positional', 'none'])

export const DiagramElementSchema = z.object({
  id: z.string().default(() => nanoid()),
  label: z.string(),         // human name: "9V Battery", "Gravitational Force", "Convex Lens"
  type: z.string(),          // free-text domain type from Claude: "battery", "force", "lens"
  value: z.string().nullish(),               // "9V", "100Ω", "32N downward"
  position: z
    .object({
      x: z.number().min(0).max(1),           // normalised 0–1 centroid
      y: z.number().min(0).max(1),
    })
    .nullish(),
  visualShape: z
    .enum(['rect', 'circle', 'diamond', 'ellipse', 'arrow'])
    .nullish(),               // Claude's best guess at the element's visual shape; renderer defaults to rect
})

export const RelationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),          // "connected-to", "acts-on", "reacts-with", "light-ray"
  label: z.string().nullish(),
  directed: z.boolean(),     // true → render arrowhead on tactile connection line
  waypoints: z
    .array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
    .nullish(),               // intermediate bend points (normalised 0–1)
})

export const NarrationStepSchema = z.object({
  order: z.number().int().positive(),
  text: z.string(),          // full TTS sentence
  elementId: z.string().nullish(),
})

export const DiagramAnalysisSchema = z.object({
  layoutHint: LayoutHintSchema,
  title: z.string(),
  summary: z.string(),
  elements: z.array(DiagramElementSchema),
  relationships: z.array(RelationshipSchema),
  narration: z.array(NarrationStepSchema),
})

export type LayoutHint = z.infer<typeof LayoutHintSchema>
export type DiagramAnalysis = z.infer<typeof DiagramAnalysisSchema>
export type DiagramElement = z.infer<typeof DiagramElementSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type NarrationStep = z.infer<typeof NarrationStepSchema>
