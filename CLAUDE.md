# CLAUDE.md

You are building **Tactilify** — a STEM diagram accessibility engine for blind and low-vision students.

## What this project does
A student or teacher uploads or photographs a STEM diagram. The app uses Claude Vision to detect the diagram type, extract its objects and relationships, then produces four accessible outputs:
1. **Audio walkthrough** — a spoken narration of the diagram, component by component
2. **High-contrast SVG** — a more visually accessible version for low-vision users with high contrast colors
3. **Tactile/braille-print-ready SVG** — a clean outline SVG suitable for swell-paper or embossed printing, with braille labels
4. **Navigable diagram map** — a keyboard/screen-reader navigable step-by-step interface where the student moves through parts one by one


## Only read the files that are necessary
- `docs/05_current_phase.md` — the active task and definition of done
- `docs/06_design.md` - colors, fonts, and design system
- `docs/02_repo_structure.md` — where files live
- `docs/03_tech_stack.md` — what libraries and APIs to use

## Hard rules
- **Always** use context7 mcp when installing packages or dependencies, or when debugging
- **Always** create incremental git commits and **never** append co authored by claude
- **Never** use `any` in TypeScript unless there is truly no alternative; document why if you do
- **Never** call the Anthropic API from the client — always route through `/api/` server routes
- **Never** store uploaded images permanently; treat all uploads as ephemeral (process and discard)
- **Always** handle loading, error, and empty states in every UI component
- **Always** include `aria-label`, `role`, and keyboard navigation on interactive elements
- **Always** check `docs/05_current_phase.md` to confirm which phase is active before starting work
- **Always** use shadcn/ui for UI primitives (buttons, cards, dialogs, tabs, inputs) — never build these from scratch
- **Always** use Motion (Framer Motion) for React component animations; use GSAP for SVG path animations and multi-step diagram map sequences
- **Always** invoke the `frontend-design` skill before building any new page, section, or complex component — use `docs/06_design.md` as the source of truth for colors, spacing, typography, and tokens

## When a phase is complete
Update `docs/05_current_phase.md` to reflect the next phase. Mark the completed phase's definition of done as ✅.

## Diagram types supported
- Circuit diagrams (batteries, resistors, capacitors, inductors, bubls, switches, wires, etc.)
- Graphs and charts (bar, line, pie — axes, labels, data trends)
- Free-body diagrams (objects, force vectors, labels, directions)

## Key APIs
- **Claude Vision** (`claude-opus-4-5` or `claude-sonnet-4-6`) — diagram parsing, object/relationship extraction, narration generation
- **Web Speech API** — primary TTS, in-browser, zero cost
- **OpenAI TTS** (`tts-1`) — fallback if Web Speech API unavailable or for higher-quality export
- **Next.js App Router** — full-stack framework
- **Vercel** — deployment target