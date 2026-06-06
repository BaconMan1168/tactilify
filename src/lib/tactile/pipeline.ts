import { nanoid } from 'nanoid'
import { buildTactileAdaptation, type TactileAdaptationResult } from '@/lib/svg/tactileAdaptor'
import { buildTactilePlan } from '@/lib/svg/tactilePlanner'
import { renderTactile } from '@/lib/svg/tactileRenderer'
import { validateTactile, type ValidationReport } from './validation/validator'
import { dispatchRepairs, applyRepairs, DEFAULT_REPAIR_PARAMS, type RepairParams } from './repair/repairer'
import { getProfile, type PageProfile } from './layout/page-profiles'
import type { DiagramAnalysis } from '@/types/diagram'
import type { TactilePlan, TactilePageSpec } from '@/types/tactile'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TactilePipelineInput {
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
  pageProfileId?: string
}

export interface TactileAdaptation {
  pages: TactilePageSpec[]
  pageTitles: string[]
}

export interface TactileContext {
  // Input — never dropped
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
  profile: PageProfile
  pipelineRunId: string

  // Stage outputs — appended, never overwritten
  adaptation?: TactileAdaptation
  pagePlans?: TactilePlan[]
  svgPages?: string[]
  validationReport?: ValidationReport
  repairParams?: RepairParams
  repairsApplied?: string[]

  // Observability
  stageTimings: { stage: string; ms: number }[]
  warnings: string[]
}

export interface TactileResponse {
  pipelineRunId: string
  status: 'success' | 'partial' | 'failed' | 'unsupported'
  unsupportedReason?: string
  artifacts?: {
    svgPages: string[]
    pageTitles: string[]
    pageCount: number
    profileId: string
    profileName: string
  }
  validationReport: ValidationReport
  warnings: string[]
  errors: string[]
  retryCount: number
  repairsApplied: string[]
  stageTimings: { stage: string; ms: number }[]
  intermediates?: {
    adaptation: TactileAdaptation
    pagePlans: TactilePlan[]
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function splitPageForMultipage(page: TactilePageSpec): TactilePageSpec[] {
  if (page.elements.length <= 4) return [page]
  const mid = Math.ceil(page.elements.length / 2)
  const ids1 = new Set(page.elements.slice(0, mid).map(e => e.id))
  const ids2 = new Set(page.elements.slice(mid).map(e => e.id))
  const page1: TactilePageSpec = {
    ...page,
    elements: page.elements.slice(0, mid),
    relationships: page.relationships.filter(r => ids1.has(r.from) && ids1.has(r.to)),
    pageNumber: 1, totalPages: 2,
    title: `${page.title} (1 of 2)`,
  }
  const page2: TactilePageSpec = {
    ...page,
    elements: page.elements.slice(mid),
    relationships: page.relationships.filter(r => ids2.has(r.from) && ids2.has(r.to)),
    pageNumber: 2, totalPages: 2,
    title: `${page.title} (2 of 2)`,
  }
  return [page1, page2]
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runTactilePipeline(
  input: TactilePipelineInput,
  options: { includeIntermediates?: boolean } = {},
): Promise<TactileResponse> {
  const ctx: TactileContext = {
    analysis: input.analysis,
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    profile: getProfile(input.pageProfileId ?? 'a4'),
    pipelineRunId: nanoid(),
    stageTimings: [],
    warnings: [],
  }

  const time = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const t = Date.now()
    const result = await fn()
    ctx.stageTimings.push({ stage, ms: Date.now() - t })
    return result
  }

  // Stage 1: Adapt — check feasibility before any further work
  const adaptResult: TactileAdaptationResult = await time('adapt', () =>
    buildTactileAdaptation(ctx.analysis, ctx.imageBase64, ctx.imageMimeType),
  )

  if (adaptResult.status === 'unsupported') {
    return {
      pipelineRunId: ctx.pipelineRunId,
      status: 'unsupported',
      unsupportedReason: adaptResult.reason,
      validationReport: { overallStatus: 'passed', checks: [], hardFailures: [], softWarnings: [] },
      warnings: [],
      errors: [],
      retryCount: 0,
      repairsApplied: [],
      stageTimings: ctx.stageTimings,
    }
  }

  ctx.adaptation = { pages: adaptResult.pages, pageTitles: adaptResult.pageTitles }

  let repairParams = { ...DEFAULT_REPAIR_PARAMS }
  let retryCount = 0

  for (let attempt = 0; attempt <= 1; attempt++) {
    const currentRepair = attempt > 0 ? repairParams : undefined

    // Apply forceMultiPage split at the pipeline level before planning
    let pagesToPlan = ctx.adaptation!.pages
    let pageTitles = ctx.adaptation!.pageTitles
    if (currentRepair?.forceMultiPage && pagesToPlan.length === 1) {
      pagesToPlan = splitPageForMultipage(pagesToPlan[0])
      pageTitles = pagesToPlan.map(p => p.title)
    }

    // Stage 2: Plan — one or more TactilePlans per page spec (reference page may paginate)
    ctx.pagePlans = await time(`plan-${attempt}`, async () =>
      (await Promise.all(pagesToPlan.map(p => buildTactilePlan(p, ctx.profile, currentRepair)))).flat(),
    )

    // Stage 3: Render — one SVG string per page
    ctx.svgPages = await time(`render-${attempt}`, async () =>
      ctx.pagePlans!.map(plan => renderTactile(plan)),
    )

    // Stage 4: Validate — structural checks, no Claude critique
    ctx.validationReport = await time(`validate-${attempt}`, async () =>
      validateTactile(ctx.analysis, ctx.pagePlans!, ctx.svgPages!, ctx.profile),
    )

    if (ctx.validationReport.overallStatus !== 'failed') break
    if (attempt >= 1) break

    // Stage 5: Repair — determine what to change for next attempt
    const repairs = dispatchRepairs(ctx.validationReport, repairParams)
    if (repairs.length === 0) break

    repairParams = applyRepairs(repairParams, repairs)
    ctx.repairParams = repairParams
    ctx.repairsApplied = repairs.map(r => r.id)
    retryCount++
  }

  const vr = ctx.validationReport!
  // SVG-001 hard failure = no renderable output at all
  const svgFailed = vr.hardFailures.some(f => f.code === 'SVG-001')
  const status: TactileResponse['status'] =
    svgFailed ? 'failed' :
    vr.overallStatus === 'failed' ? 'partial' :
    vr.overallStatus === 'passed-with-warnings' ? 'partial' : 'success'

  const response: TactileResponse = {
    pipelineRunId: ctx.pipelineRunId,
    status,
    validationReport: vr,
    warnings: ctx.warnings,
    errors: vr.hardFailures.map(f => f.message),
    retryCount,
    repairsApplied: ctx.repairsApplied ?? [],
    stageTimings: ctx.stageTimings,
  }

  if (status !== 'failed' && ctx.svgPages && ctx.svgPages.length > 0) {
    // Use plan titles (which reflect any splitPageForMultipage rename) rather than
    // the original adaptation titles which may have fewer entries after a repair split.
    const pageTitles = ctx.pagePlans
      ? ctx.pagePlans.map(p => p.title)
      : ctx.adaptation!.pageTitles
    response.artifacts = {
      svgPages: ctx.svgPages,
      pageTitles,
      pageCount: ctx.svgPages.length,
      profileId: ctx.profile.id,
      profileName: ctx.profile.name,
    }
  }

  if (options.includeIntermediates) {
    response.intermediates = {
      adaptation: ctx.adaptation!,
      pagePlans: ctx.pagePlans!,
    }
  }

  return response
}
