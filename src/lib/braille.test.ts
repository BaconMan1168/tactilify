import { describe, it, expect } from 'vitest'
import { encodeBraille } from './braille'

describe('encodeBraille', () => {
  it('maps every letter a–z (lowercase)', () => {
    const expected: Record<string, string> = {
      a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑',
      f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚',
      k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕',
      p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞',
      u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽',
      z: '⠵',
    }
    for (const [letter, cell] of Object.entries(expected)) {
      expect(encodeBraille(letter)).toBe(cell)
    }
  })

  it('maps every letter A–Z (uppercase) to the same cell as lowercase', () => {
    const lower = 'abcdefghijklmnopqrstuvwxyz'
    const upper = lower.toUpperCase()
    for (let i = 0; i < lower.length; i++) {
      expect(encodeBraille(upper[i])).toBe(encodeBraille(lower[i]))
    }
  })

  it('prefixes digits with number indicator ⠼', () => {
    expect(encodeBraille('1')).toBe('⠼⠁')
    expect(encodeBraille('0')).toBe('⠼⠚')
    expect(encodeBraille('9')).toBe('⠼⠊')
  })

  it('only adds one number indicator for a run of digits', () => {
    const result = encodeBraille('123')
    expect(result).toBe('⠼⠁⠃⠉')
  })

  it('resets number indicator after a letter', () => {
    const result = encodeBraille('1a1')
    expect(result).toBe('⠼⠁⠁⠼⠁')
  })

  it('maps space to blank braille cell ⠀ (U+2800)', () => {
    expect(encodeBraille(' ')).toBe('⠀')
  })

  it('maps common punctuation', () => {
    expect(encodeBraille('.')).toBe('⠲')
    expect(encodeBraille(',')).toBe('⠂')
    expect(encodeBraille(':')).toBe('⠒')
    expect(encodeBraille('-')).toBe('⠤')
    expect(encodeBraille('?')).toBe('⠦')
    expect(encodeBraille('!')).toBe('⠖')
  })

  it('passes unknown characters through unchanged', () => {
    expect(encodeBraille('😀')).toBe('😀')
    expect(encodeBraille('€')).toBe('€')
    expect(encodeBraille('#')).toBe('#')
  })

  it('encodes a mixed string correctly', () => {
    // "Hello 123" → h=⠓ e=⠑ l=⠇ l=⠇ o=⠕ space=⠀ ⠼1=⠁ 2=⠃ 3=⠉
    expect(encodeBraille('Hello 123')).toBe('⠓⠑⠇⠇⠕⠀⠼⠁⠃⠉')
  })
})
