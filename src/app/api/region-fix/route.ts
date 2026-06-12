import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'

const MODEL = 'claude-sonnet-4-6'

interface RegionFixRequest {
  svg: string
  imageBase64: string
  imageMimeType: string
  bbox: { x: number; y: number; width: number; height: number }
  prompt: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RegionFixRequest
  try {
    body = (await req.json()) as RegionFixRequest
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { svg, imageBase64, imageMimeType, bbox, prompt } = body
  if (!svg || !imageBase64 || !imageMimeType || !bbox || !prompt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const systemPrompt = `You are a tactile STEM diagram SVG editor. You receive a full SVG page and must apply a targeted fix to a specific region, leaving everything else unchanged.

RULES — these are absolute and non-negotiable:
1. Return ONLY the complete updated SVG. No explanation, no markdown, no code fences. Start with <svg and end with </svg>.
2. Only modify elements whose bounding boxes fall within or immediately adjacent to the selected region (x=${bbox.x.toFixed(1)}mm–${(bbox.x + bbox.width).toFixed(1)}mm, y=${bbox.y.toFixed(1)}mm–${(bbox.y + bbox.height).toFixed(1)}mm).
3. Elements completely outside the selected region MUST remain byte-for-byte identical — same attributes, same values, same order.
4. Preserve the root <svg> element and all its attributes (viewBox, width, height, xmlns) exactly.
5. Preserve all <defs> exactly unless the fix requires adding a new def.
6. The output must be a complete, valid SVG.`

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `Here is the original diagram image for context.\n\nHere is the current full SVG:\n${svg}\n\nUser instruction for the selected region (x=${bbox.x.toFixed(1)}–${(bbox.x + bbox.width).toFixed(1)}mm, y=${bbox.y.toFixed(1)}–${(bbox.y + bbox.height).toFixed(1)}mm): ${prompt}\n\nReturn the complete updated SVG with only the necessary changes applied to that region.`,
            },
          ],
        },
      ],
    })

    const raw = message.content.find(b => b.type === 'text')?.text ?? ''
    // Strip any accidental markdown code fences
    const svgMatch = raw.match(/<svg[\s\S]*<\/svg>/i)
    if (!svgMatch) {
      return NextResponse.json({ error: 'Claude did not return valid SVG' }, { status: 500 })
    }

    return NextResponse.json({ svg: svgMatch[0] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
