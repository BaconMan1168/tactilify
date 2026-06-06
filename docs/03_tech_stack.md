# 03 — Tech Stack

## MCP tools (always available to Claude)

| MCP             | Scope  | Purpose                                                                                       |
| --------------- | ------ | --------------------------------------------------------------------------------------------- |
| **Context7**    | Global | Pull live, version-accurate library docs into context before writing code — use this before implementing any unfamiliar API or library |
| **Filesystem**  | Global | Read, write, and navigate the local repo directly                                             |
| **shadcn/ui**   | Local  | Scaffold and add shadcn components via MCP rather than manual CLI                            |
| **Motion**      | Local  | Framer Motion docs and component generation — use for UI transitions and output panel animations |
| **GSAP**        | Local  | GSAP docs and animation generation — use for more complex SVG and diagram map animations      |

> **Rule:** Before using any library in this stack, query Context7 for its current docs. Never rely on training-data knowledge for API signatures — libraries change.

---

## Core framework

| Technology   | Version                          | Purpose                                           |
| ------------ | -------------------------------- | ------------------------------------------------- |
| Next.js      | 16+ (App Router) (latest stable) | Full-stack framework: React frontend + API routes |
| TypeScript   | 6+ (latest stable)               | Type safety throughout                            |
| React        | 19+ (latest stable)              | UI layer                                          |
| Tailwind CSS | 4+ (latest stable)               | Styling                                           |

## AI / ML

| Technology                          | Version             | Purpose                                                                                            |
| ----------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| Anthropic SDK (`@anthropic-ai/sdk`) | latest              | Claude Vision — diagram classification, extraction, narration generation                           |
| Claude model                        | `claude-sonnet-4-6` | Primary model for all diagram analysis. Use `claude-opus-4-8` only if sonnet produces poor results |
| OpenAI SDK (`openai`)               | latest              | TTS fallback only — `tts-1` model, MP3 output                                                      |
| `zod`                               | latest              | Runtime validation for Claude-generated structured diagram JSON                                    |
| `jsonrepair`                        | latest              | Repair malformed or almost-valid JSON before schema validation                                     |

## Uploads / file processing

| Technology        | Version | Purpose                                                                         |
| ----------------- | ------- | ------------------------------------------------------------------------------- |
| `react-dropzone`  | latest  | Accessible drag-and-drop file upload                                            |
| `file-type`       | latest  | Server-side file type validation                                                |
| `sharp`           | latest  | Image preprocessing: resize, compress, normalize format before Claude Vision    |
| `pdfjs-dist`      | latest  | PDF-to-image conversion for uploaded PDFs                                       |
| `nanoid`          | latest  | Stable unique IDs for uploads, diagram elements, narration steps, and map nodes |
| `tesseract.js`    | latest  | OCR — text extraction from diagram images when needed                           |
| `@napi-rs/canvas` | latest  | Server-side canvas rendering (Node-compatible canvas API)                       |

## Audio / TTS

| Technology                        | Notes                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Web Speech API (browser built-in) | Primary TTS. Zero cost, zero latency, works offline. Use `window.speechSynthesis`.        |
| OpenAI TTS (`tts-1`)              | Fallback. Called from `/api/tts` server route. Returns MP3 blob for download or playback. |

## SVG & Graphics

| Technology                            | Purpose                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `xmlbuilder2`                         | Circuit, graph, free-body SVG generation. Safer than raw XML string concatenation. |
| `svgo`                                | Optimize and clean generated SVGs before display/download                          |
| `elkjs`                               | Graph layout engine — drives flow-sequence layout in the tactile pipeline          |
| `jszip`                               | Zip multi-page tactile SVG downloads into a single archive                         |
| Unicode Braille block (U+2800–U+28FF) | Braille label encoding in tactile SVG. Implemented in `src/lib/braille.ts`.        |

## Accessibility

| Technology                   | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Semantic HTML                | Foundation — use correct elements (`<button>`, `<nav>`, `<main>`, etc.)                   |
| ARIA attributes              | `aria-label`, `aria-live`, `aria-describedby`, `role` where semantic HTML is insufficient |
| `@react-aria/live-announcer` | Screen-reader announcements for the navigable diagram map                                 |
| `@react-aria/focus`          | Focus management for keyboard navigation and output panels                                |
| axe-core (dev only)          | Automated accessibility testing during development                                        |
| `@axe-core/react`            | Dev-mode accessibility violations logged to console                                       |

## UI

| Technology  | Purpose                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| shadcn/ui   | Accessible UI primitives: buttons, cards, tabs, alerts, progress states, dialogs |
| `radix-ui`  | Low-level headless primitives used by shadcn/ui internally                       |
| `sonner`    | Toast notifications for analysis status, download success, and errors            |

## Animation

| Technology | Purpose                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| **Motion** (Framer Motion) | UI transitions: panel entrances, tab switches, loading states, output reveals |
| **GSAP**   | Complex SVG animations: diagram element highlighting in the navigable map, tactile SVG draw-on effects |

> **Guidance:** Default to Motion for React component animations. Reach for GSAP when animating SVG paths or sequencing multi-step diagram traversals in the diagram map.

## Dev tooling

| Technology                    | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| ESLint + `eslint-config-next` | Linting                                                                             |
| Prettier                      | Formatting                                                                          |
| `eslint-plugin-jsx-a11y`      | Accessibility linting rules for JSX                                                 |
| Vitest                        | Unit testing for schemas, braille encoding, SVG renderers, and utility functions    |
| `@testing-library/react`      | React component testing                                                             |
| `@testing-library/user-event` | Keyboard interaction testing for the navigable diagram map                          |
| `vitest-axe`                  | Automated accessibility assertions in tests                                         |

## Reliability

| Technology | Purpose                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `p-retry`  | Retry transient Claude/OpenAI API failures                                        |
| `p-limit`  | Limit parallel async work if the pipeline is split into multiple processing steps |

## Deployment

| Technology   | Purpose                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| Vercel       | Hosting and deployment. Connect GitHub repo for auto-deploy on push.                         |
| `vercel.json`| Set `maxDuration: 60` on `/api/analyze` and `/api/tts` routes (AI calls can be slow)        |

## In question

| Item                         | Notes                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Separate graph layout engine | Not needed for v1; add later only if manual SVG layout becomes too brittle.         |

## Environment variables required

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

## Package.json scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest",
  "test:a11y": "vitest"
}
```

## Install commands

```bash
npm install @anthropic-ai/sdk openai zod jsonrepair react-dropzone file-type sharp pdfjs-dist nanoid xmlbuilder2 svgo @react-aria/live-announcer @react-aria/focus sonner p-retry p-limit motion gsap

npx shadcn@latest init
npx shadcn@latest add button card tabs alert progress dialog

npm install -D vitest @testing-library/react @testing-library/user-event vitest-axe eslint-plugin-jsx-a11y
```