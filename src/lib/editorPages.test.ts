import { describe, expect, it } from 'vitest'
import { exportEditorPages, type ExportableEditorPage } from './editorPages'

function canvas(isDirty: boolean, exported: string): ExportableEditorPage {
  return {
    isDirty,
    exportSVG: () => exported,
  }
}

describe('exportEditorPages', () => {
  it('preserves untouched SVG pages instead of re-exporting through Fabric', () => {
    const pages = ['<svg id="original-1"/>', '<svg id="original-2"/>']
    const canvases = [
      canvas(false, '<svg id="fabric-1"/>'),
      canvas(false, '<svg id="fabric-2"/>'),
    ]

    expect(exportEditorPages(pages, canvases)).toEqual(pages)
  })

  it('exports only dirty pages', () => {
    const pages = ['<svg id="original-1"/>', '<svg id="original-2"/>']
    const canvases = [
      canvas(true, '<svg id="edited-1"/>'),
      canvas(false, '<svg id="fabric-2"/>'),
    ]

    expect(exportEditorPages(pages, canvases)).toEqual(['<svg id="edited-1"/>', pages[1]])
  })
})
