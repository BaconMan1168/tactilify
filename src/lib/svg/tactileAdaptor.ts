// Server-only — do not import from client components
import { jsonrepair } from 'jsonrepair'
import pRetry from 'p-retry'
import { anthropic } from '@/lib/anthropic'
import { TACTILE_ADAPTATION_PROMPT } from '@/lib/prompts'
import type { DiagramAnalysis, DiagramElement } from '@/types/diagram'
import type {
  TactileDomain,
  TactileStrategy,
  TactilePageSpec,
  AdaptedDiagramElement,
  AITactileAdaptationPlan,
  SymbolResolution,
  ComponentShape,
} from '@/types/tactile'

// ── BANA known symbols (Tier 1 resolution) ────────────────────────────────────
// Maps normalized symbolHint → ComponentShape for all standardized tactile symbols.

export const KNOWN_SYMBOLS = new Map<string, ComponentShape>([
  // Circuit
  ['battery', 'battery-symbol'],
  ['cell', 'battery-symbol'],
  ['power-cell', 'battery-symbol'],
  ['resistor', 'resistor-symbol'],
  ['capacitor', 'capacitor-symbol'],
  ['switch', 'switch-symbol'],
  ['lamp', 'lamp-symbol'],
  ['bulb', 'lamp-symbol'],
  ['light-bulb', 'lamp-symbol'],
  ['inductor', 'inductor-symbol'],
  ['coil', 'inductor-symbol'],
  ['diode', 'diode-symbol'],
  // Chemistry
  ['atom', 'atom-circle'],
  ['bond-single', 'bond-line'],
  ['bond-double', 'bond-line'],
  ['bond-triple', 'bond-line'],
  // FBD
  ['force-arrow', 'force-arrow-scaled'],
  ['force', 'force-arrow-scaled'],
  // Geometry
  ['angle-arc', 'angle-arc'],
  ['angle', 'angle-arc'],
  ['right-angle-mark', 'right-angle-mark'],
  ['right-angle', 'right-angle-mark'],
])

const BIOLOGY_HINTS = new Set([
  'mitochondrion', 'nucleus', 'chloroplast', 'cell-wall', 'vacuole',
  'ribosome', 'cell-membrane', 'cytoplasm', 'golgi-apparatus', 'lysosome',
  'endoplasmic-reticulum', 'petal', 'sepal', 'anther', 'filament',
  'stigma', 'style', 'ovary', 'chlorophyll', 'stoma',
])

const ANATOMY_HINTS = new Set([
  'heart', 'lung', 'kidney', 'liver', 'artery', 'vein', 'neuron',
  'dendrite', 'axon', 'synapse', 'spinal-cord', 'cerebrum', 'muscle',
])

const MAP_HINTS = new Set([
  'country', 'continent', 'ocean', 'mountain', 'river', 'city',
  'region', 'border', 'coastline', 'province', 'state',
])

const SPATIAL_HINTS = new Set([
  'orbital', 'crystal', 'lattice', 'unit-cell', 'bond-angle',
  'molecular-geometry',
])

// ── symbolHint normalization ───────────────────────────────────────────────────

const PLURAL_MAP: Record<string, string> = {
  mitochondria: 'mitochondrion',
  chloroplasts: 'chloroplast',
  petals: 'petal',
  sepals: 'sepal',
  nuclei: 'nucleus',
  anthers: 'anther',
  filaments: 'filament',
  ovaries: 'ovary',
  vacuoles: 'vacuole',
  stomata: 'stoma',
}

export function normalizeSymbolHint(hint: string): string {
  let n = hint.toLowerCase().replace(/[\s_]+/g, '-').trim()
  n = PLURAL_MAP[n] ?? n
  return n
}

// ── Domain classification ─────────────────────────────────────────────────────

function countHintMatches(normalizedHints: string[], matchSet: Set<string>): number {
  return normalizedHints.filter(h => matchSet.has(h)).length
}

