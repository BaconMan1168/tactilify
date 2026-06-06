import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'

const MODEL = 'claude-sonnet-4-6'

const PROMPT = `Generate a tactile diagram of this image which I can print on swell/embossed paper. Simplify it if necessary but not so much that the educational value is diminished. A student should be able to easily use their fingers to navigate the diagram by touch relatively easily (with minor outside guidance).

Output requirements:
- Return ONLY valid SVG markup — no markdown, no code fences, no explanation
- viewBox="0 0 210 297" (A4 proportions, units treated as mm)
- White background rect covering the full viewBox
- Black strokes only (#000000), no colored fills
- Stroke widths: 2.5px for primary shapes, 1.5px for secondary/connective lines
- No gradients, patterns, or opacity effects
- Simple geometric primitives only: rect, circle, ellipse, path, line, polyline, polygon
- Clear, readable text labels (font-size 9-13, font-family sans-serif) placed outside or beside each shape — never overlapping a raised line
- Shapes must be well-spaced so a fingertip can distinguish them individually
- Include a <title> element with a short description of the diagram`

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const ALLOWED_MEDIA = new Set<string>(['image/jpeg', 'image/png', 'image/webp'])

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

  const mediaType: ClaudeMediaType = ALLOWED_MEDIA.has(mimeType)
    ? (mimeType as ClaudeMediaType)
    : 'image/jpeg'

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
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
              text: PROMPT,
            },
          ],
        },
      ],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No SVG returned from model' }, { status: 500 })
    }

    const svg = textBlock.text.trim()
    return NextResponse.json({ svg })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[llm-tactile] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
