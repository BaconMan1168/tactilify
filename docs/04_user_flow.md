# 04 — User Flow

## Primary user journey

```
┌─────────────────────────────────────────────────────────┐
│                     LANDING PAGE                        │
│                                                         │
│  Title: Tactilify                                       │
│  Tagline: STEM diagrams, made accessible                │
│  [Motion staggered entrance on load]                    │
│                                                         │
│  [ Upload a diagram ]   [ Use camera ]                  │
│                                                         │
│  ── or try a sample ──                                  │
│  [ Circuit ]  [ Bar Chart ]  [ Ray Diagram ]            │
└────────────────────┬────────────────────────────────────┘
                     │ user picks input method
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌───────────────┐    ┌─────────────────┐
  │  File Upload  │    │  Camera Capture │
  │  react-drop-  │    │  getUserMedia   │
  │  zone UI      │    │  live preview   │
  │               │    │  + capture btn  │
  │  Accepts:     │    │                 │
  │  JPEG/PNG/    │    │  frame saved    │
  │  WebP/PDF     │    │  as base64      │
  └───────┬───────┘    └────────┬────────┘
          └──────────┬──────────┘
                     │
                     │ [server: /api/preprocess]
                     │ file-type validates mime
                     │ sharp: resize to 2048px max,
                     │        normalize to JPEG
                     │ pdfjs-dist: PDF → image
                     │ nanoid: assign upload ID
                     ▼
          ┌─────────────────────┐
          │   Image Preview     │
          │   [Motion fade-in]  │
          │   [Analyze diagram] │ ← primary CTA button
          └──────────┬──────────┘
                     │ POST preprocessed base64
                     │ to /api/analyze
                     ▼
          ┌─────────────────────┐
          │   Loading state     │
          │   sonner toast:     │
          │   "Analyzing your   │
          │    diagram..."      │
          └──────────┬──────────┘
                     │
            ┌────────┴────────┐
            │   /api/analyze  │  (Next.js server route)
            │                 │
            │  1. Receive     │
            │     base64 img  │
            │  2. Send to     │
            │     Claude      │
            │     Vision      │
            │     (p-retry,   │
            │     3 attempts) │
            │  3. jsonrepair  │
            │     raw response│
            │  4. Zod schema  │
            │     validation  │
            │  5. Return      │
            │     typed       │
            │     DiagramAna- │
            │     lysis JSON  │
            └────────┬────────┘
                     │ DiagramAnalysis JSON (Zod-validated)
                     ▼
          ┌─────────────────────────────────────────────┐
          │              RESULTS PAGE                   │
          │  [Motion stagger: panels appear in sequence]│
          │                                             │
          │  Diagram type: "Circuit diagram"            │
          │  Summary: "A series circuit with..."        │
          │                                             │
          │  ┌─────────┬──────────┬──────────┬───────┐ │
          │  │  Audio  │Hi-Contra-│ Tactile  │ Map   │ │
          │  │ Walker- │ st SVG   │  SVG     │ Mode  │ │
          │  │  through│          │          │       │ │
          │  └────┬────┴────┬─────┴─────┬────┴───┬───┘ │
          │       │         │           │        │      │
          └───────┼─────────┼───────────┼────────┼──────┘
                  │         │           │        │
    ┌─────────────┘         │           │        └──────────────────┐
    ▼                       ▼           ▼                           ▼
┌────────────┐    ┌──────────────┐  ┌──────────────┐   ┌──────────────────┐
│   AUDIO    │    │  HIGH-CON-   │  │   TACTILE    │   │   NAVIGABLE      │
│  PLAYER    │    │  TRAST SVG   │  │  BRAILLE SVG │   │   DIAGRAM MAP    │
│            │    │              │  │              │   │                  │
│ Step 1/6:  │    │  xmlbuilder2 │  │  xmlbuilder2 │   │  @react-aria/    │
│ "Starting  │    │  → svgo      │  │  → svgo      │   │  focus scope     │
│  at the    │    │  [SVG render]│  │  [SVG render]│   │                  │
│  battery"  │    │              │  │  Outline     │   │  ► Battery (9V)  │
│            │    │  High-con-   │  │  only, no    │   │    Connected to  │
│ [▶][⏸][⏹] │    │  trast, bold │  │  fill,       │   │    Resistor      │
│            │    │  labels      │  │  braille.ts  │   │                  │
│ Web Speech │    │              │  │  labels      │   │  [GSAP highlight]│
│ API (or    │    │ [Download    │  │              │   │  → Resistor 100Ω │
│ /api/tts   │    │  SVG]        │  │ [Download    │   │  → LED           │
│ fallback)  │    │              │  │  Tactile SVG]│   │  → Wire (return) │
│            │    │ sonner toast │  │              │   │                  │
│ Motion:    │    │ on download  │  │  "Print on   │   │  ↑↓ arrow keys   │
│ step high- │    │              │  │  swell paper"│   │  @react-aria/    │
│ light anim │    │              │  │              │   │  live-announcer  │
│            │    │              │  │ sonner toast │   │                  │
│ @react-    │    │              │  │ on download  │   │  GSAP: node +    │
│ aria live  │    │              │  │              │   │  connection line │
│ announcer  │    │              │  │              │   │  animations      │
└────────────┘    └──────────────┘  └──────────────┘   └──────────────────┘
```

