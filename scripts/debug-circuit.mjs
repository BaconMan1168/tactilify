// TEMP DEBUG script — sends circuit-sample.png through the full analyze→tactile pipeline
// Run: node scripts/debug-circuit.mjs
// Requires dev server running on localhost:3000

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE_URL = 'http://localhost:3000'

const imgPath = join(__dirname, '../public/samples/circuit-sample.png')
const imgData = readFileSync(imgPath)
const base64 = imgData.toString('base64')
const mimeType = 'image/png'

console.log('=== STEP 1: /api/analyze ===')
const analyzeRes = await fetch(`${BASE_URL}/api/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ base64, mimeType }),
})

if (!analyzeRes.ok) {
  const err = await analyzeRes.text()
  console.error('analyze failed:', analyzeRes.status, err)
  process.exit(1)
}

const analysis = await analyzeRes.json()
console.log('\n=== ANALYZE RESPONSE ===')
console.log(JSON.stringify(analysis, null, 2))

console.log('\n=== STEP 2: /api/tactile ===')
const tactileRes = await fetch(`${BASE_URL}/api/tactile`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ analysis, imageBase64: base64, imageMimeType: mimeType }),
})

if (!tactileRes.ok) {
  const err = await tactileRes.text()
  console.error('tactile failed:', tactileRes.status, err)
  process.exit(1)
}

const tactile = await tactileRes.json()
console.log('\n=== TACTILE RESPONSE ===')
console.log('pageTitles:', tactile.pageTitles)
console.log('pages count:', tactile.pages?.length)
if (tactile.pages?.[0]) {
  const svgLen = tactile.pages[0].length
  console.log('page[0] SVG length:', svgLen, 'chars')
  console.log('page[0] SVG start:', tactile.pages[0].slice(0, 200))
}
