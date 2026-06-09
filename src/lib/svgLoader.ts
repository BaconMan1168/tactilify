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

function createBrailleGroup(cluster: BrailleCluster): fabric.Group {
  const circles = cluster.circles.map(dot => new fabric.Circle({
    left: dot.cx * MM_TO_PX,
    top: dot.cy * MM_TO_PX,
    radius: 0.7 * MM_TO_PX,
    fill: '#000000',
    stroke: undefined,
    originX: 'center',
    originY: 'center',
  }))

  const group = new fabric.Group(circles, {
    selectable: true,
    hasControls: true,
    subTargetCheck: false,
  })
  ;(group as fabric.Group & { 'data-braille': boolean })['data-braille'] = true
  return group
}

export async function loadSVGToCanvas(
  canvasEl: HTMLCanvasElement,
  svgString: string,
): Promise<fabric.Canvas> {
  applySelectionDefaults()

  const normalizedSvg = stripRootPhysicalDimensions(svgString)
  const { svg: svgWithoutBrailleDots, clusters } = extractBrailleClusterData(normalizedSvg)

  const patternEntries = parsePatternDefs(svgWithoutBrailleDots)

  const canvas = new fabric.Canvas(canvasEl, {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
  })

  const { objects } = await fabric.loadSVGFromString(svgWithoutBrailleDots)

  const validObjects = objects.filter((o): o is fabric.FabricObject => o !== null)

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
