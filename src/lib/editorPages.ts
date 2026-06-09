export interface ExportableEditorPage {
  exportSVG: () => string
  isDirty: boolean
}

export function exportEditorPages(
  pages: string[],
  canvases: Array<ExportableEditorPage | null | undefined>,
): string[] {
  return pages.map((page, i) => {
    const canvas = canvases[i]
    return canvas?.isDirty ? canvas.exportSVG() : page
  })
}
