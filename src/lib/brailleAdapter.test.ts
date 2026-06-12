import { describe, it, expect } from 'vitest'
import { findBrailleClusters, exportBrailleIText, applyBraillePostProcessing } from './brailleAdapter'

describe('findBrailleClusters', () => {
  it('groups nearby dots into a single cluster', () => {
    const svg = `<svg>
      <circle cx="20" cy="30" r="0.7" fill="#000000"/>
      <circle cx="22" cy="30" r="0.7" fill="#000000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].circles).toHaveLength(2)
  })

  it('separates dots more than 15mm apart into different clusters', () => {
    const svg = `<svg>
      <circle cx="20" cy="30" r="0.7" fill="#000000"/>
      <circle cx="60" cy="80" r="0.7" fill="#000000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(2)
  })

  it('ignores circles with radius != 0.7 or non-black fill', () => {
    const svg = `<svg>
      <circle cx="20" cy="30" r="3" fill="#000000"/>
      <circle cx="22" cy="30" r="0.7" fill="#ff0000"/>
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(0)
  })

  it('detects Fabric-exported black braille dots from style attributes', () => {
    const svg = `<svg>
      <circle style="fill: rgb(0,0,0);" cx="20" cy="30" r="0.7" />
      <circle style="fill: rgb(0,0,0);" cx="22" cy="30" r="0.7" />
    </svg>`
    const clusters = findBrailleClusters(svg)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].circles).toHaveLength(2)
  })
})

describe('exportBrailleIText', () => {
  it('returns original SVG when no braille markers present', () => {
    const svg = `<svg><rect x="10" y="10" width="20" height="20"/></svg>`
    expect(exportBrailleIText(svg)).toBe(svg)
  })
})

describe('applyBraillePostProcessing — reference page key section', () => {
  const keySvg = `<svg viewBox="0 0 210 297">
    <text x="105" y="20" font-weight="bold" text-anchor="middle">Animal Cell</text>
    <text x="20" y="140" font-weight="bold">KEY</text>
    <text x="20" y="160">A</text>
    <text x="48" y="160">cell membrane</text>
    <text x="20" y="175">B</text>
    <text x="48" y="175">nucleus</text>
  </svg>`

  it('converts full label text to braille on the reference page key section', () => {
    const result = applyBraillePostProcessing(keySvg, true)
    // Source text must not remain as <text> element content, but IS stored as data-braille-source metadata
    expect(result).not.toMatch(/<text[^>]*>cell membrane<\/text>/)
    expect(result).not.toMatch(/<text[^>]*>nucleus<\/text>/)
    expect(result).toContain('data-braille-source="cell membrane"')
    expect(result).toContain('data-braille-source="nucleus"')
    expect(result).toContain('<circle')
  })

  it('converts single-letter key labels to braille circles on the reference page', () => {
    const result = applyBraillePostProcessing(keySvg, true)
    // Single letters A and B should become <circle> elements, not remain as <text>
    expect(result).not.toMatch(/<text[^>]*>\s*A\s*<\/text>/)
    expect(result).not.toMatch(/<text[^>]*>\s*B\s*<\/text>/)
    expect(result).toContain('<circle')
  })

  it('leaves title text above KEY section unconverted', () => {
    const result = applyBraillePostProcessing(keySvg, true)
    expect(result).toContain('Animal Cell')
  })

  it('converts single-letter diagram labels on diagram pages', () => {
    const diagramSvg = `<svg><text x="80" y="50">A</text><text x="100" y="80">cell</text></svg>`
    const result = applyBraillePostProcessing(diagramSvg, false)
    expect(result).not.toMatch(/<text[^>]*>\s*A\s*<\/text>/)
    expect(result).toContain('cell')  // multi-char text stays as-is on diagram pages
  })
})
