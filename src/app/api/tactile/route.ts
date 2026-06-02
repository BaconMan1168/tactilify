import { NextRequest, NextResponse } from 'next/server'
import { renderTactile } from '@/lib/svg/tactileRenderer'
import { DiagramAnalysisSchema } from '@/types/diagram'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const analysis = DiagramAnalysisSchema.parse(body)
    const svg = renderTactile(analysis)
    return new NextResponse(svg, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render tactile SVG'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
