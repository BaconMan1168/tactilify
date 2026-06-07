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
│       ├── plans/
│       │   └── 2026-06-05-tactile-simplified-pipeline.md
│       └── specs/
│           └── *.md                   # Historical design specs per phase
│
├── public/
│   ├── favicon.ico
│   └── samples/
│       └── circuit-sample.png         # Demo: series circuit diagram (others deferred to Phase 7)
│
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # Root layout, skip-nav, global aria landmarks
│   │   ├── page.tsx                   # Home page: upload/camera input + results
│   │   ├── globals.css
│   │   └── api/
│   │       ├── analyze/
│   │       │   └── route.ts           # POST: accepts base64 image → returns DiagramAnalysis JSON
│   │       ├── preprocess/
│   │       │   └── route.ts           # POST: file-type validate, sharp resize, pdfjs-dist PDF→image
│   │       ├── tactile/
│   │       │   └── route.ts           # POST: runs runTactilePipeline(), returns svgPages[]
│   │       └── tts/
│   │           └── route.ts           # POST: accepts narration text → returns MP3 (OpenAI TTS fallback)
│   │
│   ├── components/
│   │   ├── input/
│   │   │   ├── ImageUploader.tsx      # Drag-and-drop + click-to-browse file upload
│   │   │   └── CameraCapture.tsx      # getUserMedia live feed + capture button
│   │   │   # SampleImages.tsx — deferred to Phase 7 (Polish & deploy)
│   │   │
│   │   ├── output/
│   │   │   ├── AudioPlayer.tsx        # TTS narration: play/pause/stop, step list, Web Speech + OAI fallback
│   │   │   └── TactileSVG.tsx         # Tactile/braille SVG renderer + download button
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
│   │   ├── brailleMetrics.ts          # Braille cell/line footprint calculation (mm)
│   │   ├── brailleMetrics.test.ts     # Vitest: footprint, collision placement, key hard-stop
│   │   ├── prompts.ts                 # All Claude prompt templates (analysis, narration)
│   │   ├── svg/
│   │   │   ├── tactileAdaptor.ts      # DiagramAnalysis → TactilePageSpec[] (domain classification + strategy)
│   │   │   ├── tactileAdaptor.test.ts # Vitest: adaptor unit tests
│   │   │   ├── tactilePlanner.ts      # TactilePageSpec → TactilePlan (geometry + marker passes)
│   │   │   ├── tactilePlanner.test.ts # Vitest: planner unit tests
│   │   │   └── tactileRenderer.ts     # TactilePlan → SVG string
│   │   └── tactile/
│   │       ├── pipeline.ts            # runTactilePipeline(): TactileContext orchestrator (adapt→plan→render→validate→repair)
│   │       ├── layout/
│   │       │   ├── page-profiles.ts   # PageProfile type + a4/braille-11x11 profiles + getProfile()
│   │       │   └── page-profiles.test.ts
│   │       ├── repair/
│   │       │   ├── repairer.ts        # RepairParams + dispatchRepairs() + applyRepairs()
│   │       │   └── repairer.test.ts
│   │       └── validation/
│   │           ├── validator.ts       # ValidationReport + hard checks + warnings
│   │           └── validator.test.ts
│   │
│   └── types/
│       ├── diagram.ts                 # DiagramAnalysis, DiagramElement, LayoutHint, etc. (Zod schemas)
│       └── tactile.ts                 # TactilePlan, TactilePageSpec, TactileObject, Bbox, etc.
│
├── .env.local                         # ANTHROPIC_API_KEY, OPENAI_API_KEY (never committed)
├── .env.example                       # Template showing required env vars
├── .gitignore
├── next.config.ts
├── postcss.config.mjs                 # Tailwind CSS 4 PostCSS plugin (no tailwind.config.ts in v4)
├── tsconfig.json
├── vitest.config.ts                   # Vitest: resolves @/ path alias for test files
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

### lib/svg/ — core tactile rendering trio
- **`tactileAdaptor.ts`** — classifies `DiagramAnalysis` by domain and strategy, produces `TactilePageSpec[]` (one per output page).
- **`tactilePlanner.ts`** — converts a `TactilePageSpec` into a `TactilePlan` in two passes:
  1. **Geometry pass** — layout functions (`planCyclic`, `planAxial`, `planPositional`, `planDirectional`, `planGrid`) create all objects and set `bboxMm`. No braille markers yet.
  2. **Marker pass** — `placeAllMarkers` seeds `occupied` with every geometry bbox, then places collision-safe braille markers. New layout types get collision-safe placement automatically.
- **`tactileRenderer.ts`** — consumes a `TactilePlan` and emits the final SVG string. No layout decisions here.

### lib/tactile/ — pipeline orchestration
`pipeline.ts` runs the 5-stage pipeline: adapt → plan → render → validate → repair. It carries a `TactileContext` object through every stage, accumulating outputs without lossy conversions. One repair retry is allowed before the pipeline gives up.

### types/diagram.ts
Single source of truth for all TypeScript types. Both the API route and client components import from here. Uses `LayoutHintSchema` (`cyclic` | `axial` | `directional` | `positional` | `none`) to drive layout algorithm selection.

### Environment variables
| Variable | Used in | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/api/analyze` | Claude Vision API calls |
| `OPENAI_API_KEY` | `/api/tts` | OpenAI TTS fallback audio |