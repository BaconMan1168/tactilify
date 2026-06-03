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
| Tactile/braille-print SVG | Blind students (physical) | Clean outline SVG using generic shapes (rect, circle, diamond, arc, arrow) with English labels inside and Braille dot labels outside each shape — suitable for swell-paper embossing or tactile printer output |
| Navigable diagram map | Blind/low-vision students | Keyboard and screen-reader navigable interface; student moves through diagram elements one by one with arrow keys |

## Target users
- **Primary:** Blind and low-vision K–12 and university students
- **Secondary:** Teachers and accessibility coordinators who need to produce accessible STEM materials quickly

## Diagram types supported
Any STEM diagram a student or teacher might encounter. The app does not hard-code a fixed list of diagram types. Claude Vision classifies each upload into a **rendering category** that drives layout:

| Category | Examples |
|---|---|
| `connected-graph` | Circuit diagrams, logic gate diagrams, flowcharts, reaction mechanism arrows |
| `chart` | Bar charts, line graphs, pie charts, titration curves, decay curves, scatter plots |
| `vector-field` | Free-body diagrams, ray diagrams, electric field lines, momentum diagrams |
| `spatial` | Orbital diagrams, crystal structures, atomic models, Punnett squares |
| `other` | Anything else — falls back to a labelled grid layout |

The tactile renderer does not use domain-specific symbols (e.g. IEC circuit glyphs). Every element is rendered as a generic shape (rect, circle, diamond, arc, arrow) with its English label and Braille label placed outside the shape. This keeps the renderer extensible to new diagram types without code changes.

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
1. Upload a circuit diagram → app correctly identifies it, narrates components, produces all four outputs
2. Upload a bar chart → app reads axes and data correctly, produces accessible outputs
3. Upload a free-body diagram → app identifies forces and directions correctly
4. Upload a diagram outside the three common types (e.g. ray diagram, titration curve) → app produces a usable accessible output using the generic renderer
5. All four output panels visible and functional in one UI
6. Audio plays without error on click
7. Tactile SVG downloads as a valid `.svg` file — every element has an English label and a Braille label
8. Navigable map responds to arrow keys and announces elements via screen reader