export function classifyDomain(analysis: DiagramAnalysis): TactileDomain {
  const hints = analysis.elements
    .map(e => normalizeSymbolHint(e.symbolHint ?? e.type ?? ''))
    .filter(Boolean)

  const has = (keys: string[]) => hints.some(h => keys.some(k => h === k || h.includes(k)))

  // Priority 1: chart
  if (analysis.layoutHint === 'axial') return 'chart'
  if (has(['bar', 'axis-line', 'data-point', 'pie-sector', 'line-series'])) return 'chart'

  // Priority 2: circuit
  const circuitScore = hints.filter(h =>
    ['battery', 'cell', 'resistor', 'capacitor', 'switch', 'lamp', 'bulb', 'inductor', 'diode'].includes(h)
  ).length
  if (circuitScore >= 2 || (circuitScore >= 1 && analysis.layoutHint === 'cyclic')) return 'circuit'

  // Priority 3: chemistry
  const chemScore = hints.filter(h =>
    ['atom', 'bond-single', 'bond-double', 'bond-triple', 'reaction-arrow'].includes(h)
  ).length
  if (chemScore >= 2) return 'chemistry'

  // Priority 4: geometry
  if (has(['angle-arc', 'right-angle-mark', 'angle', 'right-angle'])) return 'geometry'

  // Priority 5: FBD
  const fbdScore = hints.filter(h => ['force-arrow', 'force', 'object-mass'].includes(h)).length
  if (fbdScore >= 1) return 'fbd'

  // Priority 6: physics
  if (analysis.layoutHint === 'positional' && has(['lens', 'light-ray', 'mirror', 'wave', 'field-line', 'charge'])) return 'physics'

  // Priority 7: flowchart
  if (has(['decision-diamond', 'process-box']) || analysis.layoutHint === 'directional') return 'flowchart'

  // Priority 8: process
  if (analysis.layoutHint === 'cyclic') return 'process'

  // Priority 9: anatomy
  if (countHintMatches(hints, ANATOMY_HINTS) >= 1) return 'anatomy'

  // Priority 10: biology
  if (countHintMatches(hints, BIOLOGY_HINTS) >= 1) return 'biology'

  // Priority 11: map
  if (countHintMatches(hints, MAP_HINTS) >= 1) return 'map'

  // Priority 12: spatial
  if (countHintMatches(hints, SPATIAL_HINTS) >= 1) return 'spatial'

  return 'generic'
}

// ── Strategy selection ────────────────────────────────────────────────────────

export function selectStrategy(domain: TactileDomain): TactileStrategy {
  switch (domain) {
    case 'circuit':
    case 'fbd':
    case 'physics':
    case 'chemistry':
    case 'geometry':
      return 'direct-symbol-diagram'
    case 'chart':
      return 'chart-reconstruction'
    case 'flowchart':
    case 'process':
      return 'flow-sequence'
    case 'biology':
    case 'anatomy':
      return 'labelled-region-map'
    case 'map':
    case 'spatial':
      return 'simplified-spatial-diagram'
    default:
      return 'direct-symbol-diagram'
  }
}

// ── Complexity trigger check ───────────────────────────────────────────────────

export function shouldTriggerClaudeCall(domain: TactileDomain, analysis: DiagramAnalysis): boolean {
  // These domains always call Claude
  if (['biology', 'anatomy', 'map', 'spatial', 'unknown'].includes(domain)) return true

  if (analysis.elements.length > 12) return true
  if (analysis.relationships.length > 15) return true

  // Node degree > 4
  const degree = new Map<string, number>()
  for (const rel of analysis.relationships) {
    degree.set(rel.from, (degree.get(rel.from) ?? 0) + 1)
    degree.set(rel.to, (degree.get(rel.to) ?? 0) + 1)
  }
  if (degree.size > 0 && Math.max(...degree.values()) > 4) return true

  // More than 30% of symbolHints not in KNOWN_SYMBOLS
  const withHints = analysis.elements.filter(e => e.symbolHint)
  if (withHints.length > 0) {
    const unknown = withHints.filter(e => !KNOWN_SYMBOLS.has(normalizeSymbolHint(e.symbolHint!)))
    if (unknown.length / withHints.length > 0.3) return true
  }

  // Estimated key overflow (more than 8 entries)
  if (analysis.elements.length > 8) return true

  return false
}

// ── Symbol resolution — three-tier pipeline ───────────────────────────────────

export function resolveSymbol(
  element: DiagramElement,
  plan?: AITactileAdaptationPlan,
): SymbolResolution {
  const hint = element.symbolHint ?? element.type
  if (hint) {
    const normalized = normalizeSymbolHint(hint)
    const known = KNOWN_SYMBOLS.get(normalized)
    if (known) return { kind: 'componentShape', shape: known }
  }

  // Tier 2: from Claude adaptation plan
  if (plan) {
    const planEl = plan.elementsToPreserve.find(e => e.id === element.id)
    if (planEl?.tactileSymbolRecipe) return { kind: 'recipe', recipe: planEl.tactileSymbolRecipe }
    if (planEl?.tactilePrimitive) return { kind: 'primitive', primitive: planEl.tactilePrimitive }
  }

  // Tier 3: visual shape fallback
  const vs = (element.visualShape ?? 'rect') as 'rect' | 'circle' | 'diamond' | 'ellipse' | 'arrow'
  return { kind: 'visualShape', visualShape: vs }
}