## Data flow

```
User image (JPEG/PNG/WebP/PDF)
      │
      │ [client] react-dropzone or getUserMedia capture
      ▼
POST /api/preprocess
  file-type: validate mime type
  pdfjs-dist: PDF → image (if PDF)
  sharp: resize max 2048px, normalize to JPEG
  nanoid: assign upload ID
      │
      │ preprocessed base64 + upload ID
      ▼
POST /api/analyze
  body: { image: "data:image/jpeg;base64,..." }
      │
      │ [server] Anthropic SDK, claude-sonnet-4-6
      │ p-retry: 3 attempts, exponential backoff
      ▼
Raw Claude response (may be imperfect JSON)
      │
      │ jsonrepair: fix near-valid JSON
      ▼
Repaired JSON string
      │
      │ Zod: DiagramAnalysisSchema.parse()
      ▼
DiagramAnalysis (fully typed, validated)
  {
    type: "circuit",
    title: "Series circuit: battery, resistor, LED",
    summary: "A simple series circuit...",
    elements: [...],      // Zod-validated DiagramElement[]
    relationships: [...], // Zod-validated Relationship[]
    narration: [...]      // Zod-validated NarrationStep[]
  }
      │
      │ [client] stored in React state
      │ sonner: dismiss loading toast, show success
      │
      ├─────────────────────────────────────────────┐
      │                                             │
      ▼                                             ▼
 AudioPlayer                                  HighContrastSVG
 reads narration[]                            reads elements[] + relationships[]
 → Web Speech API                             → circuitRenderer.ts / graphRenderer.ts
   (+ @react-aria/live-announcer)               (xmlbuilder2)
   or /api/tts → OpenAI TTS                   → svgo optimisation
 Motion: step highlight animation             → SVG string rendered inline
      │                                             │
      │                                       TactileSVG
      │                                       reads elements[] + relationships[]
      │                                       → tactileRenderer.ts (xmlbuilder2)
      │                                       → braille.ts (label encoding)
      │                                       → svgo optimisation
      │                                       → SVG string for download
      │                                             │
      │                                       DiagramMap
      │                                       reads elements[] + relationships[]
      │                                       → @react-aria/focus (FocusScope)
      │                                       → @react-aria/live-announcer
      │                                       → GSAP node + connection animations
      └─────────────────────────────────────────────┘
```

## TTS fallback flow

```
User clicks "Play"
      │
      ▼
Check window.speechSynthesis availability
      │
   ┌──┴──┐
   │ YES │ → Web Speech API
   │     │   speak steps sequentially
   │     │   @react-aria/live-announcer
   │     │   announces each step in parallel
   │     │   Motion animates active step highlight
   └──┬──┘
      │
   ┌──┴──┐
   │  NO │ → Show "Download MP3" button
   └──┬──┘   User clicks
      │
      ▼
POST /api/tts
  body: { text: fullNarrationText }
  p-retry: 3 attempts
      │
      │ OpenAI TTS tts-1 → MP3 blob
      ▼
Browser downloads as tactilify-narration.mp3
sonner toast: "Audio downloaded"
```

## Error states

| Scenario | What the user sees |
|---|---|
| Invalid file type | `sonner` toast: "Unsupported file type. Please upload JPEG, PNG, WebP, or PDF." — shown before API call |
| Image too large (>10MB) | `sonner` toast: "Please upload an image under 10MB." — shown before API call |
| Claude returns unreadable diagram | `sonner` error toast: "We couldn't extract diagram data. Try a clearer image or a different diagram." |
| Zod validation fails after jsonrepair | `sonner` error toast: "Analysis returned unexpected data. Retrying…" — triggers p-retry |
| API call fails after all retries | `sonner` error toast: "Something went wrong. Please try again." with inline retry button |
| Camera permission denied | `sonner` toast: "Camera access was denied. Please upload an image instead." |
| Web Speech API unavailable | Audio panel shows "Download MP3" button instead of play controls — no error, graceful fallback |
| OpenAI TTS fails | `sonner` error toast: "Audio download failed. Please try again." |