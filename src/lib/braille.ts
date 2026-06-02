// Grade 1 Braille lookup — ASCII → Unicode Braille Block (U+2800–U+28FF)
// Letters share cells with digits; digits are prefixed with the number indicator ⠼

const LETTERS: Record<string, string> = {
  a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑',
  f: '⠋', g: '⠛', h: '⠓', i: '⠊', j: '⠚',
  k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕',
  p: '⠏', q: '⠟', r: '⠗', s: '⠎', t: '⠞',
  u: '⠥', v: '⠧', w: '⠺', x: '⠭', y: '⠽',
  z: '⠵',
}

// Digits use the same cells as a–j, prefixed with ⠼ (number indicator)
const DIGITS: Record<string, string> = {
  '1': '⠁', '2': '⠃', '3': '⠉', '4': '⠙', '5': '⠑',
  '6': '⠋', '7': '⠛', '8': '⠓', '9': '⠊', '0': '⠚',
}

const NUMBER_INDICATOR = '⠼' // ⠼

const PUNCT: Record<string, string> = {
  ' ': '⠀', // blank braille cell
  '.': '⠲',
  ',': '⠂',
  ':': '⠒',
  '-': '⠤',
  '?': '⠦',
  '!': '⠖',
  '/': '⠤', // use hyphen cell for slash
  '(': '⠣',
  ')': '⠜',
}

export function encodeBraille(text: string): string {
  let result = ''
  let inNumber = false

  for (const ch of text) {
    const lower = ch.toLowerCase()

    if (DIGITS[ch] !== undefined) {
      if (!inNumber) {
        result += NUMBER_INDICATOR
        inNumber = true
      }
      result += DIGITS[ch]
    } else if (LETTERS[lower] !== undefined) {
      inNumber = false
      result += LETTERS[lower]
    } else if (PUNCT[ch] !== undefined) {
      inNumber = false
      result += PUNCT[ch]
    } else {
      // Unknown character — pass through unchanged
      inNumber = false
      result += ch
    }
  }

  return result
}