// ── Exploration instructions fallback ─────────────────────────────────────────

export function fallbackExplorationInstructions(
  domain: TactileDomain,
  strategy: TactileStrategy,
  pageType: string,
): string {
  if (domain === 'circuit') {
    return 'Trace the circuit loop from the power source. Components are labeled in order of encounter.'
  }
  if (strategy === 'flow-sequence') {
    if (pageType === 'overview') return 'Follow the sequence from the first step to the last. Each step is numbered.'
    return 'Work through each numbered step in sequence from left to right.'
  }
  if (strategy === 'labelled-region-map') {
    return 'Explore the regions from the outer boundary inward. Each region is identified by a lead-line label or key entry.'
  }
  if (strategy === 'chart-reconstruction') {
    return 'Explore the chart from left to right. The vertical axis shows values; the horizontal axis shows categories.'
  }
  if (domain === 'fbd' || domain === 'physics') {
    return 'Explore from the central object outward. Each numbered arrow indicates a force or ray direction.'
  }
  return 'Explore the diagram systematically. Each component is labeled with a number key.'
}

// ── Local page spec builder (no Claude call) ──────────────────────────────────

function buildLocalPageSpecs(
  analysis: DiagramAnalysis,
  domain: TactileDomain,
  strategy: TactileStrategy,
): TactilePageSpec[] {
  const adaptedElements: AdaptedDiagramElement[] = analysis.elements.map(el => {
    const adapted: AdaptedDiagramElement = { ...el }
    const resolution = resolveSymbol(el)
    if (resolution.kind === 'componentShape') adapted.componentShape = resolution.shape
    return adapted
  })

  const instructions =
    analysis.explorationInstructions ?? fallbackExplorationInstructions(domain, strategy, 'single')

  // Always produce 2 pages: reference page (text) + diagram page (drawing).
  // This separates the key/exploration guide from the tactile graphic so each
  // page can be printed at full A4 size on a swell-paper or embossing printer.
  return [
    {
      pageType: 'key',
      purpose: 'Reference',
      domain,
      tactileStrategy: strategy,
      elements: adaptedElements,
      relationships: analysis.relationships,
      title: analysis.title,
      summary: analysis.summary,
      explorationInstructions: instructions,
      pageNumber: 1,
      totalPages: 2,
    },
    {
      pageType: 'single',
      purpose: analysis.title,
      domain,
      tactileStrategy: strategy,
      elements: adaptedElements,
      relationships: analysis.relationships,
      title: analysis.title,
      summary: analysis.summary,
      explorationInstructions: instructions,
      pageNumber: 2,
      totalPages: 2,
    },
  ]
}

// ── Apply adaptation plan from Claude ─────────────────────────────────────────

function applyAdaptationPlan(
  analysis: DiagramAnalysis,
  plan: AITactileAdaptationPlan,
): AdaptedDiagramElement[] {
  const omitIds = new Set(
    plan.elementsToOmit
      .map(o => analysis.elements.find(e => e.label === o.label)?.id)
      .filter((id): id is string => id !== undefined),
  )

  return analysis.elements
    .filter(el => !omitIds.has(el.id))
    .map(el => {
      const adapted: AdaptedDiagramElement = { ...el }
      const planEl = plan.elementsToPreserve.find(p => p.id === el.id)

      // Tier 1 always wins — KNOWN_SYMBOLS override Claude's recipe
      const hint = el.symbolHint ?? el.type
      const normalized = hint ? normalizeSymbolHint(hint) : ''
      const knownShape = normalized ? KNOWN_SYMBOLS.get(normalized) : undefined

      if (knownShape) {
        adapted.componentShape = knownShape
        // Label method from Claude is advisory for known-symbol domains
        adapted.labelMethod = planEl?.labelMethod ?? 'number-key'
      } else if (planEl?.tactileSymbolRecipe) {
        adapted.tactileSymbolRecipe = planEl.tactileSymbolRecipe
        adapted.labelMethod = planEl.tactileSymbolRecipe.labelMethod
      } else if (planEl) {
        adapted.labelMethod = planEl.labelMethod
      }

      if (planEl) {
        adapted.importance = planEl.importance
        adapted.adaptationWarnings = []
      }

      return adapted
    })
}

// ── Build page specs from Claude plan ─────────────────────────────────────────

