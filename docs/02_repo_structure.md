# 02 — Repository Structure

```
tactilify/
├── claude.md                          # Instructions for Claude (you are here)
├── docs/
│   ├── 00_build_spec.md
│   ├── 01_build_phases.md
│   ├── 02_repo_structure.md
│   ├── 03_tech_stack.md
│   ├── 04_user_flow.md
│   └── 05_current_phase.md
│
├── public/
│   ├── favicon.ico
│   ├── og-image.png
│   └── samples/
│       ├── circuit-sample.jpg         # Demo: series circuit diagram
│       ├── graph-sample.jpg           # Demo: bar chart (e.g. population data)
│       └── freebody-sample.jpg        # Demo: block on a surface with forces
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout, skip-nav, global aria landmarks
│   │   ├── page.tsx                   # Home page: upload/camera input + results
│   │   ├── globals.css
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts           # POST: accepts base64 image → returns DiagramAnalysis JSON
│   │       └── tts/
│   │           └── route.ts           # POST: accepts narration text → returns MP3 (OpenAI TTS fallback)
│   │
│   ├── components/
│   │   ├── input/
│   │   │   ├── ImageUploader.tsx      # Drag-and-drop + click-to-browse file upload
│   │   │   ├── CameraCapture.tsx      # getUserMedia live feed + capture button
│   │   │   └── SampleImages.tsx       # "Try this example" quick-load buttons
│   │   │
│   │   ├── output/
│   │   │   ├── AudioPlayer.tsx        # TTS narration: play/pause/stop, step list, Web Speech + OAI fallback
│   │   │   ├── TactileSVG.tsx         # Tactile/braille SVG renderer + download button
│   │   │   └── DiagramMap.tsx         # Keyboard-navigable element-by-element diagram explorer
│   │   │
│   │   └── ui/
│   │       ├── LoadingSpinner.tsx     # Accessible loading indicator with aria-live
│   │       ├── ErrorMessage.tsx       # Accessible error display
│   │       ├── OutputPanel.tsx        # Wrapper card for each output section
│   │       └── TabGroup.tsx           # Accessible tab interface for switching output panels
│   │
│   ├── lib/
│   │   ├── anthropic.ts               # Anthropic client initialisation (server-only)
│   │   ├── openai.ts                  # OpenAI client initialisation (server-only)
│   │   ├── braille.ts                 # ASCII → Unicode Grade 1 Braille encoder
│   │   ├── prompts.ts                 # All Claude prompt templates (analysis, narration)
│   │   └── svg/
│   │       └── tactileRenderer.ts     # Tactile/braille SVG generator
│   │
│   └── types/
│       └── diagram.ts                 # All TypeScript types: DiagramAnalysis, DiagramElement, etc.
│
├── .env.local                         # ANTHROPIC_API_KEY, OPENAI_API_KEY (never committed)
├── .env.example                       # Template showing required env vars
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vercel.json                        # Vercel config (function timeout: 60s for AI routes)
```

## Key conventions

### API routes
All AI calls go through `/api/` routes. The client never calls Anthropic or OpenAI directly. This keeps API keys server-side only.

### Component naming
- `input/` — components that accept user input
- `output/` — components that render accessible outputs
- `ui/` — reusable generic UI primitives

### lib/svg/
- `tactileRenderer.ts` — exports `renderTactile(analysis: DiagramAnalysis): string`, returning the A4-sized braille/outline SVG string

### types/diagram.ts
Single source of truth for all TypeScript types. Both the API route and client components import from here.

### Environment variables
| Variable | Used in | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/analyze` | Claude Vision API calls |
| `OPENAI_API_KEY` | `/api/tts` | OpenAI TTS fallback audio |