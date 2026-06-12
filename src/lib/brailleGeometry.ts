import { encodeBraille } from './braille'

const CELL_W = 6.0   // mm per braille character
const DOT_R  = 0.7   // mm — matches brailleAdapter
const LINE_H = 10.0  // mm per line (cell 5mm + 5mm gap)

const DOT_OFFSETS = [
  { bit: 0x01, dx: 0,   dy: 0   },
  { bit: 0x02, dx: 0,   dy: 2.5 },
  { bit: 0x04, dx: 0,   dy: 5.0 },
  { bit: 0x08, dx: 2.5, dy: 0   },
  { bit: 0x10, dx: 2.5, dy: 2.5 },
  { bit: 0x20, dx: 2.5, dy: 5.0 },
] as const

function f(v: number): string { return v.toFixed(1) }

function wrapWords(text: string, maxWidthMm: number): string[] {
  const words = text.trim().split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const proposed = current ? `${current} ${word}` : word
    if (proposed.length * CELL_W > maxWidthMm && current) {
      lines.push(current)
      current = word
    } else {
      current = proposed
    }
  }
  if (current) lines.push(current)
  return lines
}

function lineToCircles(line: string, x: number, y: number): string[] {
  const brailleStr = encodeBraille(line)
  const circles: string[] = []
  let curX = x
  for (const ch of brailleStr) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x2800 && cp <= 0x28FF) {
      const bits = cp - 0x2800
      for (const { bit, dx, dy } of DOT_OFFSETS) {
        if (bits & bit) {
          circles.push(`<circle cx="${f(curX + dx)}" cy="${f(y + dy)}" r="${DOT_R}" fill="#000000"/>`)
        }
      }
    }
    curX += CELL_W
  }
  return circles
}

/** Renders English text as a braille dot `<g>` SVG string, auto-wrapping at maxWidthMm. */
export function renderBrailleGroupSvg(text: string, x: number, y: number, maxWidthMm: number): string {
  const trimmed = text.trim()
  const lines = wrapWords(trimmed, maxWidthMm)
  const circles: string[] = []
  lines.forEach((line, i) => {
    circles.push(...lineToCircles(line, x, y + i * LINE_H))
  })
  const escaped = trimmed.replace(/"/g, '&quot;')
  return `<g data-braille-source="${escaped}" data-type="braille-label">${circles.join('')}</g>`
}

/** Returns Unicode braille preview lines for the given English text (for the composer panel). */
export function braillePreviewLines(text: string, maxWidthMm = 160): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return wrapWords(trimmed, maxWidthMm).map(w => encodeBraille(w))
}
