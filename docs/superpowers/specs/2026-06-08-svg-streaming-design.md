# SVG Streaming — Design Spec

**Date:** 2026-06-08
**Status:** Approved
**Scope:** `/api/llm-tactile` route + `TactileSVG.tsx` component

---

## Problem

The current `/api/llm-tactile` route blocks until Claude finishes generating the full multi-page SVG (~2 minutes) before returning anything to the client. Users see a loading spinner the entire time. The total generation time is acceptable, but the perceived wait is poor.

## Goal

Render each SVG page to the user as soon as it is complete, while Claude is still generating subsequent pages. Total generation time stays the same. Quality is not affected.

---

## Architecture

Three files change. Nothing else is touched.

| File | Change |
|---|---|
| `src/app/api/llm-tactile/route.ts` | Switch from returning a complete JSON response to streaming SSE via `ReadableStream`. Buffer Claude's text output server-side, detect `</svg>` page boundaries, emit one structured SSE event per completed page. |
| `src/components/output/TactileSVG.tsx` | Switch from `fetch` → JSON parse → render-all to consuming the SSE stream. Render each page immediately as its event arrives. |
| `vercel.json` | Increase `maxDuration` on `/api/llm-tactile` from 60 to 300. |

All other files — `braille.ts`, `/api/analyze`, `/api/preprocess`, `AudioPlayer.tsx`, the upload flow — are untouched.

---

## SSE Event Protocol

All events are newline-delimited SSE in the format:

```
data: <JSON>\n\n
```

The SVG string inside `page` events is JSON-encoded (via `JSON.stringify`), which cleanly handles embedded newlines without breaking the SSE line protocol.

### Event types

```ts
// Emitted immediately — client shows loading state
{ type: "start" }

// Emitted each time a complete </svg> is detected + Braille-processed
{ type: "page"; index: number; svg: string }

// Emitted after all pages — carries the narration script for AudioPlayer
{ type: "speech"; script: string }

// Emitted when stream is fully complete
{ type: "done"; totalPages: number }

// Emitted when a non-diagram image is uploaded (replaces NOT_A_DIAGRAM sentinel)
{ type: "not_a_diagram" }

// Emitted on any throw — client shows error state
{ type: "error"; message: string }
```

### Example stream

```
data: {"type":"start"}

data: {"type":"page","index":0,"svg":"<svg viewBox=\"0 0 794 1123\">...</svg>"}

data: {"type":"page","index":1,"svg":"<svg viewBox=\"0 0 794 1123\">...</svg>"}

data: {"type":"speech","script":"Step 1: The cell membrane surrounds..."}

data: {"type":"done","totalPages":2}
```

---

## Server-Side Implementation

### Route signature

```ts
export async function POST(req: Request): Promise<Response>
```

Returns:

```ts
new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
})
```

### Streaming logic (pseudocode)

```ts
const encoder = new TextEncoder()

function emit(controller: ReadableStreamDefaultController, event: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
}

const stream = new ReadableStream({
  async start(controller) {
    try {
      emit(controller, { type: "start" })

      // NOT_A_DIAGRAM check (existing logic) — emit sentinel event and exit cleanly
      if (isNotADiagram(imageData)) {
        emit(controller, { type: "not_a_diagram" })
        return
      }

      const claudeStream = anthropic.messages.stream({ ... })
      let buffer = ""
      let pageIndex = 0
      let lastRawSvg = ""   // holds pre-Braille SVG of most recent completed page

      for await (const event of claudeStream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          buffer += event.delta.text

          // Detect completed SVG page
          const closeTag = buffer.indexOf("</svg>")
          if (closeTag !== -1) {
            const rawSvg = buffer.slice(0, closeTag + 6)
            buffer = buffer.slice(closeTag + 6)
            lastRawSvg = rawSvg  // retain pre-Braille for speechScript extraction

            // Existing Braille post-processing (unchanged)
            const processedSvg = applyBraillePostProcessing(rawSvg)

            emit(controller, { type: "page", index: pageIndex, svg: processedSvg })
            pageIndex++
          }
        }
      }

      // Check for truncated output (stream ended mid-SVG)
      if (buffer.trim().length > 0 && pageIndex === 0) {
        emit(controller, { type: "error", message: "No complete SVG pages were generated. Please try again." })
        return
      }

      // speechScript is extracted from lastRawSvg (pre-Braille reference page)
      const speechScript = extractSpeechScript(lastRawSvg)
      emit(controller, { type: "speech", script: speechScript })
      emit(controller, { type: "done", totalPages: pageIndex })

    } catch (err) {
      emit(controller, { type: "error", message: err instanceof Error ? err.message : "Unknown error" })
    } finally {
      controller.close()
    }
  },
})
```

**Note on `speechScript`:** The existing logic extracts the narration script from the reference SVG page **before** Braille conversion. `lastRawSvg` holds the pre-Braille SVG of the final page across loop iterations, so `extractSpeechScript` receives the correct input. Braille post-processing still runs per-page as today.

**Note on `p-retry`:** The existing route wraps the Claude call in `p-retry` for transient API failures. Streaming is not compatible with `p-retry` wrapping the full call — if the stream starts and then errors mid-way, there is nothing to retry cleanly. Instead: remove `p-retry` from this route and rely on the `error` event + client-side "Try again" button for recovery. The client retry is a full fresh request, which is the correct behaviour for a streaming failure anyway.

---

## Client-Side Implementation

### Why not `EventSource`

