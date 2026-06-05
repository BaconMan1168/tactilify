export type PageProfile = {
  id: string
  name: string
  widthMm: number
  heightMm: number
  marginMm: number
  drawingZone: { xMm: number; yMm: number; widthMm: number; heightMm: number }
}

const PROFILES: Record<string, PageProfile> = {
  'a4': {
    id: 'a4',
    name: 'A4 Portrait',
    widthMm: 210,
    heightMm: 297,
    marginMm: 15,
    drawingZone: { xMm: 15, yMm: 15, widthMm: 180, heightMm: 267 },
  },
  'braille-11x11': {
    id: 'braille-11x11',
    name: 'Braille 11×11"',
    widthMm: 279.4,
    heightMm: 279.4,
    marginMm: 12,
    drawingZone: { xMm: 12, yMm: 12, widthMm: 255.4, heightMm: 255.4 },
  },
}

export function getProfile(id: string): PageProfile {
  return PROFILES[id] ?? PROFILES['a4']
}
