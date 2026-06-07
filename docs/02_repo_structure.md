# 02 — Repository Structure

```
tactilify/
├── CLAUDE.md                          # Instructions for Claude (you are here)
├── docs/
│   ├── 00_build_spec.md
│   ├── 01_build_phases.md
│   ├── 02_repo_structure.md
│   ├── 03_tech_stack.md
│   ├── 04_user_flow.md
│   ├── 05_current_phase.md
│   ├── 06_design.md
│   └── superpowers/
│       ├── plans/                     # (empty — historical plans removed)
│       └── specs/
│           ├── 2026-06-01-phase1-design.md
│           └── 2026-06-02-phase3-audio-walkthrough-design.md
│
├── public/
│   ├── favicon.ico
│   └── samples/
│       └── circuit-sample.png         # Demo: series circuit diagram
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout, skip-nav, global aria landmarks
│   │   ├── page.tsx                   # Home page: upload/camera input + results
│   │   ├── globals.css
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts           # POST: image → DiagramAnalysis JSON (for audio narration)
│   │       ├── llm-tactile/
│   │       │   └── route.ts           # POST: image → SVG pages (Claude Vision direct generation)
│   │       ├── preprocess/
│   │       │   └── route.ts           # POST: file-type validate, sharp resize, pdfjs-dist PDF→image
│   │       └── tts/
│   │           └── route.ts           # POST: narration text → MP3 (OpenAI TTS fallback)
│   │
│   ├── components/
│   │   ├── input/
│   │   │   ├── ImageUploader.tsx      # Drag-and-drop + click-to-browse file upload
│   │   │   └── CameraCapture.tsx      # getUserMedia live feed + capture button
│   │   │
│   │   ├── output/
│   │   │   ├── AudioPlayer.tsx        # TTS narration: play/pause/stop, step list, Web Speech + OAI fallback
│   │   │   └── TactileSVG.tsx         # Calls /api/llm-tactile; multi-page SVG preview, zoom, download
│   │   │
│   │   └── ui/
│   │       ├── AxeCore.tsx            # Dev-mode axe-core/react accessibility scanner
│   │       ├── CircuitBackground.tsx  # Decorative animated circuit background for landing
│   │       ├── alert.tsx              # shadcn alert primitive
│   │       ├── button.tsx             # shadcn button primitive
│   │       ├── card.tsx               # shadcn card primitive
│   │       ├── dialog.tsx             # shadcn dialog primitive
│   │       ├── progress.tsx           # shadcn progress primitive
│   │       └── tabs.tsx               # shadcn tabs primitive
│   │
│   ├── hooks/
│   │   └── useNarration.ts            # Hook: drives AudioPlayer step state + Web Speech API
│   │
│   ├── lib/
│   │   ├── anthropic.ts               # Anthropic client initialisation (server-only)
│   │   ├── openai.ts                  # OpenAI client initialisation (server-only)
│   │   ├── braille.ts                 # ASCII → Unicode Grade 1 Braille encoder
│   │   ├── braille.test.ts            # Vitest: encodeBraille unit tests
│   │   └── utils.ts                   # shadcn cn() helper
│   │
│   └── types/
│       └── diagram.ts                 # DiagramAnalysis, DiagramElement, NarrationStep, etc. (Zod schemas)
│
├── .env.local                         # ANTHROPIC_API_KEY, OPENAI_API_KEY (never committed)
├── .env.example                       # Template showing required env vars
├── .gitignore
├── next.config.ts
├── postcss.config.mjs                 # Tailwind CSS 4 PostCSS plugin
├── tsconfig.json
├── vitest.config.ts                   # Vitest: resolves @/ path alias for test files
├── package.json
└── vercel.json                        # Vercel config (function timeout: 60s for AI routes)
```

## Key conventions

### API routes

All AI calls go through `/api/` routes. The client never calls Anthropic or OpenAI directly.

| Route | Purpose |
|---|---|
| `/api/preprocess` | Validates mime type, resizes via `sharp`, converts PDF via `pdfjs-dist` |
| `/api/analyze` | Claude Vision → `DiagramAnalysis` JSON used for audio narration |
| `/api/llm-tactile` | Claude Vision → multi-page A4 SVG + Braille dot post-processing |
| `/api/tts` | OpenAI TTS fallback — returns MP3 for download |

### Component naming
- `input/` — components that accept user input
- `output/` — components that render accessible outputs
- `ui/` — reusable generic UI primitives

### lib/braille.ts
Hand-rolled ASCII → Unicode Grade 1 Braille (U+2800–U+28FF) encoder. Used by `/api/llm-tactile` to post-process letter markers and KEY entries into raised-dot Braille geometry in the SVG output.

### types/diagram.ts
Single source of truth for all TypeScript types. Both the API routes and client components import from here. Uses Zod schemas for runtime validation of Claude-generated JSON.

### Environment variables
| Variable | Used in | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/analyze`, `/api/llm-tactile` | Claude Vision API calls |
| `OPENAI_API_KEY` | `/api/tts` | OpenAI TTS fallback audio |
