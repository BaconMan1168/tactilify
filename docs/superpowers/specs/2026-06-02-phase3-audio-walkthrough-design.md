# Phase 3 — Audio Walkthrough Design Spec

**Date:** 2026-06-02  
**Status:** Approved

---

## 1. Architecture

### New files
| File | Purpose |
|---|---|
| `src/hooks/useNarration.ts` | Web Speech API lifecycle — all audio state and controls |
| `src/components/output/AudioPlayer.tsx` | Presentational player — receives state/callbacks from hook |
| `src/app/api/tts/route.ts` | POST handler — calls OpenAI TTS, returns MP3 blob |

### Modified files
| File | Change |
|---|---|
| `src/app/page.tsx` | Results screen right panel → real shadcn `Tabs` component; Audio tab mounts `AudioPlayer`, other three tabs show placeholder |

### Data flow
```
page.tsx (results)
  └─ Tabs (shadcn)
       └─ AudioPlayer  ← receives analysis.narration (NarrationStep[])
            └─ useNarration(steps)
                 ├─ speechSynthesis (primary)
                 └─ /api/tts  (fallback download when speech unsupported)
```

---

## 2. Results screen — tab group

The right panel currently renders 4 static output cards. Replace entirely with a shadcn `Tabs` component.

### Tab bar
Four tabs: `Audio walkthrough`, `High-contrast SVG`, `Tactile / braille`, `Diagram map`.

Styling follows the design system pill-toggle pattern:
- Tab bar tray: `background: #0f1011`, `border: 1px solid #23252a`, `border-radius: 8px`, `padding: 4px`, `display: flex`, `gap: 2px`
- Default tab: `background: transparent`, `color: #62666d`, `font-size: 13px`, `font-weight: 500`, `padding: 6px 14px`, `border-radius: 6px`
- Selected tab: `background: #18191a`, `color: #f7f8f8`, same padding/radius
- Use Motion `layout` transition on the selected background for a smooth slide between tabs

### Placeholder tabs (Phases 4–6)
Each non-audio tab renders:
```
eyebrow label (e.g. "High-contrast SVG")
muted body: "Available in a future phase"
```
Surface: `background: #0f1011`, `border: 1px solid #23252a`, `border-radius: 12px`, `padding: 24px`.

---

## 3. `useNarration` hook

### Signature
```typescript
function useNarration(steps: NarrationStep[]): {
  currentStep: number       // 0-indexed; -1 = not started
  isPlaying: boolean
  isPaused: boolean
  isSpeechSupported: boolean
  play: () => void          // start, or resume if paused
  pause: () => void         // pause mid-utterance
  stop: () => void          // cancel + reset to -1
}
```

### Behaviour
- `isSpeechSupported` — checked once on mount: `'speechSynthesis' in window`
- Utterances created **on demand** — `playStep(i)` builds a fresh `SpeechSynthesisUtterance` for `steps[i]`, sets `onend` to call `playStep(i + 1)`, stores it in a ref
- `play()` — three cases: (1) if `isPaused`: `speechSynthesis.resume()`; (2) if `currentStep === steps.length - 1` and not playing/paused (done state): reset `currentStep` to `-1` then call `playStep(0)` to restart; (3) otherwise: `playStep(currentStep < 0 ? 0 : currentStep)`
- `pause()` — calls `speechSynthesis.pause()` (stops immediately mid-word; position is preserved by the browser engine)
- `stop()` — calls `speechSynthesis.cancel()`, resets `currentStep` to `-1`
- Each step start — calls `announce(step.text)` via `@react-aria/live-announcer` so screen readers receive the text independently of TTS
- Final step `onend` — sets `isPlaying: false`, leaves `currentStep` at last index (visible "done" state)
- Unmount cleanup — `speechSynthesis.cancel()` to prevent orphaned utterances

### Known browser caveat
`speechSynthesis.pause()` / `resume()` mid-utterance works reliably in Chrome. Firefox and Safari have inconsistent behaviour — mid-word resume may restart the current step. Document this in a code comment; no workaround in v1.

---

## 4. `AudioPlayer` component

### Props
```typescript
interface AudioPlayerProps {
  steps: NarrationStep[]
}
```

All audio logic comes from `useNarration` internally.

### Layout

```
┌─ controls row ──────────────────────────────────────────────┐
│  [Play/Pause 36px]  [Stop 30px]   ━━━━━━━━━━━━━   2 / 5   │
└─────────────────────────────────────────────────────────────┘

┌─ current step text banner ──────────────────────────────────┐
│  "The battery provides 9V of EMF, connected in series..."  │
└─────────────────────────────────────────────────────────────┘

┌─ step list ─────────────────────────────────────────────────┐
│    1. This is a series circuit with one closed loop.        │  ← done
│  ▶ 2. The battery provides 9V of EMF...                     │  ← active (sliding pill)
│    3. A 100Ω resistor on the top branch...                  │  ← pending
│    4. The LED emits light when current passes...            │  ← pending
│    5. Current flows clockwise: battery → switch → LED...    │  ← pending
└─────────────────────────────────────────────────────────────┘
```

