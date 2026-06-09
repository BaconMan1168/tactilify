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
  // 'width' and 'height' excluded here — set to '210mm'/'297mm' via toSVG options and won't match this regex
  const numericAttrs = ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'width', 'height', 'r', 'rx', 'ry', 'font-size', 'stroke-width']
  let result = svg
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
  return result
}

type FabricObjectWithPattern = fabric.FabricObject & { 'data-pattern-type'?: PatternType }

function collectUsedPatternTypes(objects: FabricObjectWithPattern[]): Set<PatternType> {
  const types = new Set<PatternType>()
  for (const obj of objects) {
    const pt = obj['data-pattern-type']
    if (pt) types.add(pt)
  }
  return types
}

export function exportCanvasToSVG(canvas: fabric.Canvas): string {
  const objects = canvas.getObjects() as FabricObjectWithPattern[]

  // Temporarily swap Fabric Pattern fills to vector URL references so the
  // exported SVG uses our line-based <pattern> defs (not image data-URLs).
  // This survives the round-trip: parsePatternDefs → classifyPattern → createFabricPattern.
  const fillBackups: Array<{ obj: FabricObjectWithPattern; fill: unknown }> = []
  for (const obj of objects) {
    const pt = obj['data-pattern-type']
    if (pt && pt !== 'none') {
      fillBackups.push({ obj, fill: obj.fill })
      obj.set('fill', `url(#pattern-${pt})`)
    }
  }

  // Pass explicit A4 mm dimensions so the root <svg> has proper physical units.
  // The canvas is 595×842 px; toSVG sets width/height to '210mm'/'297mm'.
  // scaleCoordsToMM then converts internal px coordinates to mm, and the
  // viewBox regex ensures a consistent 0 0 210 297 user-unit space.
  const rawSvg = (canvas as unknown as { toSVG(o: Record<string, unknown>): string })
    .toSVG({ width: '210mm', height: '297mm' })

  // Restore Pattern fills on the live canvas (synchronous — no render between set and toSVG)
  for (const { obj, fill } of fillBackups) {
    obj.set('fill', fill)
  }

  const patternTypes = collectUsedPatternTypes(objects)

  let svg = stripFabricAttributes(rawSvg)
  svg = scaleCoordsToMM(svg)
  // Ensure viewBox is consistent with the mm coordinate system
  if (svg.includes('viewBox=')) {
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="0 0 210 297"')
  } else {
    svg = svg.replace(/(<svg\b[^>]*)(>)/, '$1 viewBox="0 0 210 297"$2')
  }

  const patternDefs = buildPatternDefs(patternTypes)
  if (patternDefs) {
    if (svg.includes('<defs>')) {
      svg = svg.replace('<defs>', `<defs>${patternDefs.slice(6, -7)}`)
    } else {
      svg = svg.replace(/(<svg[^>]*>)/, `$1\n${patternDefs}`)
    }
  }

  svg = exportBrailleIText(svg)

  // Mark the SVG as editor-exported so svgLoader skips re-applying MM_TO_PX
  // to scaleX/scaleY on the next load (prevents exponential warp).
  svg = svg.replace(/(<svg\b)/, '$1 data-tactile-export="1"')

  return svg
}
