import { NextRequest, NextResponse } from 'next/server'
import { runTactilePipeline } from '@/lib/tactile/pipeline'
import { DiagramAnalysisSchema } from '@/types/diagram'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      analysis?: unknown
      imageBase64?: string
      imageMimeType?: string
      pageProfileId?: string
    }

    // Support both { analysis, imageBase64 } and bare DiagramAnalysis for backward compat
    const rawAnalysis = body.analysis ?? body
    const analysis = DiagramAnalysisSchema.parse(rawAnalysis)

    const result = await runTactilePipeline({
      analysis,
      imageBase64: typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined,
      imageMimeType: typeof body.imageMimeType === 'string' ? body.imageMimeType : undefined,
      pageProfileId: typeof body.pageProfileId === 'string' ? body.pageProfileId : 'a4',
    })

    if (result.status === 'unsupported') {
      return NextResponse.json({
        status: 'unsupported',
        reason: result.unsupportedReason,
      })
    }

    if (result.status === 'failed') {
      return NextResponse.json({
        status: result.status,
        errors: result.errors,
        validationReport: result.validationReport,
      }, { status: 422 })
    }

    const svgPages = result.artifacts?.svgPages ?? []
    const pageTitles = result.artifacts?.pageTitles ?? svgPages.map((_, i) => `Page ${i + 1}`)

    return NextResponse.json({
      // New format (artifacts envelope)
      status: result.status,
      artifacts: result.artifacts,
      validationReport: result.validationReport,
      warnings: result.warnings,
      stageTimings: result.stageTimings,
      // Legacy format (for TactileSVG.tsx backward compat)
      pages: svgPages,
      pageTitles,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to render tactile SVG'
    console.error('[tactile] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