### Controls row
- **Play/Pause button** — 36×36px circle, `background: #5e6ad2`, hover: `#828fff`. Icon: play triangle when stopped/paused, pause bars when playing. `aria-label`: "Play narration" / "Pause narration".
- **Stop button** — 30×30px circle, `background: #18191a`, `border: 1px solid #23252a`. Square stop icon in `#8a8f98`. `aria-label`: "Stop narration". Disabled (opacity 40%) when `currentStep === -1`.
- **Progress bar** — `flex: 1`, height 4px, `background: #23252a`, `border-radius: 9999px`. Fill: `background: linear-gradient(to right, #5e6ad2, #828fff)`, width = `Math.max(0, currentStep + 1) / steps.length * 100%` (0% when not started), animated with `transition: width 0.4s ease`.
- **Step counter** — `font-size: 14px`, `color: #62666d`. Format: `2 / 5`. Shows `0 / N` when not started.

### Current step text banner
- `background: #18191a`, `border: 1px solid #23252a`, `border-radius: 8px`, `padding: 12px 16px`
- `font-size: 16px`, `color: #d0d6e0`, `line-height: 1.5`
- Content: `steps[currentStep]?.text` — empty string when `currentStep === -1`
- `aria-live="polite"` so screen readers also read this as it changes
- Min-height set so the banner doesn't collapse when empty

### Step list

Each step row:
- `padding: 10px 12px`, `border-radius: 8px`, `font-size: 15px`, `line-height: 1.5`
- **Pending** — `color: #62666d`
- **Done** — `color: #3e3e44`
- **Active** — `color: #f7f8f8`, `font-weight: 500`

**Sliding pill animation** — The active step's background highlight is a `motion.div` with `layoutId="step-highlight"` positioned absolutely inside the active row. Motion automatically interpolates its position and size as `currentStep` advances.

```typescript
// Inside the active step row only:
<motion.div
  layoutId="step-highlight"
  className="absolute inset-0 rounded-[8px]"
  style={{ background: "rgba(94,106,210,0.12)", border: "1px solid rgba(94,106,210,0.25)" }}
  transition={{ type: "spring", stiffness: 400, damping: 35 }}
/>
```

Wrap the entire step list in `<AnimatePresence>` and set `layout` on each row so Motion can measure positions correctly.

### States
| State | Behaviour |
|---|---|
| `not-started` | Play button shown, stop disabled, step counter `0 / N`, banner empty |
| `playing` | Pause button shown, active step highlighted and scrolled into view via `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` |
| `paused` | Play button shown (resumes), active step highlight stays |
| `done` | Play button shown (restarts from 0), all steps dim, progress bar full |
| `loading-mp3` | Download button shows spinner; disabled during fetch |
| `error` | `sonner` toast with error message |

### Fallback (Web Speech unsupported)
Replace the controls row entirely with:
- Single "Download MP3" button — `background: #5e6ad2`, full width, `border-radius: 8px`, `padding: 12px 16px`, `font-size: 15px`
- On click: POST all step texts joined by `". "` to `/api/tts`, receive blob, trigger download via temporary `<a>`, fire `sonner` toast: "Narration downloaded"
- During fetch: button shows loading spinner, is disabled
- The step list and current-step banner are still rendered (read-only, no highlight)

### Keyboard support
- `Space` or `P` — play / pause
- `S` or `Escape` — stop
- All buttons have `aria-label`
- `keydown` listener scoped to the component (removed on unmount)

### Accessibility
- `role="region"` + `aria-label="Audio walkthrough"` on the outer wrapper
- `aria-live="polite"` on the current step text banner
- `@react-aria/live-announcer` announces each step text on step start
- Progress bar has `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax={steps.length}`

---

## 5. `/api/tts` route

**Endpoint:** `POST /api/tts`

### Request body
```typescript
{ text: string }  // steps.map(s => s.text).join(". ")
```

### Response
- Success: `Content-Type: audio/mpeg`, binary MP3 stream
- Error: `{ error: string }` with status 400 (invalid input) or 500 (OpenAI failure)

### Implementation
- Validate `text` is a non-empty string — return 400 if not
- Call OpenAI TTS wrapped in `pRetry(fn, { retries: 3 })`:
  ```typescript
  openai.audio.speech.create({ model: "tts-1", voice: "alloy", input: text })
  ```
- Return the response buffer as `audio/mpeg`
- Voice `alloy` — neutral and clear, appropriate for educational narration. Not user-configurable in v1.

---

## 6. Definition of done

1. Clicking Play speaks the full narration step by step via Web Speech API
2. Active step slides to the next row with the Motion spring animation
3. Pause stops immediately; Play resumes from the same position
4. Stop resets to step 0
5. `@react-aria/live-announcer` announces each step independently
6. All controls have `aria-label`; Space/P and S/Escape keyboard shortcuts work
7. In a browser without Web Speech API, "Download MP3" appears and produces a valid MP3
8. `sonner` toast confirms MP3 download success
9. Tab group is wired up in results screen; other three tabs show placeholder
