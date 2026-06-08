import { describe, it, expect } from 'vitest'
import { extractSpeechScript } from './speechScript'

describe('extractSpeechScript', () => {
  it('extracts text before KEY section', () => {
    const svg = `<svg><text>Title</text><text>Description</text><text>KEY</text><text>A battery</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('Title')
    expect(result).toContain('Description')
    expect(result).not.toContain('battery')
  })

  it('returns all text when no KEY section', () => {
    const svg = `<svg><text>Title</text><text>Description</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('Title')
    expect(result).toContain('Description')
  })

  it('unescapes XML entities', () => {
    const svg = `<svg><text>R &amp; D &lt;lab&gt;</text></svg>`
    const result = extractSpeechScript(svg)
    expect(result).toContain('R & D <lab>')
  })
})