function buildPageSpecsFromPlan(
  analysis: DiagramAnalysis,
  plan: AITactileAdaptationPlan,
  adaptedElements: AdaptedDiagramElement[],
): TactilePageSpec[] {
  // Filter out any key pages from Claude's plan — the pipeline always adds its own
  // reference page, so Claude-authored key pages would create duplicate content.
  const filteredPlan = plan.pagePlan.filter(p => p.pageType !== 'key')
  const totalPages = filteredPlan.length + 1  // +1 for the reference page

  const diagramPages = filteredPlan.map((page, idx) => {
    const includedIds = new Set(page.includedElementIds)
    const pageElements = adaptedElements.filter(e => includedIds.has(e.id))
    const pageRelationships = analysis.relationships.filter(
      r => includedIds.has(r.from) && includedIds.has(r.to),
    )

    const pageTitle =
      filteredPlan.length > 1 ? `${analysis.title} — ${page.purpose}` : analysis.title

    return {
      pageType: page.pageType,
      purpose: page.purpose,
      domain: plan.domain,
      tactileStrategy: plan.tactileStrategy,
      elements: pageElements,
      relationships: pageRelationships,
      title: pageTitle,
      summary: analysis.summary,
      explorationInstructions: plan.explorationInstructions,
      pageNumber: idx + 2,         // diagram pages start at 2 (reference is page 1)
      totalPages,
      warnings: plan.warnings,
    }
  })

  // Reference page always goes first — lists ALL adapted elements in the key.
  const referencePage: TactilePageSpec = {
    pageType: 'key',
    purpose: 'Reference',
    domain: plan.domain,
    tactileStrategy: plan.tactileStrategy,
    elements: adaptedElements,
    relationships: analysis.relationships,
    title: analysis.title,
    summary: analysis.summary,
    explorationInstructions: plan.explorationInstructions,
    pageNumber: 1,
    totalPages,
    warnings: plan.warnings,
  }

  return [referencePage, ...diagramPages]
}

// ── Claude call for adaptation plan ───────────────────────────────────────────

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const ALLOWED_MEDIA = new Set<string>(['image/jpeg', 'image/png', 'image/webp'])
const MODEL = 'claude-sonnet-4-6'

async function callClaudeForAdaptation(
  analysis: DiagramAnalysis,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<AITactileAdaptationPlan> {
  const domain = classifyDomain(analysis)
  const needsImage =
    imageBase64 && ['biology', 'anatomy', 'map', 'spatial'].includes(domain)
  const mediaType: ClaudeMediaType = imageMimeType && ALLOWED_MEDIA.has(imageMimeType)
    ? (imageMimeType as ClaudeMediaType)
    : 'image/jpeg'

  const analysisText = `Here is the diagram analysis JSON:\n\n${JSON.stringify(analysis, null, 2)}\n\nProvide the tactile adaptation plan.`

  const rawText = await pRetry(
    async () => {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: TACTILE_ADAPTATION_PROMPT,
        messages: [
          {
            role: 'user',
            content: needsImage
              ? [
                  { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64! } },
                  { type: 'text', text: analysisText },
                ]
              : analysisText,
          },
        ],
      })
      const textBlock = message.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') throw new Error('No text block in Claude response')
      return textBlock.text
    },
    {
      retries: 2,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: ({ error, attemptNumber }) => {
        console.warn(`[tactile-adapt] attempt ${attemptNumber} failed: ${error.message}`)
      },
    },
  )

  const repaired = jsonrepair(rawText)
  const parsed = JSON.parse(repaired) as AITactileAdaptationPlan

  // Minimal validation: ensure required fields exist
  if (!parsed.domain || !parsed.tactileStrategy || !Array.isArray(parsed.elementsToPreserve)) {
    throw new Error('Adaptation plan missing required fields')
  }

  return parsed
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildTactileAdaptation(
  analysis: DiagramAnalysis,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<{ pages: TactilePageSpec[]; pageTitles: string[] }> {
  const domain = classifyDomain(analysis)
  const strategy = selectStrategy(domain)

  let pages: TactilePageSpec[]

  if (shouldTriggerClaudeCall(domain, analysis)) {
    const plan = await callClaudeForAdaptation(analysis, imageBase64, imageMimeType)
    const adaptedElements = applyAdaptationPlan(analysis, plan)

    // If plan has no valid pagePlan, fall back to local builder
    if (!plan.pagePlan?.length) {
      pages = buildLocalPageSpecs(analysis, plan.domain ?? domain, plan.tactileStrategy ?? strategy)
    } else {
      pages = buildPageSpecsFromPlan(analysis, plan, adaptedElements)
    }
  } else {
    pages = buildLocalPageSpecs(analysis, domain, strategy)
  }

  return {
    pages,
    pageTitles: pages.map(p => p.purpose),
  }
}
