# 03 — Tech Stack

## MCP tools (always available to Claude)

| MCP             | Scope  | Purpose                                                                                       |
| --------------- | ------ | --------------------------------------------------------------------------------------------- |
| **Context7**    | Global | Pull live, version-accurate library docs into context before writing code — use this before implementing any unfamiliar API or library |
| **Filesystem**  | Global | Read, write, and navigate the local repo directly                                             |
| **shadcn/ui**   | Local  | Scaffold and add shadcn components via MCP rather than manual CLI                            |
| **Motion**      | Local  | Framer Motion docs and component generation — use for UI transitions and output panel animations |
| **GSAP**        | Local  | GSAP docs and animation generation — use for more complex SVG animations                      |

> **Rule:** Before using any library in this stack, query Context7 for its current docs. Never rely on training-data knowledge for API signatures — libraries change.

---

## Core framework

| Technology   | Version                          | Purpose                                           |
| ------------ | -------------------------------- | ------------------------------------------------- |
| Next.js      | 16+ (App Router) (latest stable) | Full-stack framework: React frontend + API routes |
| TypeScript   | 5+ (latest stable)               | Type safety throughout                            |
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
| `nanoid`          | latest  | Stable unique IDs for uploads and diagram elements                              |
| `@napi-rs/canvas` | latest  | Server-side canvas rendering (Node-compatible canvas API)                       |

## Audio / TTS

| Technology                        | Notes                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Web Speech API (browser built-in) | Primary TTS. Zero cost, zero latency, works offline. Use `window.speechSynthesis`.        |
| OpenAI TTS (`tts-1`)              | Fallback. Called from `/api/tts` server route. Returns MP3 blob for download or playback. |

## SVG & Graphics

| Technology                            | Purpose                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Unicode Braille block (U+2800–U+28FF) | Braille dot post-processing in tactile SVG. Implemented in `src/lib/braille.ts`.   |
| `fabric` (Fabric.js)                  | Interactive canvas editor for tactile SVG pages. Loaded dynamically in `EditorCanvas.tsx`. |

## Accessibility

| Technology                   | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| Semantic HTML                | Foundation — use correct elements (`<button>`, `<nav>`, `<main>`, etc.)                   |
| ARIA attributes              | `aria-label`, `aria-live`, `aria-describedby`, `role` where semantic HTML is insufficient |
| `@react-aria/live-announcer` | Announces each narration step to screen readers independently of TTS                      |
| axe-core (dev only)          | Automated accessibility testing during development                                        |
| `@axe-core/react`            | Dev-mode accessibility violations logged to console                                       |

## UI

| Technology      | Purpose                                                                          |
| --------------- | -------------------------------------------------------------------------------- |
| shadcn/ui       | Accessible UI primitives: buttons, cards, tabs, alerts, progress states, dialogs |
| `radix-ui`      | Low-level headless primitives used by shadcn/ui internally                       |
| `lucide-react`  | Icon library used for editor toolbar and UI chrome                               |
| `sonner`        | Toast notifications for analysis status, download success, and errors            |

## Animation

| Technology | Purpose                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| **Motion** (Framer Motion) | UI transitions: panel entrances, tab switches, loading states, output reveals |
| **GSAP**   | Complex SVG animations: tactile SVG draw-on effects |

> **Guidance:** Default to Motion for React component animations. Reach for GSAP when animating SVG paths.

## Dev tooling

| Technology                    | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| ESLint + `eslint-config-next` | Linting                                                                             |
| Prettier                      | Formatting                                                                          |
| `eslint-plugin-jsx-a11y`      | Accessibility linting rules for JSX                                                 |
| Vitest                        | Unit testing for braille encoding, SVG round-trips, and pipeline helpers            |
| `@testing-library/react`      | React component testing                                                             |
| `@testing-library/user-event` | Keyboard interaction testing for accessible UI components                           |
| `vitest-axe`                  | Automated accessibility assertions in tests                                         |

## Reliability

| Technology | Purpose                                                                           |
| ---------- | --------------------------------------------------------------------------------- |
| `p-retry`  | Retry transient Claude/OpenAI API failures                                        |

## Deployment

| Technology   | Purpose                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| Vercel       | Hosting and deployment. Connect GitHub repo for auto-deploy on push.                         |
| `vercel.json`| Set `maxDuration: 60` on `/api/analyze` and `/api/tts` routes (AI calls can be slow)        |

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
  "lint": "eslint",
  "test": "vitest"
}
```

## Install commands

```bash
npm install @anthropic-ai/sdk openai zod jsonrepair react-dropzone file-type sharp pdfjs-dist nanoid @napi-rs/canvas @react-aria/live-announcer fabric lucide-react sonner p-retry motion gsap

npx shadcn@latest init
npx shadcn@latest add button card tabs alert progress dialog separator tooltip

npm install -D vitest @testing-library/react @testing-library/user-event vitest-axe eslint-plugin-jsx-a11y
```
