import type * as fabric from 'fabric'
import { exportBrailleIText } from './brailleAdapter'
import { buildPatternDefs, type PatternType } from './patternAdapter'
import { MM_TO_PX } from './svgLoader'

const PX_TO_MM = 1 / MM_TO_PX

const FABRIC_ATTRS_RE = /\s(fabric:[a-z-]+|data-object-type)="[^"]*"/g

function stripFabricAttributes(svg: string): string {
  return svg
    .replace(FABRIC_ATTRS_RE, '')
    .replace(/<\?xml[^?]*\?>\n?/g, '')
    .replace(/<!--[^-]*Created with Fabric[^-]*-->/g, '')
}

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

function collectUsedPatternTypes(canvasJSON: { objects: Array<{ 'data-pattern-type'?: string }> }): Set<PatternType> {
  const types = new Set<PatternType>()
  for (const obj of canvasJSON.objects) {
    const pt = obj['data-pattern-type'] as PatternType | undefined
    if (pt) types.add(pt)
  }
  return types
}

export function exportCanvasToSVG(canvas: fabric.Canvas): string {
  const rawSvg: string = canvas.toSVG()

  // Fabric v7 types don't expose the propertiesToInclude overload but runtime supports it
  const json = (canvas as unknown as { toJSON(props: string[]): { objects: Array<{ 'data-pattern-type'?: string }> } })
    .toJSON(['data-braille', 'data-braille-text', 'data-pattern-type'])
  const patternTypes = collectUsedPatternTypes(json)

  let svg = stripFabricAttributes(rawSvg)
  svg = scaleCoordsToMM(svg)
  svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="0 0 210 297"')

  const patternDefs = buildPatternDefs(patternTypes)
  if (patternDefs) {
    if (svg.includes('<defs>')) {
      svg = svg.replace('<defs>', `<defs>${patternDefs.slice(6, -7)}`)
    } else {
      svg = svg.replace(/(<svg[^>]*>)/, `$1\n${patternDefs}`)
    }
  }

  svg = exportBrailleIText(svg)

  return svg
}
