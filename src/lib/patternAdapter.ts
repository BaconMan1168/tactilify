import type * as FabricType from 'fabric'

export type PatternType = 'none' | 'diagonal' | 'horizontal' | 'vertical' | 'crosshatch'

interface PatternEntry {
  id: string
  type: PatternType
}

function classifyPattern(patternContent: string): PatternType {
  const lineMatches = [...patternContent.matchAll(/<line\b([^>]*)>/g)]
  if (!lineMatches.length) return 'none'

  const parsed = lineMatches.map(m => {
    const a = m[1]
    return {
      x1: parseFloat(/\bx1="([^"]*)"/.exec(a)?.[1] ?? 'NaN'),
      y1: parseFloat(/\by1="([^"]*)"/.exec(a)?.[1] ?? 'NaN'),
      x2: parseFloat(/\bx2="([^"]*)"/.exec(a)?.[1] ?? 'NaN'),
      y2: parseFloat(/\by2="([^"]*)"/.exec(a)?.[1] ?? 'NaN'),
    }
  }).filter(l => !isNaN(l.x1) && !isNaN(l.y2))

  if (!parsed.length) return 'none'
  if (parsed.length >= 2) return 'crosshatch'

  const { x1, y1, x2, y2 } = parsed[0]
  const TOL = 0.5
  if (Math.abs(y1 - y2) < TOL) return 'horizontal'
  if (Math.abs(x1 - x2) < TOL) return 'vertical'
  return 'diagonal'
}

export function parsePatternDefs(svgString: string): PatternEntry[] {
  const entries: PatternEntry[] = []
  const defsMatch = /<defs[^>]*>([\s\S]*?)<\/defs>/i.exec(svgString)
  if (!defsMatch) return entries
  const defsContent = defsMatch[1]
  const patternRe = /<pattern\b([^>]*)>([\s\S]*?)<\/pattern>/gi
  let m: RegExpExecArray | null
  while ((m = patternRe.exec(defsContent)) !== null) {
    const idMatch = /\bid="([^"]*)"/.exec(m[1])
    if (!idMatch) continue
    entries.push({ id: idMatch[1], type: classifyPattern(m[2]) })
  }
  return entries
}

function buildPatternSVGDataUrl(type: PatternType): string {
  let lines = ''
  switch (type) {
    case 'diagonal':
      lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'horizontal':
      lines = `<line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'vertical':
      lines = `<line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    case 'crosshatch':
      lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>
               <line x1="8" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="0.5"/>`
      break
    default:
      return ''
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">${lines}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export async function createFabricPattern(
  fabric: typeof FabricType,
  type: PatternType,
): Promise<FabricType.Pattern | null> {
  if (type === 'none') return null
  const dataUrl = buildPatternSVGDataUrl(type)
  if (!dataUrl) return null

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const pattern = new fabric.Pattern({ source: img, repeat: 'repeat' })
      resolve(pattern)
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export async function applyPattern(
  fabric: typeof FabricType,
  obj: FabricType.FabricObject,
  type: PatternType,
  canvas: FabricType.Canvas,
): Promise<void> {
  if (type === 'none') {
    obj.set('fill', 'none')
    delete (obj as FabricType.FabricObject & { 'data-pattern-type'?: string })['data-pattern-type']
  } else {
    const pattern = await createFabricPattern(fabric, type)
    if (pattern) {
      obj.set('fill', pattern)
      ;(obj as FabricType.FabricObject & { 'data-pattern-type': string })['data-pattern-type'] = type
    }
  }
  canvas.renderAll()
}

export function buildPatternDefs(types: Set<PatternType>): string {
  const defs: string[] = []
  for (const type of types) {
    if (type === 'none') continue
    let lines = ''
    switch (type) {
      case 'diagonal':
        lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'horizontal':
        lines = `<line x1="0" y1="4" x2="8" y2="4" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'vertical':
        lines = `<line x1="4" y1="0" x2="4" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
      case 'crosshatch':
        lines = `<line x1="0" y1="0" x2="8" y2="8" stroke="#000000" stroke-width="0.5"/>
                 <line x1="8" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="0.5"/>`
        break
    }
    defs.push(
      `<pattern id="pattern-${type}" patternUnits="userSpaceOnUse" width="8" height="8">${lines}</pattern>`
    )
  }
  return defs.length ? `<defs>${defs.join('')}</defs>` : ''
}
