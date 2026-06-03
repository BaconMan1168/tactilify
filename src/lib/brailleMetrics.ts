import { encodeBraille } from '@/lib/braille'

export const CELL_W = 6.0   // mm per braille cell
export const LINE_H = 10.0  // mm per braille line

/**
 * Returns the bounding box of braille-encoded `normalizedText`
 * wrapped to fit within maxWidthMm.
 * Uses same word-wrap logic as renderBrailleText in the renderer.
 */
export function brailleFootprintMm(
  normalizedText: string,
  maxWidthMm: number,
): { widthMm: number; heightMm: number } {
  if (!normalizedText) return { widthMm: 0, heightMm: LINE_H }

  const words = normalizedText.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (encodeBraille(candidate).length * CELL_W > maxWidthMm && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  if (lines.length === 0) return { widthMm: 0, heightMm: LINE_H }

  const maxCells = Math.max(...lines.map(l => encodeBraille(l).length))
  return {
    widthMm: Math.min(maxCells * CELL_W, maxWidthMm),
    heightMm: lines.length * LINE_H,
  }
}
