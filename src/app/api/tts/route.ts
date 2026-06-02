import { NextRequest, NextResponse } from 'next/server'
import pRetry from 'p-retry'
import { openai } from '@/lib/openai'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = (body as Record<string, unknown>)?.text
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text must be a non-empty string' }, { status: 400 })
  }

  try {
    const response = await pRetry(
      () =>
        openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: text,
        }),
      { retries: 3 },
    )

    const buffer = Buffer.from(await response.arrayBuffer())
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'TTS generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
