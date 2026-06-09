# Tactile SVG Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen Fabric.js v6 SVG editor that lets teachers correct Claude's tactile diagram output before printing, integrated as a new `'editing'` state in the existing `page.tsx` state machine.

**Architecture:** `TactileEditor` is a pure component (no API calls) that receives `pages: string[]` from the results state; each page gets its own `EditorCanvas` instance wrapping a Fabric.js canvas. The lib layer (`svgLoader`, `svgExporter`, `brailleAdapter`, `patternAdapter`) handles all format translation between A4 SVG strings and Fabric object trees.

**Tech Stack:** Fabric.js v6 (canvas editing), Motion (AnimatePresence transitions), shadcn/ui (Button, Tabs, Tooltip, Separator), Vitest + @testing-library/react (tests)

> **MANDATORY:** Before writing any Fabric.js code in Tasks 4–12, query Context7 MCP with `resolve-library-id` for "fabric" then `query-docs` for the specific API you need. Fabric v6 has breaking changes from v5 (Promise-based loaders, new group system, new dispose lifecycle). Never rely on training-data knowledge for Fabric API signatures.

---

## File Map

**Create:**
- `src/lib/speechScript.ts` — `extractSpeechScript` extracted from route (pure fn)
- `src/lib/brailleAdapter.ts` — dot-cluster collapse on load; Unicode → dots on export
- `src/lib/patternAdapter.ts` — SVG pattern defs ↔ fabric.Pattern; pattern swap
- `src/lib/svgLoader.ts` — SVG string → configured Fabric canvas (mm→px scale, adapters)
- `src/lib/svgExporter.ts` — Fabric canvas → clean A4 SVG string (px→mm, adapters)
- `src/hooks/useEditorHistory.ts` — 20-step undo/redo stack per Fabric canvas
- `src/components/editor/TactileEditor.tsx` — root shell, full-screen overlay
- `src/components/editor/EditorCanvas.tsx` — one Fabric canvas instance per page
- `src/components/editor/EditorToolbar.tsx` — tool buttons + keyboard shortcuts
- `src/components/editor/PageNav.tsx` — page tabs at bottom
- `src/components/editor/PropertiesPanel.tsx` — context-sensitive right sidebar
- `src/components/editor/TexturePicker.tsx` — 4-swatch hatch pattern picker
- `src/lib/brailleAdapter.test.ts` — unit tests for brailleAdapter
- `src/lib/speechScript.test.ts` — unit tests for speechScript

**Modify:**
- `src/app/api/llm-tactile/route.ts` — import `extractSpeechScript` from `src/lib/speechScript.ts`
- `src/app/page.tsx` — add `'editing'` to AppState; add `tactilePages` state; wire edit button; render `<TactileEditor>`
- `src/components/output/TactileSVG.tsx` — add `pages` prop + `onEditRequest` callback + "Edit tactile diagram" button
- `src/hooks/useNarration.ts` — accept optional `speechScript?: string` override

---

## Task 1: Install Fabric.js and extract speechScript

**Files:**
- Create: `src/lib/speechScript.ts`
- Create: `src/lib/speechScript.test.ts`
- Modify: `src/app/api/llm-tactile/route.ts:218-232`

- [ ] **Step 1: Query Context7 for current Fabric.js v6 docs**

Run in your environment:
```
Context7: resolve-library-id "fabric"
Context7: query-docs [resolved-id] "installation npm package name v6"
```
Confirm the npm package is `fabric` at `^6.x.x`.

- [ ] **Step 2: Install fabric**

```bash
npm install fabric
npm install -D @types/fabric 2>/dev/null || true
```
Expected: `fabric` appears in `package.json` dependencies. (Fabric v6 ships its own types — `@types/fabric` may not be needed but harmless to attempt.)

- [ ] **Step 3: Write failing test for speechScript**

