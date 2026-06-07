import { NextRequest, NextResponse } from 'next/server'
import { jsonrepair } from 'jsonrepair'
import pRetry from 'p-retry'
import { anthropic } from '@/lib/anthropic'
import { DIAGRAM_ANALYSIS_PROMPT } from '@/lib/prompts'
import { DiagramAnalysisSchema } from '@/types/diagram'
import type { DiagramAnalysis } from '@/types/diagram'

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
