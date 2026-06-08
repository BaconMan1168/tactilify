import * as fabric from 'fabric'
import { extractBrailleClusterData } from './brailleAdapter'
import { parsePatternDefs, createFabricPattern } from './patternAdapter'

// A4: 210mm × 297mm → 595px × 842px
export const MM_TO_PX = 595 / 210
export const CANVAS_W = 595
export const CANVAS_H = 842

const TACTILE_DEFAULTS = {
  stroke: '#000000',
  strokeWidth: 2.5,
  fill: 'none',
  strokeUniform: true,
}

function applySelectionDefaults() {
  fabric.FabricObject.ownDefaults.borderColor = '#5e6ad2'
  fabric.FabricObject.ownDefaults.cornerColor = '#5e6ad2'
  fabric.FabricObject.ownDefaults.cornerStrokeColor = '#5e6ad2'
}

export async function loadSVGToCanvas(
  canvasEl: HTMLCanvasElement,
  svgString: string,
): Promise<fabric.Canvas> {
  applySelectionDefaults()

  const { svg: strippedSvg, clusters } = extractBrailleClusterData(svgString)
  const patternEntries = parsePatternDefs(strippedSvg)

  const canvas = new fabric.Canvas(canvasEl, {
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
  })

  const { objects } = await fabric.loadSVGFromString(strippedSvg)

  const validObjects = objects.filter((o): o is fabric.FabricObject => o !== null)

  for (const obj of validObjects) {
    obj.scaleX = (obj.scaleX ?? 1) * MM_TO_PX
    obj.scaleY = (obj.scaleY ?? 1) * MM_TO_PX
    obj.left = (obj.left ?? 0) * MM_TO_PX
    obj.top = (obj.top ?? 0) * MM_TO_PX

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

  canvas.on('object:added', (e) => {
    const obj = e.target
    if (!obj || (obj as fabric.FabricObject & { _svgLoaded?: boolean })._svgLoaded) return
    obj.set(TACTILE_DEFAULTS)
  })

  canvas.renderAll()
  return canvas
}
