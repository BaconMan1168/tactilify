export function extractSpeechScript(referenceSvg: string): string {
  const keyMatch = /<text\b[^>]*>\s*KEY\s*<\/text>/i.exec(referenceSvg)
  const searchArea = keyMatch ? referenceSvg.slice(0, keyMatch.index) : referenceSvg
  return searchArea
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
