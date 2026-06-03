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

// Note: slash is intentionally NOT mapped to hyphen — they are different characters.
// Unknown characters pass through unchanged so they can be flagged by normaliseStemText.
const PUNCT: Record<string, string> = {
  ' ': '⠀', // blank braille cell
  '.': '⠲',
  ',': '⠂',
  ':': '⠒',
  '-': '⠤',
  '?': '⠦',
  '!': '⠖',
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

// ── STEM symbol normalisation ─────────────────────────────────────────────────
// Apply before encodeBraille so that Braille-unsafe symbols are replaced with
// plain words before encoding. Longest patterns are matched first.

const STEM_RULES: [RegExp, string][] = [
  // Multi-char unit sequences (longest first to prevent partial matches)
  [/(\d)\s*GHz\b/g, '$1 gigahertz'],
  [/(\d)\s*MHz\b/g, '$1 megahertz'],
  [/(\d)\s*kHz\b/g, '$1 kilohertz'],
  [/(\d)\s*Hz\b/g, '$1 hertz'],
  [/(\d)\s*MΩ/g, '$1 megaohms'],
  [/(\d)\s*k[Ωω]/g, '$1 kilohms'],
  [/(\d)\s*kV\b/g, '$1 kilovolts'],
  [/(\d)\s*mV\b/g, '$1 millivolts'],
  [/(\d)\s*mA\b/g, '$1 milliamps'],
  [/(\d)\s*nF\b/g, '$1 nanofarads'],
  [/(\d)\s*pF\b/g, '$1 picofarads'],
  [/μF|µF/g, ' microfarads'],
  [/μH|µH/g, ' microhenries'],
  [/μA|µA/g, ' microamps'],
  [/μ|µ/g, 'micro'],
  // Single ohm signs (U+03A9 Ω and U+2126 Ω)
  [/[ΩΩ]/g, ' ohms'],
  // Single-letter units after a digit (word-boundary check avoids false matches)
  [/(\d)\s*V\b/g, '$1 volts'],
  [/(\d)\s*A\b/g, '$1 amps'],
  [/(\d)\s*W\b/g, '$1 watts'],
  [/(\d)\s*F\b/g, '$1 farads'],
  [/(\d)\s*H\b/g, '$1 henries'],
  // Math / relation symbols
  [/°/g, ' degrees'],
  [/×/g, ' times'],
  [/±/g, ' plus or minus'],
  [/√/g, ' square root of'],
  [/=/g, ' equals '],
  [/</g, ' less than '],
  [/>/g, ' greater than '],
  [/\*/g, ' plus '],
  [/\+/g, ' plus '],
]

// Characters that survive unchanged through encodeBraille (safe set)
const SAFE = /^[a-zA-Z0-9 .,:!\-?()\n]$/

/**
 * Normalise STEM label text before Braille encoding.
 * Returns the normalised string plus any symbols that couldn't be translated.
 */
export function normalizeStemText(text: string): { normalized: string; unknownSymbols: string[] } {
  let result = text
  for (const [pattern, replacement] of STEM_RULES) {
    result = result.replace(pattern, replacement)
  }
  // Collapse multiple consecutive spaces
  result = result.replace(/\s+/g, ' ').trim()

  const unknownSymbols: string[] = []
  for (const ch of result) {
    if (!SAFE.test(ch) && !unknownSymbols.includes(ch)) {
      unknownSymbols.push(ch)
    }
  }

  return { normalized: result, unknownSymbols }
}
