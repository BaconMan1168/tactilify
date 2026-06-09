import { describe, it, expect } from 'vitest'
import { findBrailleClusters, exportBrailleIText } from './brailleAdapter'

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
