# 00 — Build Specification

## Project name
**Tactilify** — STEM Diagram Accessibility Engine

## Problem statement
A vast proportion of STEM education is visual: circuit diagrams, graphs, free-body diagrams, molecular structures, and geometric figures. Blind and low-vision students are routinely excluded from this content. Existing solutions — tactile graphics, embossed prints, specialist materials — are slow, expensive, and bottlenecked by human production labor. There is no fast, on-demand tool a student or teacher can use in the moment.

## Solution
Tactilify accepts a photo or file upload of a STEM diagram and returns four accessible representations within seconds:

| Output | Who it's for | Description |
|---|---|---|
| Audio walkthrough | Blind students | Claude-generated narration, spoken via Web Speech API or OpenAI TTS, walking through each component and its relationships |
| High-contrast SVG | Low-vision students | Simplified diagram with bold outlines, high-contrast fill, large labels — rendered in-browser |
| Tactile/braille-print SVG | Blind students (physical) | Clean outline SVG with braille-encoded labels, suitable for swell-paper embossing or tactile printer output |
| Navigable diagram map | Blind/low-vision students | Keyboard and screen-reader navigable interface; student moves through diagram elements one by one with arrow keys |

## Target users
- **Primary:** Blind and low-vision K–12 and university students
- **Secondary:** Teachers and accessibility coordinators who need to produce accessible STEM materials quickly

## Diagram types supported (v1)
1. **Circuit diagrams** — batteries, resistors, LEDs, capacitors, switches, wires, junctions
2. **Graphs and charts** — bar charts, line graphs, pie charts; axes, labels, scales, data trends
3. **Free-body diagrams** — objects, force vectors, labels (e.g. gravity, normal, tension), directions

## Core AI pipeline
```
Image input
  → Claude Vision: classify diagram type
  → Claude Vision: extract structured object/relationship JSON
  → Claude: generate natural-language narration from JSON
  → Renderer: produce high-contrast SVG from JSON
  → Renderer: produce tactile/braille SVG from JSON
  → UI: build navigable diagram map from JSON
  → TTS: speak narration via Web Speech API (fallback: OpenAI TTS)
```

## Why this is not a GPT wrapper
The LLM is only the narrator and extractor. The core technical work is:
- Structured extraction of diagram semantics into a typed JSON schema
- Programmatic SVG generation from that schema (two distinct render targets)
- A keyboard-navigable spatial interface built from extracted node/edge data
- Braille label encoding in SVG output

## Input methods
- File upload (drag-and-drop, click to browse) — JPEG, PNG, WebP, PDF
- Camera capture — live camera feed with capture button (mobile and desktop)

## TTS strategy
- **Primary:** Web Speech API (browser-native, free, zero latency, works offline, familiar to screen reader users)
- **Fallback:** OpenAI TTS `tts-1` (if Web Speech unavailable, or user explicitly requests higher-quality audio export as MP3)

## Deployment
- Framework: Next.js 16+ (ALWAYS USE LTS) 
- Hosting: Vercel
- API keys needed: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (for TTS fallback)

## Accessibility requirements for the app UI itself
- All interactive elements keyboard-navigable
- All images have `alt` text
- All form controls have associated labels
- Focus indicators visible at all times
- Color is never the sole means of conveying information

## Success criteria for hackathon demo
1. Upload a circuit diagram → app correctly identifies it as a circuit, narrates components, produces all four outputs
2. Upload a bar chart → app reads axes and data correctly, produces accessible outputs
3. Upload a free-body diagram → app identifies forces and directions correctly
4. All four output panels visible and functional in one UI
5. Audio plays without error on click
6. Tactile SVG downloads as a valid `.svg` file
7. Navigable map responds to arrow keys and announces elements via screen reader