`EventSource` only supports GET requests. Since `/api/llm-tactile` is a POST (image data in body), we consume the stream via `fetch` + `response.body.getReader()` with a manual SSE line parser. No new dependency needed — this is ~25 lines of standard Web API code.

### State shape (additions to `TactileSVG.tsx`)

```ts
const [pages, setPages] = useState<string[]>([])
const [isStreaming, setIsStreaming] = useState(false)
const [streamingPageIndex, setStreamingPageIndex] = useState<number | null>(null)
const [error, setError] = useState<string | null>(null)
```

`speechScript` is lifted to the parent (already wired today) via a callback prop — no change to the prop interface, just the timing (it arrives via the `speech` event instead of the JSON response).

### Abort and cleanup

The fetch is controlled by an `AbortController` stored in a ref. A `useEffect` cleanup function aborts it when the component unmounts or when a new generation starts before the previous one finishes:

```ts
const abortRef = useRef<AbortController | null>(null)

// In the generation trigger:
abortRef.current?.abort()
abortRef.current = new AbortController()
const response = await fetch("/api/llm-tactile", {
  method: "POST",
  signal: abortRef.current.signal,
  body: ...,
})

// useEffect cleanup:
useEffect(() => {
  return () => abortRef.current?.abort()
}, [])
```

An aborted fetch throws a `DOMException` with `name === "AbortError"` — this must be caught and ignored (it is not a user-facing error).

### Pre-flight response check

Before reading the stream body, verify `response.ok`. If the server returned a non-2xx (e.g. 400 for a missing image field), the body will be an error JSON or HTML — not SSE. Read it as text and surface the message:

```ts
if (!response.ok) {
  const text = await response.text()
  setError(text || `Server error ${response.status}`)
  setIsStreaming(false)
  return
}
```

### SSE line parser (pseudocode)

```ts
const reader = response.body!.getReader()
const decoder = new TextDecoder()
let lineBuffer = ""

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  lineBuffer += decoder.decode(value, { stream: true })
  const lines = lineBuffer.split("\n")
  lineBuffer = lines.pop()! // keep incomplete line

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue
    try {
      const event = JSON.parse(line.slice(6))
      handleEvent(event)
    } catch {
      // malformed chunk — skip silently, stream continues
    }
  }
}
```

### Event handlers

| Event | Action |
|---|---|
| `start` | `setIsStreaming(true)`, `setStreamingPageIndex(0)` |
| `page` | `setPages(prev => [...prev, event.svg])`, `setStreamingPageIndex(event.index + 1)` |
| `speech` | Call `onSpeechScript(event.script)` prop callback |
| `done` | `setIsStreaming(false)`, `setStreamingPageIndex(null)` |
| `not_a_diagram` | `setIsStreaming(false)`, surface existing NOT_A_DIAGRAM UI (no change to that path) |
| `error` | `setError(event.message)`, `setIsStreaming(false)` |

### Reset on retry

When the user clicks "Try again", reset all streaming state before initiating a new fetch:

```ts
setPages([])
setError(null)
setStreamingPageIndex(null)
setIsStreaming(false)
```

---

## UX States

### While streaming (pages arriving)

```
[ Generating page 2 of ~3... ]      ← animated pulse, muted text

┌─────────────────────────────────┐
│  Page 1 — Diagram               │  ← Motion fadeInUp on arrival
│  <rendered SVG>                 │
└─────────────────────────────────┘
```

### Complete

```
┌─────────────────────────────────┐
│  Page 1 — Diagram               │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  Page 2 — Key / Reference       │
└─────────────────────────────────┘
[ Download PDF ]  [ Zoom controls ]
```

### Error — partial output received

```
⚠ Generation stopped early — showing partial output

┌─────────────────────────────────┐
│  Page 1 — Diagram               │
└─────────────────────────────────┘

[ Try again ]
```

### Error — no output received

Full error state with message + "Try again" CTA (existing error pattern, no change).

---

## Page count estimate

Claude's output page count varies by diagram type (typically 2–3 pages: diagram + reference, sometimes a detail page). The `start` event does not include a total count because it isn't known until Claude finishes. The loading indicator says "page N of ~3" as a soft estimate, then updates to the exact count on `done`.

---

## What does NOT change

- The Claude prompt sent to `/api/llm-tactile` — identical
- `braille.ts` Braille post-processing — runs per-page exactly as today
- `speechScript` extraction logic — same code, just runs after the stream closes
- `/api/analyze` (audio narration) — untouched
- All other routes and components — untouched
- The parent page's tab structure and `onSpeechScript` callback interface — untouched

---

## Required: Vercel timeout update

`vercel.json` currently sets `maxDuration: 60` on `/api/llm-tactile`. A ~2-minute generation will hit this limit. **This must be updated to `maxDuration: 300` as part of this implementation.** Without this change the stream will be cut off mid-generation.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Claude emits `</svg>` inside an SVG comment or attribute value | Unlikely with the current tactile prompt (no free-text SVG content). If it occurs, the worst case is a prematurely split page — detectable by SVG parse failure, which triggers the `error` event with a useful message. |
| Stream ends mid-SVG (Claude cut off before closing tag) | After the `for await` loop completes, check if `buffer` has meaningful content (more than whitespace). If so, emit an `error` event noting that the last page was incomplete. Pages already emitted remain visible. |
| Stream drops mid-generation (network) | Partial pages already rendered stay visible. Error banner shown. Retry button available. |
