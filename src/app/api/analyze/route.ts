import { NextRequest, NextResponse } from 'next/server'
import { jsonrepair } from 'jsonrepair'
import pRetry from 'p-retry'
import { anthropic } from '@/lib/anthropic'
import { DiagramAnalysisSchema } from '@/types/diagram'
import type { DiagramAnalysis } from '@/types/diagram'

const DIAGRAM_ANALYSIS_PROMPT = `You are an accessibility expert analyzing STEM diagrams for blind and low-vision students.

IMPORTANT: First check whether the image is an educational diagram, technical drawing, chart, scientific illustration, or mathematical figure. If it is not — for example it is a photograph, portrait, artwork, meme, screenshot of unrelated text, or otherwise unrecognisable as a STEM diagram — return exactly this JSON and nothing else:
{"error":"NOT_A_DIAGRAM"}

Otherwise, analyze the diagram and return a JSON object with exactly this shape:

{
  "layoutHint": "cyclic" | "axial" | "directional" | "positional" | "none",
  "title": "Brief descriptive title of the diagram",
  "summary": "2-3 sentence plain-language description of what the diagram shows",
  "elements": [
    {
      "id": "short-unique-id",
      "label": "Human-readable name, e.g. '9V Battery' or 'Gravitational Force' or 'Convex Lens'",
      "type": "free-text domain type, e.g. battery | resistor | force | lens | bar | data-point",
      "value": "optional quantity with unit, e.g. '9V' or '100Ω' or '32N downward' or '45°'",
      "position": { "x": 0.5, "y": 0.3 },
      "visualShape": "rect" | "circle" | "diamond" | "ellipse" | "arrow",
      "symbolHint": "precise domain-specific type string for tactile rendering"
    }
  ],
  "relationships": [
    {
      "from": "element-id",
      "to": "element-id",
      "type": "connected-to | acts-on | reacts-with | light-ray | flows-to",
      "label": "optional description",
      "directed": true,
      "waypoints": []
    }
  ],
  "narration": [
    {
      "order": 1,
      "text": "Full sentence suitable for text-to-speech narration of this step",
      "elementId": "element-id"
    }
  ],
  "explorationInstructions": "optional 1-3 sentences describing tactile exploration path"
}

Rules:
- Assign every element a short unique id (e.g. "bat1", "r1", "f-gravity", "bar-a", "lens1")
- position values are normalised 0–1 coordinates (0 = left/top, 1 = right/bottom) relative to the diagram bounds
- visualShape: pick the closest match — rect for most components, circle for round elements, diamond for junctions/decisions, arrow for force vectors/rays/flow directions
- directed: true if the connection has an arrowhead, false if it is a plain wire or bidirectional line
- waypoints: list intermediate bend points (normalised 0–1) only for bent or curved connections; leave empty otherwise
- Narration must walk through the diagram logically from start to finish
- If the same element type appears 2 or more times with no distinguishing value (e.g. 7 random mitochondria spread in a cell diagram), collapse them into a single narration step using natural language such as "There are 7 mitochondria surrounding the nucleus." Set elementId to the first element of the group or null.
- Never produce one narration step per instance of a repeated element type
- Return ONLY the raw JSON — no markdown code fences, no commentary, nothing else

symbolHint rules:
- Provide a symbolHint string for every element that has a domain-specific type.
- For circuits: "battery", "resistor", "capacitor", "switch", "lamp", "inductor", "diode"
- For chemistry: "atom", "bond-single", "bond-double", "bond-triple", "reaction-arrow"
- For free-body diagrams: "force-arrow", "object-mass"
- For geometry: "angle-arc", "right-angle-mark"
- For charts: "bar", "axis-line", "data-point", "pie-sector", "line-series"
- For biology/anatomy use precise names: "mitochondria", "nucleus", "chloroplast", "cell-wall", "vacuole", "petal", "sepal", "anther", "filament", "stigma", "style", "ovary"
- For elements with no known type, use a descriptive free-text name (e.g. "control-valve", "heat-exchanger")
- Omit symbolHint only if the element has no meaningful type identity beyond its shape

explorationInstructions rules:
- If the diagram has a clear spatial or sequential structure, provide 1–3 plain-text sentences describing how a blind student should explore it by touch.
- State a clear start point, direction, and what to pay attention to.
- Example: "Start at the battery on the left side. Trace the circuit loop clockwise. Each component is numbered in the order you encounter it."
- Omit the field entirely if the diagram has no clear exploration path.

layoutHint guide:
- cyclic: connections form a closed loop (circuit diagrams, metabolic cycles, circular flow charts)
- axial: the diagram has coordinate axes with labeled scale (bar charts, line graphs, pie charts, titration curves, decay curves, scatter plots)
- directional: connections are arrows without a dominant cycle (reaction mechanisms, logic gate chains, signal flow diagrams, flowcharts)
- positional: element positions and orientations carry spatial meaning (free-body diagrams, ray diagrams, electric field lines, momentum diagrams)
- none: no clear spatial structure, or the diagram does not fit the above (orbital diagrams, Punnett squares, periodic table regions, structural formulas)`

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4096

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const ALLOWED_MEDIA = new Set<string>(['image/jpeg', 'image/png', 'image/webp'])

async function analyzeWithClaude(base64: string, mimeType: string): Promise<DiagramAnalysis> {
  const mediaType: ClaudeMediaType = ALLOWED_MEDIA.has(mimeType)
    ? (mimeType as ClaudeMediaType)
    : 'image/jpeg'

  const rawText = await pRetry(
    async () => {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: DIAGRAM_ANALYSIS_PROMPT,
              },
            ],
          },
        ],
      })

      const textBlock = message.content.find((b) => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text block in Claude response')
      }
      return textBlock.text
    },
    {
      retries: 2,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: ({ error, attemptNumber }) => {
        console.warn(`[analyze] attempt ${attemptNumber} failed: ${error.message}`)
      },
    },
  )

  if (/NOT_A_DIAGRAM/.test(rawText)) {
    throw Object.assign(new Error('NOT_A_DIAGRAM'), { code: 'NOT_A_DIAGRAM' })
  }

  const repaired = jsonrepair(rawText)
  const parsed: unknown = JSON.parse(repaired)

  const result = DiagramAnalysisSchema.safeParse(parsed)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new Error(`Schema validation failed: ${first?.message ?? 'unknown'}`)
  }

  return result.data
}

export async function POST(req: NextRequest) {
  let base64: string
  let mimeType: string

  try {
    const body = (await req.json()) as { base64?: unknown; mimeType?: unknown }
    if (typeof body.base64 !== 'string' || typeof body.mimeType !== 'string') {
      return NextResponse.json({ error: 'base64 and mimeType are required strings' }, { status: 400 })
    }
    base64 = body.base64
    mimeType = body.mimeType
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const analysis = await analyzeWithClaude(base64, mimeType)
    return NextResponse.json(analysis)
  } catch (err) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'NOT_A_DIAGRAM') {
      return NextResponse.json(
        { error: 'This image does not appear to be a STEM diagram. Please upload a diagram, chart, or scientific illustration.' },
        { status: 422 },
      )
    }
    const message = err instanceof Error ? err.message : 'Analysis failed'
    console.error('[analyze] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
