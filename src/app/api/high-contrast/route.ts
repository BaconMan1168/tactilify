import { NextRequest, NextResponse } from 'next/server'
import { processHighContrast } from '@/lib/image/highContrastProcessor'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { image?: unknown }
    if (typeof body.image !== 'string' || !body.image) {
      return NextResponse.json({ error: 'image is required' }, { status: 400 })
    }
    const base64 = await processHighContrast(body.image)
    return NextResponse.json({ base64 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
