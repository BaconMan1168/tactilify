import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { encodeBraille } from '@/lib/braille'

const MODEL = 'claude-sonnet-4-6'

const PROMPT = `Generate a multi-page tactile diagram of this image for blind or low-vision students to read by touch on swell/capsule/embossed paper.

Primary goal:
Create a tactile-readable educational diagram, not a visually faithful replica. Preserve the core educational meaning, spatial relationships, and essential structures, simplifying only when needed for tactile clarity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Output one SVG document per page, separated by the exact delimiter: <<<PAGE_BREAK>>>

No markdown, no code fences, no explanation — only SVG markup and <<<PAGE_BREAK>>> delimiters.

Every SVG must:
* Use viewBox="0 0 210 297" (A4 portrait, units = millimeters)
* Begin with a white background: <rect width="210" height="297" fill="#ffffff"/>
* Use black only (#000000) — no color, no gradients, no opacity, no filters
* Contain no raster images, external fonts, scripts, or animation

Page order:
1. Reference page (always first) — text only: title, description, exploration guide, key
2. Diagram page(s) — one or more pages containing the tactile drawing
3. Key continuation page(s) — only if the key overflows the reference page

Emit as many pages as needed. There is no maximum. Add a <<<PAGE_BREAK>>> between every consecutive pair of pages.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE 1 — REFERENCE PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Layout top-to-bottom (all x between 15mm and 195mm):

TITLE (y starts at 15mm)
  Bold, centered text. The diagram's name.
  After the title block, draw a full-width separator line:
  <line x1="15" y1="[titleBottom+2]" x2="195" y2="[titleBottom+2]" stroke="#000000" stroke-width="0.3"/>

SHORT DESCRIPTION (starts 4mm below separator)
  Plain text. Describes what the diagram shows. Be succinct; match length to diagram complexity.
  After the description block, draw a separator line at [descBottom+2].

EXPLORATION GUIDE (starts 4mm below separator)
  Plain text. Tactile navigation instructions referencing the letter labels. For each element, state: (1) where the element is in the diagram (e.g. "top-left", "center", "right side"), and (2) which direction its letter label is placed relative to the element (e.g. "label A is above it", "label B is to its right"). This tells tactile readers both where to navigate to the element and where to feel for its braille marker.
  Example: "Start at the battery on the left — label A is above the battery. Trace right along the top wire to the resistor at the top center — label B is to its right. The lightbulb is on the right side — label C is to its right."
  Be succinct; match length to diagram complexity.
  After the exploration guide block, draw a separator line at [guideBottom+2].

KEY (starts 4mm below separator)
  Header: "KEY" in bold.
  One row per labeled element, in letter order (A, B, C…):
    [letter]  [texture swatch]  [element name]

  Texture swatch: an 8mm × 6mm <rect> using the exact same fill="url(#pattern-id)" as that element in the diagram. If the element has no texture, the swatch is an empty outlined rect (stroke="#000000", fill="none"). Define all <pattern> elements in a <defs> block at the top of this SVG — use the same pattern IDs as in the diagram SVG(s).

  Key row vertical alignment — all three elements share a single rowCenterY:
    <rect y="[rowCenterY - 3]" height="6" .../> (centers the 6mm rect on rowCenterY)
    <text y="[rowCenterY + 1.5]" ...>A</text> (baseline offset for ~4mm cap-height)
    <text y="[rowCenterY + 1.5]" ...>label text</text>
  Never compute y independently for each element in the same row.

  Element name format — never repeat the same information twice:
    type, identifier (only if distinct from type), value (if present)
    Examples:
      "9V Battery" with value "9V"  →  battery, 9V
      "Resistor R1" with value "100Ω"  →  resistor, r1, 100Ω
      "Nucleus" with no value  →  nucleus

  After the last key row, draw a separator line at [keyBottom+2].

  If all key entries do not fit on this page, continue them on key continuation page(s) titled "[Diagram name] (key continued)".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAGE 2+ — DIAGRAM PAGE(S)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each diagram page:

TITLE (y starts at 15mm, bold, centered)
  Draw a separator line at [titleBottom+2].

DIAGRAM (starts 4mm below separator, fills remaining page to y=282mm)
  All structural elements must stay within x: 15–195mm, y: [diagramTop]–282mm.

Keyed labels:
  Place a single uppercase letter (A, B, C…) directly adjacent (3–6mm) outside each element's boundary per BANA tactile graphics standards. The letter's bounding box must not intersect the element's own bounding box at any point — for a circle of radius R centered at (cx, cy), the letter center must be at distance > R + 3mm from (cx, cy). Never place a label inside the element it labels, even if that element has interior empty space.
  For the outermost boundary element, place its letter outside the boundary.
  No full-word labels anywhere in the diagram area.
  The 14mm × 12mm reserved zone around each letter must fall entirely within a blank (non-textured) area or outside the diagram boundary. If no blank area is available, draw a white filled <rect width="7" height="7"/> behind the letter before placing the <text>.
  If an element is too small for an adjacent letter without ambiguity, a short lead line (10–15mm max) from the letter to the element is acceptable. Lead lines must be straight and must not cross each other. A lead line must start exactly at the element's boundary (x1/y1 touching the shape edge) and end exactly at the letter's nearest edge (x2/y2 touching the letter bounding box) — a floating line that touches neither endpoint is invalid.

If the diagram is too complex to fit clearly on one page, split it across multiple diagram pages, each with its own title (e.g. "Animal Cell (diagram 1 of 2)").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TACTILE DESIGN RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Simplification:
* Omit decorative, redundant, or nonessential details
* Slightly enlarge, separate, or regularize shapes so they can be distinguished by touch
* Maintain at least 3mm of blank space between adjacent tactile elements

Stroke widths:
* Primary shapes: ~2.5mm stroke
* Secondary/connective lines: ~1.5mm stroke
* Avoid very thin or tightly packed details that blur together by touch

Overlap:
* Structurally independent elements must not overlap or intersect each other
* Topologically connected elements (wire terminating at a component, field line originating from a charge, shell containing a nucleus) may touch but must not have their interiors pass through an unrelated element's interior

Textures:
* Textures serve ONE purpose only: tactile differentiation of spatial fill REGIONS — enclosed areas whose identity comes from what material or space they represent (e.g. a cell organelle, a material cross-section layer, a geographic zone). Never use texture to indicate the function or type of a discrete labeled component (a resistor, capacitor, gear, atom, symbol, etc.) — a component's identity comes from its outline shape and its letter label, not its fill.
* Leave the outermost container region blank (white, no texture) — texture only inner fill regions that would be indistinguishable from each other without it
* A region that contains other textured structures must itself be blank — if any child structure has texture, the parent region must not
* Never texture a large background fill region (cytoplasm, stroma, matrix, cytosol, etc.) — leave it blank unless it is the only named structure on the page
* If two adjacent or nested regions would both receive texture, remove the texture from the larger/outer one; only the smaller, more discrete region keeps texture
* Each region type gets at most ONE texture; no two region types share the same texture; limit 3 distinct textures total
* Implement every texture as a <pattern> in <defs>, applied via fill="url(#id)" — never hand-draw individual dots, lines, or hatches as child elements
* Dot and circle patterns are FORBIDDEN as fill textures — they are indistinguishable by touch from braille. Every texture must be line-based: use horizontal lines, vertical lines, diagonal lines (45° or 135°), or crosshatch. The repeating element in any pattern must be a <line> or <path>, never a <circle>
* Use patternUnits="userSpaceOnUse" with a fixed tile size; lines must be evenly spaced
* Pattern fill is clipped to the shape automatically when applied as fill — ensure no texture bleeds outside
* Do not replicate decorative marks from the source image
* Never apply texture to a discrete component, regardless of whether its outline is open or closed — components must use stroke-only drawing (fill="none"); a closed outline shape representing a component (e.g. a rectangle standing in for a circuit element) must have a blank interior, never a pattern fill

Arrows and connectors:
* Use arrows only when direction or flow is conceptually important — not for labeling
* Connector lines must be straight; avoid curves through textured areas

STEM adaptation:
* Preserve the concept being taught, not every visual detail
* Preserve topology: containment, adjacency, sequence, direction, grouping, relative position
* For charts: preserve axes, trends, data relationships; omit decorative gridlines
* For process diagrams: preserve sequence and direction clearly
* For geometry/math: preserve mathematical relationships and essential labels`

