import { describe, it, expect } from 'vitest'
import { computeBrailleGroupLayout, MM_TO_PX } from './svgLoader'

// A braille cluster for "⠁" (letter A) placed near x=50mm, y=100mm in the SVG.
// Dot layout for "⠁": dots 1, 2, 4 at offsets (0,0), (0,2.5), (2.5,0).
const CLUSTER = {
  circles: [
    { cx: 50.0, cy: 100.0 },
    { cx: 50.0, cy: 102.5 },
    { cx: 52.5, cy: 100.0 },
  ],
  centroidX: (50.0 + 50.0 + 52.5) / 3,  // 50.833…
  centroidY: (100.0 + 102.5 + 100.0) / 3, // 100.833…
}

describe('computeBrailleGroupLayout — braille circle positioning (bug 1)', () => {
  it('sets groupLeft/groupTop to centroid × MM_TO_PX', () => {
    const { groupLeft, groupTop } = computeBrailleGroupLayout(CLUSTER)
    expect(groupLeft).toBeCloseTo(CLUSTER.centroidX * MM_TO_PX, 3)
    expect(groupTop).toBeCloseTo(CLUSTER.centroidY * MM_TO_PX, 3)
  })

  it('produces small circle offsets relative to the group center', () => {
    const { groupLeft, groupTop, circleOffsets } = computeBrailleGroupLayout(CLUSTER)
    for (const { relLeft, relTop } of circleOffsets) {
      // Each circle must be at most the max dot spread (≤ 3mm × MM_TO_PX ≈ 8.5px) from center.
      expect(Math.abs(relLeft)).toBeLessThan(10)
      expect(Math.abs(relTop)).toBeLessThan(10)
    }
    // And the absolute canvas positions recover correctly: group center + offset = dot × MM_TO_PX
    circleOffsets.forEach(({ relLeft, relTop }, i) => {
      expect(groupLeft + relLeft).toBeCloseTo(CLUSTER.circles[i].cx * MM_TO_PX, 3)
      expect(groupTop  + relTop).toBeCloseTo(CLUSTER.circles[i].cy * MM_TO_PX, 3)
    })
  })
})