Create `src/lib/speechScript.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { extractSpeechScript } from './speechScript'

describe('extractSpeechScript', () => {
  it('extracts text before KEY section', () => {
    const svg = `<svg><text>Title</text><text>Description</text><text>KEY</text><text>A battery</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('Title')
    expect(result).toContain('Description')
    expect(result).not.toContain('battery')
  })

  it('returns all text when no KEY section', () => {
    const svg = `<svg><text>Title</text><text>Description</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('Title')
    expect(result).toContain('Description')
  })

  it('unescapes XML entities', () => {
    const svg = `<svg><text>R &amp; D &lt;lab&gt;</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('R & D <lab>')
  })
})
```

- [ ] **Step 4: Run test — expect FAIL**

```bash
npx vitest run src/lib/speechScript.test.ts
```
Expected: FAIL — `Cannot find module './speechScript'`

- [ ] **Step 5: Create `src/lib/speechScript.ts`**

```ts
export function extractSpeechScript(referenceSvg: string): string {
  const keyMatch = /<text\b[^>]*>\s*KEY\s*<\/text>/i.exec(referenceSvg)
  const searchArea = keyMatch ? referenceSvg.slice(0, keyMatch.index) : referenceSvg
  return searchArea
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
```

- [ ] **Step 6: Run test — expect PASS**

```bash
npx vitest run src/lib/speechScript.test.ts
```
Expected: PASS — 3 tests passing

- [ ] **Step 7: Update llm-tactile route to import from new location**

In `src/app/api/llm-tactile/route.ts`, remove the `extractSpeechScript` function body (lines 218–232) and add the import at the top:
```ts
import { extractSpeechScript } from '@/lib/speechScript'
```
The function call on line 322 (`const speechScript = extractSpeechScript(referenceSvg)`) stays unchanged.

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 9: Commit**

```bash
git add src/lib/speechScript.ts src/lib/speechScript.test.ts src/app/api/llm-tactile/route.ts package.json package-lock.json
git commit -m "feat(editor): install fabric v6, extract extractSpeechScript to lib/speechScript"
```

---

## Task 2: Wire `editing` AppState and update useNarration

**Files:**
- Modify: `src/app/page.tsx:18`
- Modify: `src/hooks/useNarration.ts`

- [ ] **Step 1: Add `'editing'` to AppState in page.tsx**

In `src/app/page.tsx` line 18, change:
```ts
type AppState = 'idle' | 'preview' | 'processing' | 'results'
```
to:
```ts
type AppState = 'idle' | 'preview' | 'processing' | 'results' | 'editing'
```

- [ ] **Step 2: Add tactilePages state and editing handlers to page.tsx**

After the `activeTab` state (line 37), add:
```ts
const [tactilePages, setTactilePages] = useState<string[]>([])
const [pendingSpeechScript, setPendingSpeechScript] = useState<string | null>(null)
```

Add these handlers after `handleReset`:
```ts
const handleEditRequest = (pages: string[]) => {
  setTactilePages(pages)
  setAppState('editing')
}

const handleEditorDone = ({ pages, speechScript }: { pages: string[]; speechScript: string | null }) => {
  setTactilePages(pages)
  if (speechScript !== null) setPendingSpeechScript(speechScript)
  setAppState('results')
}

const handleEditorCancel = () => {
  setAppState('results')
}
```

- [ ] **Step 3: Add editing state render to page.tsx AnimatePresence**

After the results block (before the landing block), add:
```tsx
{/* ── EDITING ── */}
{appState === 'editing' && (
  <motion.div
    key="editing"
    className="relative z-10 flex flex-col min-h-screen"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3 }}
  >
    {/* TactileEditor will be imported and rendered here in Task 13 */}
    <div className="flex items-center justify-center h-screen text-[#8a8f98]">
      Editor loading…
    </div>
  </motion.div>
)}
```

- [ ] **Step 4: Update useNarration to accept optional speechScript override**

In `src/hooks/useNarration.ts`, change the function signature from:
```ts
export function useNarration(steps: NarrationStep[]): UseNarrationResult {
```
to:
```ts
export function useNarration(steps: NarrationStep[], speechScriptOverride?: string | null): UseNarrationResult {
```

Add a `speechScriptOverride` ref after `stepsRef`:
```ts
const speechScriptOverrideRef = useRef(speechScriptOverride)
speechScriptOverrideRef.current = speechScriptOverride
```

Expose it in the return type and return value — add to `UseNarrationResult`:
```ts
export interface UseNarrationResult {
  currentStep: number
  isPlaying: boolean
  isPaused: boolean
  isSpeechSupported: boolean
  speechScriptOverride: string | null | undefined
  play: () => void
  pause: () => void
  stop: () => void
}
```

Add to the return object:
```ts
return { currentStep, isPlaying, isPaused, isSpeechSupported, speechScriptOverride, play, pause, stop }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/hooks/useNarration.ts
git commit -m "feat(editor): add editing AppState, tactilePages state, useNarration speechScript override"
```

---

## Task 3: brailleAdapter.ts

**Files:**
- Create: `src/lib/brailleAdapter.ts`
- Create: `src/lib/brailleAdapter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/brailleAdapter.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { findBrailleClusters, exportBrailleIText } from './brailleAdapter'

describe('findBrailleClusters', () => {
  it('groups nearby dots into a single cluster', () => {
    // Two braille dots for letter A (single dot at 0,0 offset) positioned at (20,30) and (22,30)
    // These are within 15mm so should form one cluster
    const svg = `<svg>
      <circle cx="20" cy="30" r="0.7" fill="#000000"/>
      <circle cx="22" cy="30" r="0.7" fill="#000000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].circles).toHaveLength(2)
  })

  it('separates dots more than 15mm apart into different clusters', () => {
    const svg = `<svg>
      <circle cx="20" cy="30" r="0.7" fill="#000000"/>
      <circle cx="60" cy="80" r="0.7" fill="#000000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(2)
  })

  it('ignores circles with radius != 0.7 or non-black fill', () => {
    const svg = `<svg>
      <circle cx="20" cy="30" r="3" fill="#000000"/>
      <circle cx="22" cy="30" r="0.7" fill="#ff0000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(0)
  })
})

describe('exportBrailleIText', () => {
  it('returns original SVG when no braille markers present', () => {
    const svg = `<svg><rect x="10" y="10" width="20" height="20"/></svg>`
    expect(exportBrailleIText(svg)).toBe(svg)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/lib/brailleAdapter.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Create `src/lib/brailleAdapter.ts`**

```ts
import { encodeBraille } from './braille'

const BRAILLE_DOT_R = 0.7
const BRAILLE_DOT_R_TOL = 0.01
const CLUSTER_THRESHOLD_MM = 15

export interface DotCircle {
  cx: number
  cy: number
}

export interface BrailleCluster {
  circles: DotCircle[]
  centroidX: number
  centroidY: number
}

// Parse <circle r="0.7" fill="#000000"> elements from SVG string
function parseBrailleDots(svg: string): DotCircle[] {
  const dots: DotCircle[] = []
  const re = /<circle\b([^>]*)\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) {
    const attrs = m[1]
    const r = parseFloat(/\br="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    const fill = /\bfill="([^"]*)"/.exec(attrs)?.[1] ?? ''
    if (Math.abs(r - BRAILLE_DOT_R) > BRAILLE_DOT_R_TOL) continue
    if (fill !== '#000000') continue
    const cx = parseFloat(/\bcx="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    const cy = parseFloat(/\bcy="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    if (isNaN(cx) || isNaN(cy)) continue
    dots.push({ cx, cy })
  }
  return dots
}

// Connected-component clustering: dots within CLUSTER_THRESHOLD_MM of any dot in the cluster
export function findBrailleClusters(svg: string): BrailleCluster[] {
  const dots = parseBrailleDots(svg)
  if (!dots.length) return []

  const assigned = new Array<boolean>(dots.length).fill(false)
  const clusters: BrailleCluster[] = []

  for (let i = 0; i < dots.length; i++) {
    if (assigned[i]) continue
    const cluster: DotCircle[] = [dots[i]]
    assigned[i] = true
    let changed = true
    while (changed) {
      changed = false
      for (let j = 0; j < dots.length; j++) {
        if (assigned[j]) continue
        const inRange = cluster.some(c => {
          const dx = c.cx - dots[j].cx
          const dy = c.cy - dots[j].cy
          return Math.sqrt(dx * dx + dy * dy) <= CLUSTER_THRESHOLD_MM
        })
        if (inRange) {
          cluster.push(dots[j])
          assigned[j] = true
          changed = true
        }
      }
    }
    const centroidX = cluster.reduce((s, c) => s + c.cx, 0) / cluster.length
    const centroidY = cluster.reduce((s, c) => s + c.cy, 0) / cluster.length
    clusters.push({ circles: cluster, centroidX, centroidY })
  }
  return clusters
}

// load: collapse dot clusters into placeholder markers in SVG string.
// Returns the transformed SVG string with a JSON data comment per cluster.
// The actual fabric.IText creation happens in svgLoader.ts using this data.
export function extractBrailleClusterData(svg: string): { svg: string; clusters: BrailleCluster[] } {
  const clusters = findBrailleClusters(svg)
  if (!clusters.length) return { svg, clusters: [] }

  // Build a set of all dot circle strings to remove from SVG
  const dotCircleRe = /<circle\b[^>]*r="0\.7"[^>]*fill="#000000"[^>]*\/>/g
  const stripped = svg.replace(dotCircleRe, '')

  return { svg: stripped, clusters }
}

// export: find braille marker comments injected by svgLoader, regenerate dot circles
export function exportBrailleIText(svg: string): string {
  // braille IText elements are written as <text data-braille="true" ...>UNICODE</text>
  // On export, replace them with regenerated dot circles
  return svg.replace(
    /<text\b([^>]*data-braille="true"[^>]*)>([^<]*)<\/text>/g,
    (_match, attrs: string, unicode: string) => {
      const xVal = /\bx="([^"]*)"/.exec(attrs)?.[1]
      const yVal = /\by="([^"]*)"/.exec(attrs)?.[1]
      if (!xVal || !yVal) return ''
      const x = parseFloat(xVal)
      const y = parseFloat(yVal)
      if (isNaN(x) || isNaN(y)) return ''

      // Re-encode the unicode text back to braille dots
      // The unicode is already braille encoded (U+2800-U+28FF), decode it to ASCII first
      // For simplicity we store the original ASCII in data-braille-text attribute
      const originalText = /\bdata-braille-text="([^"]*)"/.exec(attrs)?.[1] ?? unicode
      return textToBrailleCircles(originalText, x, y)
    }
  )
}

const BRAILLE_CELL_W = 6.0
const DOT_OFFSETS = [
  { bit: 0x01, dx: 0,   dy: 0   },
  { bit: 0x02, dx: 0,   dy: 2.5 },
  { bit: 0x04, dx: 0,   dy: 5.0 },
  { bit: 0x08, dx: 2.5, dy: 0   },
  { bit: 0x10, dx: 2.5, dy: 2.5 },
  { bit: 0x20, dx: 2.5, dy: 5.0 },
] as const

function f(v: number): string { return v.toFixed(1) }

function textToBrailleCircles(text: string, x: number, y: number): string {
  const brailleStr = encodeBraille(text)
  const circles: string[] = []
  let curX = x
  for (const ch of brailleStr) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x2800 && cp <= 0x28FF) {
      const bits = cp - 0x2800
      for (const { bit, dx, dy } of DOT_OFFSETS) {
        if (bits & bit) {
          circles.push(`<circle cx="${f(curX + dx)}" cy="${f(y + dy)}" r="${BRAILLE_DOT_R}" fill="#000000"/>`)
        }
      }
    }
    curX += BRAILLE_CELL_W
  }
  return `<g>${circles.join('')}</g>`
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/lib/brailleAdapter.test.ts
```
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/brailleAdapter.ts src/lib/brailleAdapter.test.ts
git commit -m "feat(editor): add brailleAdapter with cluster detection and dot export"
```

---

## Task 4: patternAdapter.ts

**Files:**
- Create: `src/lib/patternAdapter.ts`

> Before writing this file, query Context7: `query-docs [fabric-id] "fabric.Pattern constructor v6 patternUnits userSpaceOnUse"` and `query-docs [fabric-id] "FabricObject set fill pattern"`.

- [ ] **Step 1: Query Context7 for Fabric.js v6 Pattern API**

```
Context7: resolve-library-id "fabric"
Context7: query-docs [id] "Pattern constructor source repeat"
Context7: query-docs [id] "FabricObject set fill"
```
Note: confirm constructor signature and how to apply a Pattern as fill to a FabricObject.

- [ ] **Step 2: Create `src/lib/patternAdapter.ts`**

```ts
import type * as FabricType from 'fabric'

export type PatternType = 'none' | 'diagonal' | 'horizontal' | 'vertical' | 'crosshatch'

interface PatternEntry {
  id: string
  type: PatternType
}

// Classify an SVG <pattern> element by its line content
function classifyPattern(patternContent: string): PatternType {
  if (/<line[^>]*x1="0"[^>]*y1="0"[^>]*x2="[^"]*"[^>]*y2="0"/.test(patternContent)) return 'horizontal'
  if (/<line[^>]*x1="0"[^>]*y1="0"[^>]*x2="0"[^>]*y2/.test(patternContent)) return 'vertical'
  if (/<line/.test(patternContent)) {
    // Diagonal vs crosshatch: crosshatch has 2+ line elements
    const lineCount = (patternContent.match(/<line/g) ?? []).length
    return lineCount >= 2 ? 'crosshatch' : 'diagonal'
  }
  return 'none'
}

// Parse <defs> from SVG string, return map of pattern id → PatternType
export function parsePatternDefs(svgString: string): PatternEntry[] {
  const entries: PatternEntry[] = []
  const defsMatch = /<defs[^>]*>([\s\S]*?)<\/defs>/i.exec(svgString)
  if (!defsMatch) return entries
  const defsContent = defsMatch[1]
  const patternRe = /<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/gi
  let m: RegExpExecArray | null
  while ((m = patternRe.exec(defsContent)) !== null) {
    const idMatch = /\bid="([^"]*)"/.exec(m[1])
    if (!idMatch) continue
    entries.push({ id: idMatch[1], type: classifyPattern(m[2]) })
  }
  return entries
}

// Build an SVG data URL canvas element for a given pattern type (used to create fabric.Pattern)
function buildPatternSVGDataUrl(type: PatternType): string {
  let lines = ''
  switch (type) {
    case 'diagonal':
      lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'horizontal':
      lines = `<line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'vertical':
      lines = `<line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'crosshatch':
      lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>
               <line x1="8" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    default:
      return ''
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">${lines}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// Create a fabric.Pattern for a given PatternType
// Caller must pass the fabric namespace to avoid import-time canvas errors in SSR
export async function createFabricPattern(
  fabric: typeof FabricType,
  type: PatternType,
): Promise<FabricType.Pattern | null> {
  if (type === 'none') return null
  const dataUrl = buildPatternSVGDataUrl(type)
  if (!dataUrl) return null

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Context7: confirm fabric.Pattern constructor signature for v6
      const pattern = new fabric.Pattern({ source: img, repeat: 'repeat' })
      resolve(pattern)
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

// Apply a pattern type to a selected Fabric object
export async function applyPattern(
  fabric: typeof FabricType,
  obj: FabricType.FabricObject,
  type: PatternType,
  canvas: FabricType.Canvas,
): Promise<void> {
  if (type === 'none') {
    obj.set('fill', 'none')
    obj.set('data-pattern-type' as keyof FabricType.FabricObject, undefined)
  } else {
    const pattern = await createFabricPattern(fabric, type)
    if (pattern) {
      obj.set('fill', pattern)
      // Store type for export/serialization
      ;(obj as FabricType.FabricObject & { 'data-pattern-type': string })['data-pattern-type'] = type
    }
  }
  canvas.renderAll()
}

// Generate <defs> block with pattern definitions for the given types
export function buildPatternDefs(types: Set<PatternType>): string {
  const defs: string[] = []
  for (const type of types) {
    if (type === 'none') continue
    let lines = ''
    switch (type) {
      case 'diagonal':
        lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'horizontal':
        lines = `<line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'vertical':
        lines = `<line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'crosshatch':
        lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>
                 <line x1="8" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
    }
    defs.push(
      `<pattern id="pattern-${type}" patternUnits="userSpaceOnUse" width="8" height="8">${lines}</pattern>`
    )
  }
  return defs.length ? `<defs>${defs.join('')}</defs>` : ''
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: zero errors (fabric types may show module warnings — acceptable if no type errors in your files)

- [ ] **Step 4: Commit**

```bash
git add src/lib/patternAdapter.ts
git commit -m "feat(editor): add patternAdapter for SVG pattern defs and fabric.Pattern management"
```

---

## Task 5: svgLoader.ts

**Files:**
- Create: `src/lib/svgLoader.ts`

> Before writing: query Context7 `query-docs [fabric-id] "loadSVGFromString Promise v6"` and `query-docs [fabric-id] "Canvas constructor options"` and `query-docs [fabric-id] "IText constructor"`.

- [ ] **Step 1: Query Context7 for Fabric.js v6 SVG loading and canvas setup**

```
Context7: query-docs [fabric-id] "loadSVGFromString Promise return type v6"
Context7: query-docs [fabric-id] "Canvas constructor width height"
Context7: query-docs [fabric-id] "IText text options"
Context7: query-docs [fabric-id] "object:added event canvas"
```

- [ ] **Step 2: Create `src/lib/svgLoader.ts`**

```ts
import * as fabric from 'fabric'
import { extractBrailleClusterData } from './brailleAdapter'
import { parsePatternDefs, createFabricPattern, type PatternType } from './patternAdapter'

// A4: 210mm × 297mm → 595px × 842px
export const MM_TO_PX = 595 / 210
export const CANVAS_W = 595
export const CANVAS_H = 842

// Shape defaults applied to all teacher-drawn objects (not loaded from SVG)
const TACTILE_DEFAULTS = {
  stroke: '#000000',
  strokeWidth: 2.5,
  fill: 'none',
  strokeUniform: true,
}

// Selection color applied globally
function applySelectionDefaults() {
  // Context7: confirm property names for v6 selection color
  fabric.FabricObject.prototype.set({
    borderColor: '#5e6ad2',
    cornerColor: '#5e6ad2',
    cornerStrokeColor: '#5e6ad2',
  })
}

export async function loadSVGToCanvas(
  canvasEl: HTMLCanvasElement,
  svgString: string,
): Promise<fabric.Canvas> {
  // Context7: confirm loadSVGFromString signature in v6 before this call
  applySelectionDefaults()

  // Strip braille dot clusters, get cluster centroid data
  const { svg: strippedSvg, clusters } = extractBrailleClusterData(svgString)

  // Parse pattern defs before loading SVG
  const patternEntries = parsePatternDefs(strippedSvg)

  const canvas = new fabric.Canvas(canvasEl, {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
  })

  // Context7: use confirmed loadSVGFromString Promise API for v6
  const { objects } = await fabric.loadSVGFromString(strippedSvg)

  // Scale objects from mm to px coordinates
  const validObjects = objects.filter((o): o is fabric.FabricObject => o !== null)

  for (const obj of validObjects) {
    obj.scaleX = (obj.scaleX ?? 1) * MM_TO_PX
    obj.scaleY = (obj.scaleY ?? 1) * MM_TO_PX
    obj.left = (obj.left ?? 0) * MM_TO_PX
    obj.top = (obj.top ?? 0) * MM_TO_PX

    // Apply pattern fills
    const fillStr = obj.get('fill')
    if (typeof fillStr === 'string' && fillStr.startsWith('url(#')) {
      const patternId = fillStr.slice(5, -1)
      const entry = patternEntries.find(e => e.id === patternId)
      if (entry && entry.type !== 'none') {
        const pattern = await createFabricPattern(fabric, entry.type)
        if (pattern) {
          obj.set('fill', pattern)
          ;(obj as fabric.FabricObject & { 'data-pattern-type': string })['data-pattern-type'] = entry.type
        }
      }
    }

    // Convert <text> objects to IText for double-click editing
    if (obj.type === 'text') {
      const textObj = obj as fabric.Text
      const iText = new fabric.IText(textObj.text ?? '', {
        left: textObj.left,
        top: textObj.top,
        fontSize: textObj.fontSize,
        fontFamily: textObj.fontFamily,
        fill: textObj.fill,
        fontWeight: textObj.fontWeight,
      })
      canvas.add(iText)
      continue
    }

    canvas.add(obj)
  }

  // Add braille cluster IText elements (as non-editable Unicode display)
  for (const cluster of clusters) {
    const iText = new fabric.IText('⠿', {
      left: cluster.centroidX * MM_TO_PX,
      top: cluster.centroidY * MM_TO_PX,
      fontSize: 12,
      fill: '#000000',
      selectable: true,
      editable: false,
    })
    ;(iText as fabric.IText & { 'data-braille': boolean })['data-braille'] = true
    canvas.add(iText)
  }

  // Apply BANA defaults to any objects added by teacher (not SVG-loaded)
  canvas.on('object:added', (e) => {
    const obj = e.target
    if (!obj || (obj as { _svgLoaded?: boolean })._svgLoaded) return
    obj.set(TACTILE_DEFAULTS)
  })

  canvas.renderAll()
  return canvas
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: zero errors or only fabric import warnings

- [ ] **Step 4: Commit**

```bash
git add src/lib/svgLoader.ts
git commit -m "feat(editor): add svgLoader with mm-to-px scaling, braille IText, pattern fill mapping"
```

---

## Task 6: svgExporter.ts

**Files:**
- Create: `src/lib/svgExporter.ts`

> Before writing: query Context7 `query-docs [fabric-id] "canvas.toSVG options v6"`.

- [ ] **Step 1: Query Context7 for Fabric.js v6 toSVG API**

```
Context7: query-docs [fabric-id] "canvas toSVG options viewBox"
Context7: query-docs [fabric-id] "toJSON propertiesToInclude custom properties"
```

- [ ] **Step 2: Create `src/lib/svgExporter.ts`**

```ts
import type * as fabric from 'fabric'
import { exportBrailleIText } from './brailleAdapter'
import { buildPatternDefs, type PatternType } from './patternAdapter'
import { MM_TO_PX } from './svgLoader'

const PX_TO_MM = 1 / MM_TO_PX

// Fabric adds proprietary attributes — strip them to produce clean SVG
const FABRIC_ATTRS_RE = /\s(fabric:[a-z-]+|data-object-type)="[^"]*"/g

function stripFabricAttributes(svg: string): string {
  return svg
    .replace(FABRIC_ATTRS_RE, '')
    // Remove Fabric-inserted XML processing instructions
    .replace(/<\?xml[^?]*\?>\n?/g, '')
    // Remove Fabric's generator comment
    .replace(/<!--[^-]*Created with Fabric[^-]*-->/g, '')
}

// Scale all coordinate attributes from px back to mm
function scaleCoordsToMM(svg: string): string {
  const numericAttrs = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'r', 'rx', 'ry']
  let result = svg
  for (const attr of numericAttrs) {
    result = result.replace(
      new RegExp(`\\b${attr}="(-?[\\d.]+)"`, 'g'),
      (_m, val: string) => `${attr}="${(parseFloat(val) * PX_TO_MM).toFixed(2)}"`,
    )
  }
  return result
}

// Collect all pattern types used in the canvas objects
function collectUsedPatternTypes(canvasJSON: { objects: Array<{ 'data-pattern-type'?: string }> }): Set<PatternType> {
  const types = new Set<PatternType>()
  for (const obj of canvasJSON.objects) {
    const pt = obj['data-pattern-type'] as PatternType | undefined
    if (pt) types.add(pt)
  }
  return types
}

export function exportCanvasToSVG(canvas: fabric.Canvas): string {
  // Context7: confirm canvas.toSVG() options for v6 before calling
  const rawSvg: string = canvas.toSVG()

  // Collect pattern types from serialized JSON for defs reconstruction
  const json = canvas.toJSON(['data-braille', 'data-braille-text', 'data-pattern-type']) as {
    objects: Array<{ 'data-pattern-type'?: string }>
  }
  const patternTypes = collectUsedPatternTypes(json)

  let svg = stripFabricAttributes(rawSvg)
  svg = scaleCoordsToMM(svg)

  // Replace Fabric's viewBox with canonical A4 mm viewBox
  svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="0 0 210 297"')

  // Inject correct <defs> with pattern definitions
  const patternDefs = buildPatternDefs(patternTypes)
  if (patternDefs) {
    // Replace existing <defs> or inject before first child
    if (svg.includes('<defs>')) {
      svg = svg.replace('<defs>', `<defs>${patternDefs.slice(6, -7)}`)
    } else {
      svg = svg.replace('<svg', `<svg>\n${patternDefs}\n<svg`.replace('<svg>\n', ''))
      // Simpler: inject after opening <svg ...>
      svg = svg.replace(/(<svg[^>]*>)/, `$1\n${patternDefs}`)
    }
  }

  // Convert braille IText elements back to dot circles
  svg = exportBrailleIText(svg)

  return svg
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/svgExporter.ts
git commit -m "feat(editor): add svgExporter with px-to-mm scaling, pattern defs, braille dot export"
```

---

## Task 7: useEditorHistory.ts

**Files:**
- Create: `src/hooks/useEditorHistory.ts`

> Before writing: query Context7 `query-docs [fabric-id] "canvas events object:modified object:added object:removed"` and `query-docs [fabric-id] "canvas toJSON loadFromJSON async"`.

- [ ] **Step 1: Query Context7 for Fabric.js v6 canvas events and JSON serialization**

```
Context7: query-docs [fabric-id] "canvas on object:modified event"
Context7: query-docs [fabric-id] "canvas toJSON custom properties"
Context7: query-docs [fabric-id] "canvas loadFromJSON Promise"
```

- [ ] **Step 2: Create `src/hooks/useEditorHistory.ts`**

```ts
import { useRef, useState, useCallback, useEffect } from 'react'
import type * as fabric from 'fabric'

const MAX_HISTORY = 20
const CUSTOM_PROPS = ['data-braille', 'data-braille-text', 'data-pattern-type']

export interface UseEditorHistoryResult {
  undo: () => Promise<void>
  redo: () => Promise<void>
  reset: (initialJSON?: object) => void
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

export function useEditorHistory(canvas: fabric.Canvas | null): UseEditorHistoryResult {
  const stackRef = useRef<object[]>([])
  const pointerRef = useRef<number>(-1)
  const initialRef = useRef<string>('')
  const isRestoringRef = useRef(false)
  const [, forceUpdate] = useState(0)

  const snapshot = useCallback(() => {
    if (!canvas || isRestoringRef.current) return
    // Context7: confirm toJSON custom properties syntax for v6
    const json = canvas.toJSON(CUSTOM_PROPS)
    const stack = stackRef.current
    const pointer = pointerRef.current

    // Discard redo history on new action
    stack.splice(pointer + 1)
    stack.push(json)
    if (stack.length > MAX_HISTORY) stack.shift()
    pointerRef.current = stack.length - 1
    forceUpdate(n => n + 1)
  }, [canvas])

  const initSnapshot = useCallback(() => {
    if (!canvas) return
    const json = canvas.toJSON(CUSTOM_PROPS)
    initialRef.current = JSON.stringify(json)
    stackRef.current = [json]
    pointerRef.current = 0
    forceUpdate(n => n + 1)
  }, [canvas])

  useEffect(() => {
    if (!canvas) return
    initSnapshot()
    canvas.on('object:modified', snapshot)
    canvas.on('object:added', snapshot)
    canvas.on('object:removed', snapshot)
    return () => {
      canvas.off('object:modified', snapshot)
      canvas.off('object:added', snapshot)
      canvas.off('object:removed', snapshot)
    }
  }, [canvas, snapshot, initSnapshot])

  const undo = useCallback(async () => {
    if (!canvas || pointerRef.current <= 0) return
    pointerRef.current -= 1
    isRestoringRef.current = true
    // Context7: confirm loadFromJSON async signature for v6
    await canvas.loadFromJSON(stackRef.current[pointerRef.current])
    canvas.renderAll()
    isRestoringRef.current = false
    forceUpdate(n => n + 1)
  }, [canvas])

  const redo = useCallback(async () => {
    if (!canvas || pointerRef.current >= stackRef.current.length - 1) return
    pointerRef.current += 1
    isRestoringRef.current = true
    await canvas.loadFromJSON(stackRef.current[pointerRef.current])
    canvas.renderAll()
    isRestoringRef.current = false
    forceUpdate(n => n + 1)
  }, [canvas])

  const reset = useCallback((initialJSON?: object) => {
    if (!canvas) return
    if (initialJSON) {
      isRestoringRef.current = true
      canvas.loadFromJSON(initialJSON).then(() => {
        canvas.renderAll()
        isRestoringRef.current = false
        initSnapshot()
      })
    } else {
      initSnapshot()
    }
  }, [canvas, initSnapshot])

  const pointer = pointerRef.current
  const stackLen = stackRef.current.length
  const canUndo = pointer > 0
  const canRedo = pointer < stackLen - 1
  const isDirty = stackLen > 0 && JSON.stringify(stackRef.current[pointer]) !== initialRef.current

  return { undo, redo, reset, canUndo, canRedo, isDirty }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEditorHistory.ts
git commit -m "feat(editor): add useEditorHistory with 20-step undo/redo and isDirty tracking"
```

---

## Task 8: EditorToolbar.tsx

**Files:**
- Create: `src/components/editor/EditorToolbar.tsx`

- [ ] **Step 1: Check which shadcn components exist**

```bash
ls src/components/ui/
```
Expected: button.tsx, tabs.tsx exist. If `tooltip.tsx` or `separator.tsx` are missing, add them via MCP shadcn tool.

- [ ] **Step 2: Add missing shadcn Tooltip and Separator if needed**

If `tooltip.tsx` not present:
```
shadcn MCP: add tooltip
```
If `separator.tsx` not present:
```
shadcn MCP: add separator
```

- [ ] **Step 3: Create `src/components/editor/EditorToolbar.tsx`**

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export type EditorTool = 'select' | 'rect' | 'circle' | 'arrow' | 'text'

interface ToolButtonProps {
  tool: EditorTool | 'undo' | 'redo' | 'delete'
  label: string
  shortcut: string
  isActive?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function ToolButton({ label, shortcut, isActive, disabled, onClick, children }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={label}
          aria-pressed={isActive}
          disabled={disabled}
          onClick={onClick}
          className="w-8 h-8 p-0"
          style={{
            background: isActive ? '#18191a' : 'transparent',
            color: isActive ? '#f7f8f8' : '#8a8f98',
            border: isActive ? '1px solid #5e6ad2' : '1px solid transparent',
            borderRadius: 6,
          }}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        style={{ background: '#18191a', border: '1px solid #23252a', color: '#f7f8f8', fontSize: 12 }}
      >
        {label} <span style={{ color: '#8a8f98', marginLeft: 4 }}>{shortcut}</span>
      </TooltipContent>
    </Tooltip>
  )
}

interface EditorToolbarProps {
  activeTool: EditorTool
  canUndo: boolean
  canRedo: boolean
  onToolChange: (tool: EditorTool) => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
}

export function EditorToolbar({
  activeTool,
  canUndo,
  canRedo,
  onToolChange,
  onUndo,
  onRedo,
  onDelete,
}: EditorToolbarProps) {
  return (
    <TooltipProvider delayDuration={400}>
      <div
        className="flex flex-col items-center gap-1 py-3 px-2"
        style={{ background: '#0f1011', borderRight: '1px solid #23252a', width: 48 }}
        role="toolbar"
        aria-label="Editor tools"
      >
        {/* Selection tools */}
        <ToolButton tool="select" label="Select" shortcut="V" isActive={activeTool === 'select'} onClick={() => onToolChange('select')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 3l14 9-7 1-4 7z"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        {/* Shape tools */}
        <ToolButton tool="rect" label="Rectangle" shortcut="R" isActive={activeTool === 'rect'} onClick={() => onToolChange('rect')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18"/>
          </svg>
        </ToolButton>

        <ToolButton tool="circle" label="Circle" shortcut="C" isActive={activeTool === 'circle'} onClick={() => onToolChange('circle')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="9"/>
          </svg>
        </ToolButton>

        <ToolButton tool="arrow" label="Arrow" shortcut="A" isActive={activeTool === 'arrow'} onClick={() => onToolChange('arrow')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12,5 19,12 12,19"/>
          </svg>
        </ToolButton>

        <ToolButton tool="text" label="Text" shortcut="T" isActive={activeTool === 'text'} onClick={() => onToolChange('text')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="4,7 4,4 20,4 20,7"/>
            <line x1="9" y1="20" x2="15" y2="20"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        {/* History */}
        <ToolButton tool="undo" label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={onUndo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9,14 4,9 9,4"/>
            <path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
          </svg>
        </ToolButton>

        <ToolButton tool="redo" label="Redo" shortcut="⌘⇧Z" disabled={!canRedo} onClick={onRedo}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="15,14 20,9 15,4"/>
            <path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
          </svg>
        </ToolButton>

        <Separator style={{ background: '#23252a', margin: '4px 0', width: 24 }} />

        {/* Delete */}
        <ToolButton tool="delete" label="Delete selected" shortcut="⌫" onClick={onDelete}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </ToolButton>
      </div>
    </TooltipProvider>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/EditorToolbar.tsx src/components/ui/tooltip.tsx src/components/ui/separator.tsx 2>/dev/null || git add src/components/editor/EditorToolbar.tsx
git commit -m "feat(editor): add EditorToolbar with tool buttons, keyboard shortcut tooltips, shadcn primitives"
```

---

## Task 9: TexturePicker.tsx

**Files:**
- Create: `src/components/editor/TexturePicker.tsx`

- [ ] **Step 1: Create `src/components/editor/TexturePicker.tsx`**

```tsx
'use client'
import type { PatternType } from '@/lib/patternAdapter'

const PATTERNS: Array<{ type: PatternType; label: string; svgPath: string }> = [
  {
    type: 'none',
    label: 'No fill',
    svgPath: '',
  },
  {
    type: 'diagonal',
    label: 'Diagonal lines',
    svgPath: 'M0,0 L8,8 M-2,6 L6,-2 M2,10 L10,2',
  },
  {
    type: 'horizontal',
    label: 'Horizontal lines',
    svgPath: 'M0,2 L8,2 M0,5 L8,5',
  },
  {
    type: 'vertical',
    label: 'Vertical lines',
    svgPath: 'M2,0 L2,8 M5,0 L5,8',
  },
  {
    type: 'crosshatch',
    label: 'Crosshatch',
    svgPath: 'M0,0 L8,8 M8,0 L0,8 M0,4 L8,4 M4,0 L4,8',
  },
]

interface TexturePickerProps {
  current: PatternType
  onChange: (type: PatternType) => void
}

export function TexturePicker({ current, onChange }: TexturePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11, color: '#62666d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Fill texture
      </span>
      <div className="flex gap-1.5 flex-wrap">
        {PATTERNS.map(({ type, label, svgPath }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            aria-label={label}
            aria-pressed={current === type}
            style={{
              width: 32,
              height: 28,
              borderRadius: 4,
              border: `1px solid ${current === type ? '#5e6ad2' : '#23252a'}`,
              background: '#141516',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {type === 'none' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="2" y="2" width="16" height="16" fill="none" stroke="#3e3e44" strokeWidth="1"/>
                <line x1="2" y1="18" x2="18" y2="2" stroke="#3e3e44" strokeWidth="1"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="1" y="1" width="18" height="18" fill="none" stroke="#3e3e44" strokeWidth="0.5"/>
                <clipPath id={`clip-${type}`}>
                  <rect x="1" y="1" width="18" height="18"/>
                </clipPath>
                <path d={svgPath} fill="none" stroke="#8a8f98" strokeWidth="0.8" clipPath={`url(#clip-${type})`}/>
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/TexturePicker.tsx
git commit -m "feat(editor): add TexturePicker with 5 hatch pattern swatches"
```

---

## Task 10: PropertiesPanel.tsx

**Files:**
- Create: `src/components/editor/PropertiesPanel.tsx`

- [ ] **Step 1: Create `src/components/editor/PropertiesPanel.tsx`**

```tsx
'use client'
import type * as fabric from 'fabric'
import { Button } from '@/components/ui/button'
import { TexturePicker } from './TexturePicker'
import type { PatternType } from '@/lib/patternAdapter'

interface PropertiesPanelProps {
  selectedObject: fabric.FabricObject | null
  onDelete: () => void
  onPatternChange: (type: PatternType) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label style={{ fontSize: 11, color: '#62666d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#141516',
  border: '1px solid #23252a',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 13,
  color: '#f7f8f8',
  width: '100%',
  outline: 'none',
}

export function PropertiesPanel({ selectedObject, onDelete, onPatternChange }: PropertiesPanelProps) {
  if (!selectedObject) {
    return (
      <div
        className="flex items-center justify-center h-full p-4"
        style={{ fontSize: 13, color: '#3e3e44', textAlign: 'center', lineHeight: 1.5 }}
        aria-live="polite"
      >
        Select an element<br />to edit its properties
      </div>
    )
  }

  const isBraille = (selectedObject as fabric.FabricObject & { 'data-braille'?: boolean })['data-braille']
  const isIText = selectedObject.type === 'i-text' || selectedObject.type === 'text'
  const patternType = ((selectedObject as fabric.FabricObject & { 'data-pattern-type'?: string })['data-pattern-type'] ?? 'none') as PatternType

  const x = Math.round((selectedObject.left ?? 0))
  const y = Math.round((selectedObject.top ?? 0))
  const w = Math.round((selectedObject.width ?? 0) * (selectedObject.scaleX ?? 1))
  const h = Math.round((selectedObject.height ?? 0) * (selectedObject.scaleY ?? 1))
  const angle = Math.round(selectedObject.angle ?? 0)
  const strokeWidth = typeof selectedObject.strokeWidth === 'number' ? selectedObject.strokeWidth : 2.5

  function updateProp(key: string, value: number | string) {
    selectedObject?.set(key as keyof fabric.FabricObject, value as never)
    selectedObject?.canvas?.renderAll()
  }

  return (
    <div
      className="flex flex-col gap-3 p-3 overflow-y-auto"
      style={{ width: 200, background: '#0f1011', borderLeft: '1px solid #23252a', height: '100%' }}
      role="complementary"
      aria-label="Element properties"
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: '#8a8f98', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Properties
      </span>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <input
            type="number"
            value={x}
            style={inputStyle}
            aria-label="X position"
            onChange={e => updateProp('left', Number(e.target.value))}
          />
        </Field>
        <Field label="Y">
          <input
            type="number"
            value={y}
            style={inputStyle}
            aria-label="Y position"
            onChange={e => updateProp('top', Number(e.target.value))}
          />
        </Field>
      </div>

      {/* Size (not for IText) */}
      {!isIText && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="W">
            <input type="number" value={w} readOnly style={{ ...inputStyle, color: '#62666d' }} aria-label="Width" />
          </Field>
          <Field label="H">
            <input type="number" value={h} readOnly style={{ ...inputStyle, color: '#62666d' }} aria-label="Height" />
          </Field>
        </div>
      )}

      {/* Rotation */}
      <Field label="Rotate">
        <input
          type="number"
          value={angle}
          style={inputStyle}
          aria-label="Rotation angle in degrees"
          onChange={e => updateProp('angle', Number(e.target.value))}
        />
      </Field>

      {/* Stroke width */}
      {!isIText && (
        <Field label="Stroke width">
          <input
            type="number"
            value={strokeWidth}
            step={0.5}
            min={0}
            style={inputStyle}
            aria-label="Stroke width"
            onChange={e => updateProp('strokeWidth', Number(e.target.value))}
          />
        </Field>
      )}

      {/* Braille IText */}
      {isBraille && (
        <Field label="Braille character">
          <input
            type="text"
            value={(selectedObject as fabric.IText)?.text ?? ''}
            maxLength={20}
            style={inputStyle}
            aria-label="Unicode braille character"
            aria-describedby="braille-note"
            onChange={e => {
              const iText = selectedObject as fabric.IText
              iText.set('text', e.target.value)
              selectedObject.canvas?.renderAll()
            }}
          />
          <span id="braille-note" style={{ fontSize: 10, color: '#62666d', lineHeight: 1.4 }}>
            Dots regenerate on export
          </span>
        </Field>
      )}

      {/* Pattern picker for shapes with fill regions */}
      {!isIText && !isBraille && (
        <TexturePicker current={patternType} onChange={onPatternChange} />
      )}

      {/* Delete */}
      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        aria-label="Delete selected element"
        className="w-full mt-auto"
        style={{ background: '#2a1515', color: '#e07070', border: '1px solid #4a2020', borderRadius: 6, fontSize: 13 }}
      >
        Delete
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/PropertiesPanel.tsx
git commit -m "feat(editor): add PropertiesPanel with position, rotation, stroke, braille, texture controls"
```

---

## Task 11: PageNav.tsx

**Files:**
- Create: `src/components/editor/PageNav.tsx`

- [ ] **Step 1: Create `src/components/editor/PageNav.tsx`**

```tsx
'use client'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PageNavProps {
  pages: string[]
  currentPage: number
  dirtyPages: Set<number>
  onPageChange: (index: number) => void
}

function pageLabel(index: number, total: number): string {
  if (index === 0) return 'Reference'
  if (total <= 2) return 'Diagram'
  return `Diagram ${index}`
}

export function PageNav({ pages, currentPage, dirtyPages, onPageChange }: PageNavProps) {
  if (pages.length <= 1) return null

  return (
    <div
      style={{
        borderTop: '1px solid #23252a',
        background: '#0f1011',
        padding: '0 16px',
      }}
      role="navigation"
      aria-label="Diagram pages"
    >
      <Tabs
        value={String(currentPage)}
        onValueChange={v => onPageChange(Number(v))}
      >
        <TabsList
          className="h-auto gap-0 rounded-none"
          style={{ background: 'transparent', borderBottom: 'none', padding: '0' }}
        >
          {pages.map((_, i) => (
            <TabsTrigger
              key={i}
              value={String(i)}
              className="relative h-auto rounded-none"
              style={{
                fontSize: 13,
                fontWeight: currentPage === i ? 500 : 400,
                padding: '10px 14px',
                color: currentPage === i ? '#f7f8f8' : '#62666d',
                borderBottom: currentPage === i ? '2px solid #5e6ad2' : '2px solid transparent',
                background: 'transparent',
                cursor: 'pointer',
              }}
              aria-label={`${pageLabel(i, pages.length)} page${dirtyPages.has(i) ? ', has unsaved changes' : ''}`}
            >
              {pageLabel(i, pages.length)}
              {dirtyPages.has(i) && (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#5e6ad2',
                    marginLeft: 6,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/PageNav.tsx
git commit -m "feat(editor): add PageNav with shadcn Tabs, unsaved-change dot indicator"
```

---

## Task 12: EditorCanvas.tsx

**Files:**
- Create: `src/components/editor/EditorCanvas.tsx`

> Before writing: query Context7 for Fabric.js v6:
> - `canvas.isDrawingMode`, `canvas.freeDrawingBrush`
> - `canvas.on('selection:created')`, `canvas.on('selection:updated')`, `canvas.on('selection:cleared')`
> - `canvas.dispose()` cleanup
> - `useImperativeHandle` pattern with Fabric canvas refs

- [ ] **Step 1: Query Context7 for EditorCanvas APIs**

```
Context7: query-docs [fabric-id] "isDrawingMode freeDrawingBrush"
Context7: query-docs [fabric-id] "selection:created selection:cleared events"
Context7: query-docs [fabric-id] "canvas dispose"
Context7: query-docs [fabric-id] "Rect Circle add canvas programmatic"
```

- [ ] **Step 2: Create `src/components/editor/EditorCanvas.tsx`**

```tsx
'use client'
import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react'
import type * as FabricType from 'fabric'
import { loadSVGToCanvas } from '@/lib/svgLoader'
import { exportCanvasToSVG } from '@/lib/svgExporter'
import { useEditorHistory } from '@/hooks/useEditorHistory'
import { applyPattern, type PatternType } from '@/lib/patternAdapter'
import type { EditorTool } from './EditorToolbar'

export interface EditorCanvasHandle {
  exportSVG: () => string
  revert: (svgString: string) => Promise<void>
  deleteSelected: () => void
  applyPatternToSelected: (type: PatternType) => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
}

interface EditorCanvasProps {
  svgString: string
  activeTool: EditorTool
  isVisible: boolean
  onSelectionChange: (obj: FabricType.FabricObject | null) => void
  onHistoryChange: () => void
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas({ svgString, activeTool, isVisible, onSelectionChange, onHistoryChange }, ref) {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasElRef = useRef<HTMLCanvasElement>(null)
    const fabricRef = useRef<FabricType.Canvas | null>(null)
    const fabricModuleRef = useRef<typeof FabricType | null>(null)
    const activeToolRef = useRef(activeTool)
    activeToolRef.current = activeTool

    const history = useEditorHistory(fabricRef.current)

    // Keyboard shortcuts
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (!isVisible) return
        const isMeta = e.metaKey || e.ctrlKey
        if (isMeta && e.shiftKey && e.key === 'z') { e.preventDefault(); history.undo() }
        else if (isMeta && e.key === 'z') { e.preventDefault(); history.undo() }
        else if (e.key === 'Delete' || e.key === 'Backspace') {
          const active = fabricRef.current?.getActiveObject()
          if (active && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
            fabricRef.current?.remove(active)
            fabricRef.current?.renderAll()
          }
        }
      }
      window.addEventListener('keydown', handler)
      return () => window.removeEventListener('keydown', handler)
    }, [isVisible, history])

    // Mount Fabric canvas
    useEffect(() => {
      if (!canvasElRef.current) return
      let disposed = false

      ;(async () => {
        // Context7: import fabric dynamically to avoid SSR issues
        const fabric = await import('fabric')
        fabricModuleRef.current = fabric
        if (disposed || !canvasElRef.current) return

        const canvas = await loadSVGToCanvas(canvasElRef.current, svgString)
        if (disposed) { canvas.dispose(); return }
        fabricRef.current = canvas

        // Context7: confirm selection event names for v6
        const handleSelection = () => {
          const obj = canvas.getActiveObject() ?? null
          onSelectionChange(obj)
          onHistoryChange()
        }
        canvas.on('selection:created', handleSelection)
        canvas.on('selection:updated', handleSelection)
        canvas.on('selection:cleared', () => { onSelectionChange(null); onHistoryChange() })
        canvas.on('object:modified', onHistoryChange)
        canvas.on('object:added', onHistoryChange)
        canvas.on('object:removed', onHistoryChange)
      })()

      return () => {
        disposed = true
        fabricRef.current?.dispose()
        fabricRef.current = null
      }
      // svgString only changes on revert — handled separately
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Tool change
    useEffect(() => {
      const canvas = fabricRef.current
      const fabric = fabricModuleRef.current
      if (!canvas || !fabric) return

      // Context7: confirm drawing mode API for v6
      canvas.isDrawingMode = false
      canvas.selection = true

      switch (activeTool) {
        case 'select':
          break
        case 'rect':
          // Add rect on next click — handled via mouse:down
          break
        case 'circle':
          break
        case 'arrow':
          break
        case 'text':
          break
      }
    }, [activeTool])

    // Click-to-add shapes
    useEffect(() => {
      const canvas = fabricRef.current
      const fabric = fabricModuleRef.current
      if (!canvas || !fabric) return

      const handleMouseDown = (opt: FabricType.TEvent) => {
        if (activeToolRef.current === 'select') return
        const pointer = canvas.getViewportPoint(opt.e as MouseEvent)

        let newObj: FabricType.FabricObject | null = null
        switch (activeToolRef.current) {
          case 'rect':
            // Context7: confirm Rect constructor for v6
            newObj = new fabric.Rect({ left: pointer.x, top: pointer.y, width: 60, height: 40 })
            break
          case 'circle':
            newObj = new fabric.Circle({ left: pointer.x, top: pointer.y, radius: 30 })
            break
          case 'arrow':
            newObj = new fabric.Line([pointer.x, pointer.y, pointer.x + 80, pointer.y])
            break
          case 'text':
            newObj = new fabric.IText('Text', { left: pointer.x, top: pointer.y, fontSize: 14, fill: '#000000' })
            break
        }
        if (newObj) {
          canvas.add(newObj)
          canvas.setActiveObject(newObj)
          canvas.renderAll()
        }
      }

      canvas.on('mouse:down', handleMouseDown)
      return () => { canvas.off('mouse:down', handleMouseDown) }
    }, [])

    useImperativeHandle(ref, () => ({
      exportSVG: () => {
        if (!fabricRef.current) return ''
        return exportCanvasToSVG(fabricRef.current)
      },
      revert: async (newSvgString: string) => {
        const canvas = fabricRef.current
        const canvasEl = canvasElRef.current
        if (!canvas || !canvasEl) return
        canvas.dispose()
        const fabric = fabricModuleRef.current!
        fabricRef.current = await loadSVGToCanvas(canvasEl, newSvgString)
        history.reset()
      },
      deleteSelected: () => {
        const canvas = fabricRef.current
        const active = canvas?.getActiveObject()
        if (active) { canvas?.remove(active); canvas?.renderAll() }
      },
      applyPatternToSelected: async (type: PatternType) => {
        const canvas = fabricRef.current
        const fabric = fabricModuleRef.current
        const active = canvas?.getActiveObject()
        if (!canvas || !fabric || !active) return
        await applyPattern(fabric, active, type, canvas)
      },
      undo: history.undo,
      redo: history.redo,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      isDirty: history.isDirty,
    }), [history])

    return (
      <div
        ref={wrapperRef}
        style={{ display: isVisible ? 'flex' : 'none', flex: 1, overflow: 'auto', background: '#010102', justifyContent: 'center', alignItems: 'flex-start', padding: 24 }}
        role="application"
        aria-label="Tactile diagram editor"
      >
        <div style={{ boxShadow: '0 0 0 1px #23252a', background: '#ffffff' }}>
          <canvas ref={canvasElRef} />
        </div>
      </div>
    )
  }
)
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx src/hooks/useEditorHistory.ts
git commit -m "feat(editor): add EditorCanvas with Fabric.js canvas, tool modes, keyboard shortcuts, undo/redo"
```

---

## Task 13: TactileEditor.tsx

**Files:**
- Create: `src/components/editor/TactileEditor.tsx`

- [ ] **Step 1: Create `src/components/editor/TactileEditor.tsx`**

```tsx
'use client'
import { useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { EditorCanvas, type EditorCanvasHandle } from './EditorCanvas'
import { EditorToolbar, type EditorTool } from './EditorToolbar'
import { PageNav } from './PageNav'
import { PropertiesPanel } from './PropertiesPanel'
import type * as FabricType from 'fabric'
import type { PatternType } from '@/lib/patternAdapter'
import { extractSpeechScript } from '@/lib/speechScript'

interface TactileEditorProps {
  pages: string[]
  onDone: (result: { pages: string[]; speechScript: string | null }) => void
  onCancel: () => void
}

export function TactileEditor({ pages, onDone, onCancel }: TactileEditorProps) {
  const originalPages = useRef<string[]>([...pages])
  const [currentPage, setCurrentPage] = useState(0)
  const [activeTool, setActiveTool] = useState<EditorTool>('select')
  const [selectedObject, setSelectedObject] = useState<FabricType.FabricObject | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [dirtyPages, setDirtyPages] = useState<Set<number>>(new Set())

  // One ref per page
  const canvasRefs = useRef<Array<EditorCanvasHandle | null>>(pages.map(() => null))

  const handleHistoryChange = useCallback(() => {
    setHistoryVersion(v => v + 1)
    // Update dirty set based on each canvas isDirty
    setDirtyPages(prev => {
      const next = new Set(prev)
      canvasRefs.current.forEach((c, i) => {
        if (c?.isDirty) next.add(i)
        else next.delete(i)
      })
      return next
    })
  }, [])

  const handleRevert = useCallback(() => {
    canvasRefs.current.forEach((c, i) => {
      c?.revert(originalPages.current[i])
    })
    setDirtyPages(new Set())
    setSelectedObject(null)
  }, [])

  const handleDone = useCallback(() => {
    const exportedPages = canvasRefs.current.map((c, i) => {
      return c ? c.exportSVG() : pages[i]
    })
    const speechScript = exportedPages[0] ? extractSpeechScript(exportedPages[0]) : null
    onDone({ pages: exportedPages, speechScript })
  }, [pages, onDone])

  const activeCanvas = canvasRefs.current[currentPage]
  const canUndo = activeCanvas?.canUndo ?? false
  const canRedo = activeCanvas?.canRedo ?? false

  return (
    <AnimatePresence>
      <motion.div
        key="tactile-editor"
        className="fixed inset-0 z-50 flex flex-col"
        style={{ background: '#010102' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Topbar */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: '#0f1011', borderBottom: '1px solid #23252a', height: 52 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            aria-label="Back to results without saving"
            style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6 }}
          >
            Back
          </Button>

          <span style={{ fontSize: 14, fontWeight: 500, color: '#f7f8f8', letterSpacing: '-0.2px' }}>
            Edit tactile diagram
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRevert}
              aria-label="Revert all pages to original Claude output"
              style={{ color: '#8a8f98', fontSize: 13, background: 'transparent', border: '1px solid #23252a', borderRadius: 6 }}
            >
              Revert
            </Button>
            <Button
              size="sm"
              onClick={handleDone}
              aria-label="Save changes and return to results"
              style={{ background: '#5e6ad2', color: '#ffffff', fontSize: 13, borderRadius: 6, border: 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#828fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#5e6ad2' }}
            >
              Done
            </Button>
          </div>
        </div>

        {/* Body: toolbar + canvases + properties panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left toolbar */}
          <EditorToolbar
            activeTool={activeTool}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolChange={setActiveTool}
            onUndo={() => activeCanvas?.undo()}
            onRedo={() => activeCanvas?.redo()}
            onDelete={() => activeCanvas?.deleteSelected()}
          />

          {/* Canvas area — all pages rendered, only current visible */}
          <div className="flex-1 flex overflow-hidden relative">
            {pages.map((svgString, i) => (
              <EditorCanvas
                key={i}
                ref={el => { canvasRefs.current[i] = el }}
                svgString={svgString}
                activeTool={activeTool}
                isVisible={i === currentPage}
                onSelectionChange={setSelectedObject}
                onHistoryChange={handleHistoryChange}
              />
            ))}
          </div>

          {/* Right properties panel */}
          <PropertiesPanel
            selectedObject={selectedObject}
            onDelete={() => activeCanvas?.deleteSelected()}
            onPatternChange={(type: PatternType) => activeCanvas?.applyPatternToSelected(type)}
          />
        </div>

        {/* Page navigation */}
        <PageNav
          pages={pages}
          currentPage={currentPage}
          dirtyPages={dirtyPages}
          onPageChange={index => { setCurrentPage(index); setSelectedObject(null) }}
        />
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/TactileEditor.tsx
git commit -m "feat(editor): add TactileEditor root shell with topbar, page navigation, and canvas/panel layout"
```

---

## Task 14: Wire TactileEditor into page.tsx and TactileSVG

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/output/TactileSVG.tsx`

- [ ] **Step 1: Update TactileSVG to accept pages prop and emit onEditRequest**

In `src/components/output/TactileSVG.tsx`, update the `TactileSVGProps` interface:
```ts
interface TactileSVGProps {
  analysis: DiagramAnalysis
  imageBase64?: string
  imageMimeType?: string
  pages?: string[]                          // post-edit pages override
  onEditRequest?: (pages: string[]) => void // fires when Edit button clicked
}
```

Update the component signature:
```tsx
export function TactileSVG({ analysis, imageBase64, imageMimeType, pages: pagesProp, onEditRequest }: TactileSVGProps) {
```

Add `pagesProp` to the existing `pages` state initialization — after the `setPages([])` call in the `useEffect`, add a guard: if `pagesProp` is provided, skip the fetch and use `pagesProp` directly:

Replace the opening of the `useEffect` (lines 38–50 approximately):
```tsx
useEffect(() => {
  // If post-edit pages are provided, display them directly without fetching
  if (pagesProp && pagesProp.length > 0) {
    setPages(pagesProp)
    setIsStreaming(false)
    setStreamingPageIndex(null)
    setError(null)
    setTruncated(false)
    return
  }

  let mounted = true
  setPages([])
  // ... rest of existing effect unchanged ...
}, [imageBase64, imageMimeType, pagesProp])
```

Add "Edit tactile diagram" button after the Download button (end of the return JSX):
```tsx
{onEditRequest && isReady && (
  <button
    onClick={() => onEditRequest(pages)}
    aria-label="Edit tactile diagram before printing"
    className="w-full flex items-center justify-center gap-2 font-medium transition-colors"
    style={{
      background: 'transparent',
      color: '#8a8f98',
      borderRadius: 8,
      padding: '10px 16px',
      fontSize: 15,
      border: '1px solid #23252a',
      cursor: 'pointer',
      marginTop: 4,
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#5e6ad2'; (e.currentTarget as HTMLButtonElement).style.color = '#f7f8f8' }}
    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#23252a'; (e.currentTarget as HTMLButtonElement).style.color = '#8a8f98' }}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    Edit tactile diagram
  </button>
)}
```

- [ ] **Step 2: Wire TactileEditor into page.tsx**

At the top of `src/app/page.tsx`, add the import:
```tsx
import { TactileEditor } from '@/components/editor/TactileEditor'
```

Replace the placeholder editing state block (added in Task 2 Step 3) with:
```tsx
{/* ── EDITING ── */}
{appState === 'editing' && (
  <TactileEditor
    key="editing"
    pages={tactilePages}
    onDone={handleEditorDone}
    onCancel={handleEditorCancel}
  />
)}
```

Update the `<TactileSVG>` render in the results section to pass the new props:
```tsx
<TactileSVG
  analysis={analysis}
  imageBase64={image?.base64}
  imageMimeType={image?.mimeType}
  pages={tactilePages.length > 0 ? tactilePages : undefined}
  onEditRequest={handleEditRequest}
/>
```

- [ ] **Step 3: Verify TypeScript compiles with zero errors**

```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass (speechScript + brailleAdapter + braille)

- [ ] **Step 5: Start dev server and test the editor flow**

```bash
npm run dev
```

Manual test checklist:
1. Upload a diagram → wait for results → Tactile/braille tab appears
2. "Edit tactile diagram" button is visible when SVG is ready
3. Clicking it transitions to full-screen editor with `opacity: 0 → 1` animation
4. Back button returns to results without changes
5. At least one canvas renders with a white A4 page visible
6. Select tool (V) can click and move an element
7. Rect tool (R) adds a new rectangle on click
8. Undo (Cmd+Z) reverts the addition
9. Revert restores original
10. Done exports and returns to results state

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/output/TactileSVG.tsx
git commit -m "feat(editor): wire TactileEditor into page.tsx state machine and TactileSVG edit button"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `AppState` extended with `'editing'` — Task 2
- [x] `TactileEditor` pure component with `pages`, `onDone`, `onCancel` props — Task 13
- [x] `originalPages` useRef freeze + Revert — Task 13
- [x] `EditorCanvas` with `exportSVG()` and `revert()` via `useImperativeHandle` — Task 12
- [x] `EditorToolbar` with Select/Rect/Circle/Arrow/Text/Undo/Redo/Delete — Task 8
- [x] Keyboard shortcuts (V, R, C, A, T, Cmd+Z, Cmd+Shift+Z, Delete) — Task 12
- [x] `PageNav` with Reference | Diagram N tabs + dirty dot indicator — Task 11
- [x] `PropertiesPanel` context-sensitive sidebar — Task 10
- [x] `TexturePicker` with 5 pattern swatches — Task 9
- [x] `svgLoader.ts` with mm→px scale + braille adapter + pattern adapter — Task 5
- [x] `svgExporter.ts` with px→mm inverse scale + clean SVG output — Task 6
- [x] `brailleAdapter.ts` cluster collapse on load + dot regeneration on export — Task 3
- [x] `patternAdapter.ts` pattern classification + fabric.Pattern creation + export defs — Task 4
- [x] `useEditorHistory.ts` 20-step undo/redo + isDirty — Task 7
- [x] `speechScript.ts` extracted from route — Task 1
- [x] `useNarration` optional speechScript override — Task 2
- [x] BANA tactile defaults on teacher-drawn shapes — Task 5 (svgLoader `object:added`)
- [x] Fabric selection color #5e6ad2 — Task 5 (applySelectionDefaults)
- [x] Motion AnimatePresence for editor enter/exit — Task 13
- [x] All ARIA labels, role="application", role="toolbar" — Tasks 8, 11, 12, 13
- [x] Design system colors (canvas #010102, surface-1 #0f1011, primary #5e6ad2) — all tasks

**Out of scope (per spec):**
- `spacingGuard.ts` — nice-to-have, excluded
- `labelManager.ts` — nice-to-have, excluded
- Bezier path point editing — excluded
- Individual braille dot position editing — excluded
