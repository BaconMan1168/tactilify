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

function parseBrailleDots(svg: string): DotCircle[] {
  const dots: DotCircle[] = []
  const re = /<circle\b([^>]*)\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(svg)) !== null) {
    const attrs = m[1]
    const r = parseFloat(/\br="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    const fill = /\bfill="([^"]*)"/.exec(attrs)?.[1] ?? ''
    const style = /\bstyle="([^"]*)"/.exec(attrs)?.[1] ?? ''
    if (Math.abs(r - BRAILLE_DOT_R) > BRAILLE_DOT_R_TOL) continue
    if (fill !== '#000000' && !/fill:\s*(#000000|rgb\(0,0,0\))/.test(style)) continue
    const cx = parseFloat(/\bcx="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    const cy = parseFloat(/\bcy="([^"]*)"/.exec(attrs)?.[1] ?? 'NaN')
    if (isNaN(cx) || isNaN(cy)) continue
    dots.push({ cx, cy })
  }
  return dots
}

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

export function extractBrailleClusterData(svg: string): { svg: string; clusters: BrailleCluster[] } {
  const clusters = findBrailleClusters(svg)
  if (!clusters.length) return { svg, clusters: [] }

  const dotCircleRe = /<circle\b(?=[^>]*r="0\.7")(?=[^>]*(?:fill="#000000"|style="[^"]*fill:\s*(?:#000000|rgb\(0,0,0\))[^"]*"))[^>]*\/?>/g
  const stripped = svg.replace(dotCircleRe, '')

  return { svg: stripped, clusters }
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

// Converts text labels to braille circles.
// Reference page: everything from the KEY header onward is converted (letter IDs + full labels).
// Diagram pages: only single uppercase letter markers are converted.
export function applyBraillePostProcessing(svg: string, isReferencePage: boolean): string {
  const isSingleLetter = (c: string) => /^[A-Z]$/.test(c)

  if (isReferencePage) {
    const keyMatch = /<text\b[^>]*>\s*KEY\s*<\/text>/i.exec(svg)
    if (keyMatch) {
      const before = svg.slice(0, keyMatch.index)
      const keySection = svg.slice(keyMatch.index)
      return before + replaceTextWithBraille(keySection, () => true)
    }
    return svg
  }
  return replaceTextWithBraille(svg, isSingleLetter)
}

export function exportBrailleIText(svg: string): string {
  return svg.replace(
    /<text\b([^>]*data-braille="true"[^>]*)>([^<]*)<\/text>/g,
    (_match, attrs: string, unicode: string) => {
      const xVal = /\bx="([^"]*)"/.exec(attrs)?.[1]
      const yVal = /\by="([^"]*)"/.exec(attrs)?.[1]
      if (!xVal || !yVal) return ''
      const x = parseFloat(xVal)
      const y = parseFloat(yVal)
      if (isNaN(x) || isNaN(y)) return ''

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
  const escaped = text.replace(/"/g, '&quot;')
  return `<g data-braille-source="${escaped}" data-type="braille-label">${circles.join('')}</g>`
}
