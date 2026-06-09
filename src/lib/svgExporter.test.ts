import { describe, expect, it } from 'vitest'
import * as fabric from 'fabric/node'
import type * as FabricBrowser from 'fabric'
import { exportCanvasToSVG } from './svgExporter'
import { computeBrailleGroupLayout, MM_TO_PX } from './svgLoader'

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

  it('exports braille dot circles at correct size and absolute mm positions', () => {
    // Build a braille cluster for letter A (dots 1,2,4) placed at 50mm, 100mm
    const cluster = {
      circles: [
        { cx: 50.0, cy: 100.0 },
        { cx: 50.0, cy: 102.5 },
        { cx: 52.5, cy: 100.0 },
      ],
      centroidX: (50.0 + 50.0 + 52.5) / 3,
      centroidY: (100.0 + 102.5 + 100.0) / 3,
    }
    const { groupLeft, groupTop, circleOffsets } = computeBrailleGroupLayout(cluster)
    const circles = circleOffsets.map(({ relLeft, relTop }) =>
      new fabric.Circle({
        left: relLeft, top: relTop,
        radius: 0.7 * MM_TO_PX,
        fill: '#000000', stroke: undefined,
        originX: 'center', originY: 'center',
      }),
    )
    const group = new fabric.Group(circles, {
      left: groupLeft, top: groupTop,
      originX: 'center', originY: 'center',
    }) as fabric.Group & { 'data-braille': boolean }
    group['data-braille'] = true

    const canvas = new fabric.StaticCanvas(undefined, { width: 595, height: 842 })
    canvas.add(group)
    const exported = exportStaticCanvas(canvas)

    // All three dots must be flat <circle> elements with r="0.7"
    const circleMatches = [...exported.matchAll(/<circle[^>]*r="0\.7"[^>]*>/g)]
    expect(circleMatches).toHaveLength(3)
    // Each circle must have explicit cx and cy attributes (absolute mm positions)
    for (const m of circleMatches) {
      const cx = parseFloat(/cx="([\d.]+)"/.exec(m[0])![1])
      const cy = parseFloat(/cy="([\d.]+)"/.exec(m[0])![1])
      expect(cx).toBeGreaterThan(0)
      expect(cx).toBeLessThan(210)
      expect(cy).toBeGreaterThan(0)
      expect(cy).toBeLessThan(297)
    }
    // Braille circles must be flat top-level elements — not nested inside <g transform>
    expect(exported).not.toMatch(/<g[^>]*transform[^>]*>\s*<circle[^>]*r="0\.7"/)
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
