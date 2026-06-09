import { describe, expect, it } from 'vitest'
import * as fabric from 'fabric/node'
import type * as FabricBrowser from 'fabric'
import { exportCanvasToSVG } from './svgExporter'
import { MM_TO_PX } from './svgLoader'

function exportStaticCanvas(canvas: fabric.StaticCanvas): string {
  return exportCanvasToSVG(canvas as unknown as FabricBrowser.Canvas)
}

async function createNodePattern(): Promise<fabric.Pattern> {
  const patternSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/></svg>'
  const image = await fabric.FabricImage.fromURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(patternSvg)}`)
  return new fabric.Pattern({ source: image.getElement(), repeat: 'repeat' })
}

describe('exportCanvasToSVG', () => {
  it('exports editor pattern fills as vector pattern urls instead of black fills', async () => {
    const canvas = new fabric.StaticCanvas(undefined, { width: 595, height: 842 })
    const pattern = await createNodePattern()

    const rect = new fabric.Rect({
      left: 40,
      top: 40,
      width: 20,
      height: 20,
      fill: pattern,
      stroke: '#000000',
    }) as fabric.Rect & { 'data-pattern-type'?: string }
    rect['data-pattern-type'] = 'diagonal'
    canvas.add(rect)

    const svg = exportStaticCanvas(canvas)

    expect(svg).toContain('id="pattern-diagonal"')
    expect(svg).toContain('fill: url(#pattern-diagonal)')
    expect(svg).not.toContain('fill: rgb(0,0,0); fill-rule')
  })

  it('keeps editable text font size in millimeter units', () => {
    const canvas = new fabric.StaticCanvas(undefined, { width: 595, height: 842 })
    canvas.add(new fabric.IText('Hello', {
      left: 20 * MM_TO_PX,
      top: 20 * MM_TO_PX,
      scaleX: MM_TO_PX,
      scaleY: MM_TO_PX,
      fontSize: 4,
      fill: '#000000',
    }))

    const svg = exportStaticCanvas(canvas)

    expect(svg).toContain('font-size="4"')
    expect(svg).not.toContain('font-size="11.333333333333334"')
  })
})
