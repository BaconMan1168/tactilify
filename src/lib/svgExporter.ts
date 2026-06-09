import type * as fabric from 'fabric'
import { exportBrailleIText } from './brailleAdapter'
import { buildPatternDefs, type PatternType } from './patternAdapter'
import { CANVAS_H, CANVAS_W, MM_TO_PX } from './svgLoader'

const PX_TO_MM = 1 / MM_TO_PX

const FABRIC_ATTRS_RE = /\s(fabric:[a-z-]+|data-object-type)="[^"]*"/g
const TEXT_BLOCK_RE = /<text\b[\s\S]*?<\/text>/g

function stripFabricAttributes(svg: string): string {
  return svg
    .replace(FABRIC_ATTRS_RE, '')
    .replace(/<\?xml[^?]*\?>\n?/g, '')
    .replace(/<!--[^-]*Created with Fabric[^-]*-->/g, '')
}

function scaleCoordsToMM(svg: string): string {
  const textBlocks: string[] = []
  let result = svg.replace(TEXT_BLOCK_RE, (block) => {
    const index = textBlocks.push(block) - 1
    return `__TACTILE_TEXT_${index}__`
  })

  // 'width' and 'height' excluded here — set to '210mm'/'297mm' via toSVG options and won't match this regex
  const numericAttrs = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'r', 'rx', 'ry', 'font-size', 'stroke-width']
  for (const attr of numericAttrs) {
    result = result.replace(
      new RegExp(`\\b${attr}="(-?[\\d.]+)"`, 'g'),
      (_m, val: string) => `${attr}="${(parseFloat(val) * PX_TO_MM).toFixed(2)}"`,
    )
  }
  // Scale e/f (translations) AND a/b/c/d (scale/rotation) of transform matrices.
  // Normalising all 6 components prevents the scale factor from compounding on
  // each editor round-trip (the a/d = MM_TO_PX that Fabric bakes in gets divided
  // back out here; svgLoader re-applies MM_TO_PX on the next load).
  result = result.replace(
    /transform="matrix\(([^)]+)\)"/g,
    (_m, inner: string) => {
      const p = inner.trim().split(/[\s,]+/)
      if (p.length === 6) {
        p[0] = (parseFloat(p[0]) * PX_TO_MM).toFixed(6)
        p[1] = (parseFloat(p[1]) * PX_TO_MM).toFixed(6)
        p[2] = (parseFloat(p[2]) * PX_TO_MM).toFixed(6)
        p[3] = (parseFloat(p[3]) * PX_TO_MM).toFixed(6)
        p[4] = (parseFloat(p[4]) * PX_TO_MM).toFixed(3)
        p[5] = (parseFloat(p[5]) * PX_TO_MM).toFixed(3)
      }
      return `transform="matrix(${p.join(' ')})"`
    },
  )
  return result.replace(/__TACTILE_TEXT_(\d+)__/g, (_m, index: string) => textBlocks[Number(index)] ?? '')
}

type FabricObjectWithPattern = fabric.FabricObject & { 'data-pattern-type'?: PatternType }

function collectPatternTypesInObjectOrder(objects: FabricObjectWithPattern[]): PatternType[] {
  const types: PatternType[] = []
  for (const obj of objects) {
    const pt = obj['data-pattern-type']
    if (pt && pt !== 'none') types.push(pt)
  }
  return types
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rewritePatternFills(svg: string, patternTypes: PatternType[]): { svg: string; usedTypes: Set<PatternType> } {
  let result = svg
  const usedTypes = new Set<PatternType>()
  const ids = [...svg.matchAll(/<pattern id="([^"]+)"[\s\S]*?<\/pattern>/g)].map(match => match[1])

  ids.forEach((id, index) => {
    const type = patternTypes[index]
    if (!type) return
    usedTypes.add(type)
    result = result.replace(new RegExp(`url\\(#${escapeRegExp(id)}\\)`, 'g'), `url(#pattern-${type})`)
  })

  for (const id of ids) {
    result = result.replace(new RegExp(`<pattern id="${escapeRegExp(id)}"[\\s\\S]*?<\\/pattern>\\s*`, 'g'), '')
  }
  return { svg: result, usedTypes }
}

function injectPatternDefs(svg: string, patternTypes: Set<PatternType>): string {
  const patternDefs = buildPatternDefs(patternTypes)
  if (!patternDefs) return svg
  if (svg.includes('<defs>')) {
    return svg.replace('<defs>', `<defs>${patternDefs.slice(6, -7)}`)
  }
  return svg.replace(/(<svg[^>]*>)/, `$1\n${patternDefs}`)
}

export function exportCanvasToSVG(canvas: fabric.Canvas): string {
  const objects = canvas.getObjects() as FabricObjectWithPattern[]
  const orderedPatternTypes = collectPatternTypesInObjectOrder(objects)

  // Pass explicit A4 mm dimensions so the root <svg> has proper physical units.
  // The canvas is 595×842 px; toSVG sets width/height to '210mm'/'297mm'.
  // scaleCoordsToMM then converts internal px coordinates to mm, and the
  // viewBox regex ensures a consistent 0 0 210 297 user-unit space.
  const rawSvg = (canvas as unknown as { toSVG(o: Record<string, unknown>): string })
    .toSVG({
      width: '210mm',
      height: '297mm',
      viewBox: { x: 0, y: 0, width: CANVAS_W, height: CANVAS_H },
    })

  const patternRewrite = rewritePatternFills(rawSvg, orderedPatternTypes)
  let svg = stripFabricAttributes(patternRewrite.svg)
  svg = scaleCoordsToMM(svg)
  // Ensure viewBox is consistent with the mm coordinate system
  if (svg.includes('viewBox=')) {
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="0 0 210 297"')
  } else {
    svg = svg.replace(/(<svg\b[^>]*)(>)/, '$1 viewBox="0 0 210 297"$2')
  }

  svg = injectPatternDefs(svg, patternRewrite.usedTypes)

  svg = exportBrailleIText(svg)

  return svg
}
