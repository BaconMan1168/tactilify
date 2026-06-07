# 00 — Build Specification

## Project name
**Tactilify** — STEM Diagram Accessibility Engine

## Problem statement
A vast proportion of STEM education is visual: circuit diagrams, graphs, free-body diagrams, molecular structures, and geometric figures. Blind and low-vision students are routinely excluded from this content. Existing solutions — tactile graphics, embossed prints, specialist materials — are slow, expensive, and bottlenecked by human production labor. There is no fast, on-demand tool a student or teacher can use in the moment.

## Solution
Tactilify accepts a photo or file upload of a STEM diagram and returns two accessible representations within seconds:

| Output | Who it's for | Description |
|---|---|---|
| Audio walkthrough | Blind students | Claude-generated narration, spoken via Web Speech API or OpenAI TTS, walking through each component and its relationships |
| Tactile/braille-print SVG | Blind students (physical) | Multi-page A4 SVG generated directly by Claude Vision — tactile-optimised outlines, letter-keyed labels, Braille dot markers — suitable for swell-paper embossing or tactile printer output |

## Target users
- **Primary:** Blind and low-vision K–12 and university students
- **Secondary:** Teachers and accessibility coordinators who need to produce accessible STEM materials quickly

## Diagram types supported
Any STEM diagram a student or teacher might encounter. Claude Vision reads the image directly and decides how to represent it — no pre-classification step.

## Core AI pipeline
```
Image input
  → /api/analyze: Claude Vision → DiagramAnalysis JSON (elements, relationships, narration steps)
  → /api/llm-tactile: Claude Vision → A4 SVG pages directly → Braille dot post-processing
  → TTS: speak narration steps via Web Speech API (fallback: OpenAI /api/tts)
```

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
5. Both output panels visible and functional in one UI
6. Audio plays without error on click
7. Tactile SVG downloads as a valid `.svg` file — elements have letter-keyed labels and Braille dot markers