// ── Braille post-processing ───────────────────────────────────────────────────

const BRAILLE_DOT_R = 0.7
const BRAILLE_CELL_W = 6.0
const BRAILLE_DOT_OFFSETS = [
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
      for (const { bit, dx, dy } of BRAILLE_DOT_OFFSETS) {
        if (bits & bit) {
          circles.push(`<circle cx="${f(curX + dx)}" cy="${f(y + dy)}" r="${BRAILLE_DOT_R}" fill="#000000"/>`)
        }
      }
    }
    curX += BRAILLE_CELL_W
  }
  return `<g>${circles.join('')}</g>`
}

function replaceTextWithBraille(
  svg: string,
  predicate: (content: string) => boolean,
  yOffset = -5,
): string {
  return svg.replace(/<text\b([^>]*)>([^<]*)<\/text>/g, (match, attrs: string, content: string) => {
    const trimmed = content.trim()
    if (!trimmed || !predicate(trimmed)) return match
    const xVal = /\bx="([^"]*)"/.exec(attrs)?.[1]
    const yVal = /\by="([^"]*)"/.exec(attrs)?.[1]
    if (!xVal || !yVal) return match
    const x = parseFloat(xVal)
    const y = parseFloat(yVal) + yOffset
    if (isNaN(x) || isNaN(y)) return match
    return textToBrailleCircles(trimmed, x, y)
  })
}

function applyBraillePostProcessing(svg: string, isReferencePage: boolean): string {
  if (isReferencePage) {
    // Convert all text in the KEY section (from the KEY header onwards) to Braille
    const keyMatch = /<text\b[^>]*>\s*KEY\s*<\/text>/i.exec(svg)
    if (keyMatch) {
      const before = svg.slice(0, keyMatch.index)
      const keySection = svg.slice(keyMatch.index)
      return before + replaceTextWithBraille(keySection, (c) => c.length > 0)
    }
    return svg
  }
  // Diagram pages: replace single uppercase letter markers with Braille
  return replaceTextWithBraille(svg, (c) => /^[A-Z]$/.test(c))
}

// ─────────────────────────────────────────────────────────────────────────────

type ClaudeMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const ALLOWED_MEDIA = new Set<string>(['image/jpeg', 'image/png', 'image/webp'])

const PAGE_BREAK = '<<<PAGE_BREAK>>>'

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

    const svgPages = textBlock.text
      .split(PAGE_BREAK)
      .map((s) => s.trim())
      .filter((s) => s.startsWith('<'))
      .map((s, i) => applyBraillePostProcessing(s, i === 0))

    if (svgPages.length === 0) {
      return NextResponse.json({ error: 'No valid SVG pages returned from model' }, { status: 500 })
    }

    return NextResponse.json({ svgPages })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    console.error('[llm-tactile] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
