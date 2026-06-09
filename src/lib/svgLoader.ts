import * as fabric from 'fabric'
import { parsePatternDefs, createFabricPattern } from './patternAdapter'
import { extractBrailleClusterData, type BrailleCluster } from './brailleAdapter'

// A4: 210mm × 297mm → 595px × 842px
export const MM_TO_PX = 595 / 210
export const CANVAS_W = 595
export const CANVAS_H = 842

// Exported so EditorCanvas can apply the same defaults to user-created objects
export const TACTILE_DEFAULTS = {
  stroke: '#000000',
  strokeWidth: 2.5,
  fill: 'none' as const,
  strokeUniform: true,
}

function applySelectionDefaults() {
  fabric.FabricObject.ownDefaults.borderColor = '#5e6ad2'
  fabric.FabricObject.ownDefaults.cornerColor = '#5e6ad2'
  fabric.FabricObject.ownDefaults.cornerStrokeColor = '#5e6ad2'
}

function stripRootPhysicalDimensions(svgString: string): string {
  return svgString.replace(/<svg\b([^>]*)>/i, (match) =>
    match
      .replace(/\swidth="[^"]*"/i, '')
      .replace(/\sheight="[^"]*"/i, ''),
  )
}

// Pure helper — exported so unit tests can verify the position math without Fabric.js.
// Circles must be in the Group's LOCAL coordinate space (relative to the group center).
// Fabric.js v7 does NOT convert absolute canvas positions for freshly created objects
// passed to the Group constructor — passing absolute coords renders circles at ~2×
// the intended position (off-canvas), making braille labels invisible.
export function computeBrailleGroupLayout(cluster: BrailleCluster): {
  groupLeft: number
  groupTop: number
  circleOffsets: { relLeft: number; relTop: number }[]
} {
  const groupLeft = cluster.centroidX * MM_TO_PX
  const groupTop  = cluster.centroidY * MM_TO_PX
  return {
    groupLeft,
    groupTop,
    circleOffsets: cluster.circles.map(dot => ({
      relLeft: dot.cx * MM_TO_PX - groupLeft,
      relTop:  dot.cy * MM_TO_PX - groupTop,
    })),
  }
}

function createBrailleGroup(cluster: BrailleCluster): fabric.Group {
  const { groupLeft, groupTop, circleOffsets } = computeBrailleGroupLayout(cluster)

  const circles = circleOffsets.map(({ relLeft, relTop }) => new fabric.Circle({
    left: relLeft,
    top: relTop,
    radius: 0.7 * MM_TO_PX,
    fill: '#000000',
    stroke: undefined,
    originX: 'center',
    originY: 'center',
  }))

  const group = new fabric.Group(circles, {
    left: groupLeft,
    top: groupTop,
    originX: 'center',
    originY: 'center',
    selectable: true,
    hasControls: true,
    subTargetCheck: false,
  })
  ;(group as fabric.Group & { 'data-braille': boolean })['data-braille'] = true
  return group
}

// Inject a transparent sentinel rect that exactly matches the viewBox dimensions.
// Fabric.js v7 bug #10866: loadSVGFromString computes its internal bounding box from
// the objects it finds, ignoring the SVG viewBox. Without the sentinel, objects near
// the viewBox edge can shift the bounding box origin, causing downstream MM_TO_PX
// scaling to place shapes at incorrect canvas coordinates (e.g. mitochondria outside
// the cell boundary). The sentinel is zero-stroke, zero-fill — invisible at render time.
function injectViewBoxSentinel(svgString: string): string {
  const viewBoxMatch = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svgString)
  if (!viewBoxMatch) return svgString
  const sentinel = `<rect width="${viewBoxMatch[1]}" height="${viewBoxMatch[2]}" fill="none" stroke="none" opacity="0"/>`
  return svgString.replace(/(<svg\b[^>]*>)/, `$1${sentinel}`)
}

export async function loadSVGToCanvas(
  canvasEl: HTMLCanvasElement,
  svgString: string,
): Promise<fabric.Canvas> {
  applySelectionDefaults()

  const normalizedSvg = stripRootPhysicalDimensions(svgString)
  const { svg: svgWithoutBrailleDots, clusters } = extractBrailleClusterData(normalizedSvg)
  const svgForFabric = injectViewBoxSentinel(svgWithoutBrailleDots)

  const patternEntries = parsePatternDefs(svgWithoutBrailleDots)

  const canvas = new fabric.Canvas(canvasEl, {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
  })

  const { objects } = await fabric.loadSVGFromString(svgForFabric)

  const validObjects = objects.filter((o): o is fabric.FabricObject => {
    if (o === null) return false
    // Discard the invisible sentinel rect we injected to anchor Fabric.js v7's
    // bounding-box origin at the SVG viewBox corner. Identified by opacity=0.
    if ((o as fabric.FabricObject & { opacity?: number }).opacity === 0) return false
    return true
  })

  for (const obj of validObjects) {
    obj.scaleX = (obj.scaleX ?? 1) * MM_TO_PX
    obj.scaleY = (obj.scaleY ?? 1) * MM_TO_PX
    obj.left = (obj.left ?? 0) * MM_TO_PX
    obj.top = (obj.top ?? 0) * MM_TO_PX

    // Apply strokeUniform to loaded non-text objects so stroke width doesn't
    // scale with the object's scaleX/scaleY applied above.
    if (obj.type !== 'i-text' && obj.type !== 'text') {
      obj.set({ strokeUniform: true })
    }

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

    if (obj.type === 'text') {
      const textObj = obj as fabric.Text
      const iText = new fabric.IText(textObj.text ?? '', {
        left: textObj.left,
        top: textObj.top,
        scaleX: textObj.scaleX,
        scaleY: textObj.scaleY,
        fontSize: textObj.fontSize ?? 12,
        fontFamily: textObj.fontFamily,
        fill: textObj.fill,
        fontWeight: textObj.fontWeight,
      })
      canvas.add(iText)
      continue
    }

    canvas.add(obj)
  }

  for (const cluster of clusters) {
    canvas.add(createBrailleGroup(cluster))
  }

  // NOTE: No object:added handler for TACTILE_DEFAULTS here.
  // Applying defaults via that event fires during canvas.loadFromJSON (undo/redo),
  // which would override the white background rect and turn the canvas black.
  // New user-created objects get TACTILE_DEFAULTS applied in EditorCanvas.tsx.

  canvas.renderAll()
  return canvas
}
