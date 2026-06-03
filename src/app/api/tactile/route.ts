import { NextRequest, NextResponse } from 'next/server'
import { buildTactileAdaptation } from '@/lib/svg/tactileAdaptor'
import { buildTactilePlan } from '@/lib/svg/tactilePlanner'
import { renderTactile } from '@/lib/svg/tactileRenderer'
import { DiagramAnalysisSchema } from '@/types/diagram'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { analysis?: unknown; imageBase64?: string; imageMimeType?: string }

    // Support both { analysis, imageBase64 } and bare DiagramAnalysis for backward compat
    const rawAnalysis = body.analysis ?? body
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined
    const imageMimeType = typeof body.imageMimeType === 'string' ? body.imageMimeType : undefined

    const analysis = DiagramAnalysisSchema.parse(rawAnalysis)

    const adaptation = await buildTactileAdaptation(analysis, imageBase64, imageMimeType)

    const pages: string[] = []
    for (const pageSpec of adaptation.pages) {
      const plan = await buildTactilePlan(pageSpec)
      const svg = renderTactile(plan)
      pages.push(svg)
    }

    return NextResponse.json({ pages, pageTitles: adaptation.pageTitles })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render tactile SVG'
    console.error('[tactile] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
