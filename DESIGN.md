# Aloud — Design & Structure

A local web app that reads your documents aloud. Drop in a PDF, Word file,
Markdown or pasted text; it extracts the words and speaks them using the voice
engine already built into the browser. The sentence being spoken is highlighted
and the page scrolls to follow.

No account, no API key, no server, no cost. Parsing and speech both happen
inside the browser tab — nothing leaves the machine.

**Status:** built. 369 tests passing, typecheck clean, production build clean.
Not yet run in a real browser with audio — see `README.md`.

---

## 1. Principles

1. **Listening is the job.** The reading pane is the hero; every other region
   yields to it. Full keyboard control, because you should not need the mouse.
2. **Never lose your place.** A glance must answer "where am I" — hence the
   sentence highlight, and resume that survives closing the tab.
3. **Nothing leaves the machine.** Fully client-side. This rules out cloud
   voices, and that is an accepted trade.
4. **Say what went wrong.** A scanned PDF gets a plain explanation, not an
   empty page.

---

## 2. Stack

| Need | Choice | Why |
|---|---|---|
| Framework | Vite + React + TypeScript | Fast dev loop, no server |
| Styling | Plain CSS over custom properties | The approved mockup was already ~700 lines of validated CSS; re-expressing it as utility classes risked the agreed design for no gain at this size, so Tailwind was dropped |
| PDF text | `pdfjs-dist` | Reference implementation; extracts in its own worker so a 300-page PDF does not freeze the UI |
| Word text | `mammoth` | Clean `.docx` to structured text, keeps paragraph breaks |
| Markdown / text | none | A small regex pass strips syntax |
| Sentence splitting | `Intl.Segmenter` | Native. Handles "Dr. Smith" and "e.g." far better than splitting on periods, and costs zero bytes |
| Speech | `kokoro-js` | An 82M-parameter open-weight model run locally via transformers.js. Downloaded once, then offline. Loaded dynamically so it costs the initial bundle nothing. The browser's own voices are not used |
| Storage | `idb` over IndexedDB | Documents exceed the 5MB localStorage cap |
| State | `zustand` | One store, no ceremony |
| Tests | Vitest | Pure logic is written test-first |

No backend. No build step beyond Vite.

---

## 3. Design tokens

One accent serves both themes, drawn from audio instrumentation — the teal of
an oscilloscope trace — rather than the paper-and-ink metaphor every reading app
reaches for. Neutrals carry a faint green-slate bias toward that accent so they
read as chosen rather than inherited.

### Light — "Bone"

| Token | Value | Use |
|---|---|---|
| `--ground` | `#F2F3F0` | Page background |
| `--surface` | `#FAFAF8` | Sidebar, player bar, cards |
| `--ink` | `#1A2320` | Body text |
| `--ink-soft` | `#5B6B65` | Secondary text, metadata |
| `--rule` | `#DCDFD9` | Borders, dividers |
| `--accent` | `#0E7C6B` | Active state, controls, progress |
| `--accent-wash` | `#CFE7E1` | Active sentence background |

### Dark — "Ink"

| Token | Value | Use |
|---|---|---|
| `--ground` | `#10161A` | Page background |
| `--surface` | `#161E23` | Sidebar, player bar, cards |
| `--ink` | `#E4EAE8` | Body text |
| `--ink-soft` | `#8C9C98` | Secondary text, metadata |
| `--rule` | `#263238` | Borders, dividers |
| `--accent` | `#3FD0B6` | Active state, controls, progress |
| `--accent-wash` | `#16332E` | Active sentence background |

Defined in `styles/tokens.css`: the bare `:root` holds the full light palette;
`@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`
redefines the tokens; `:root[data-theme="dark"]` redefines them again so the
toggle wins in both directions. No component ever declares a color outside the
token set.

### Type

| Role | Face | Why |
|---|---|---|
| Reading pane | **Literata** | Designed for long-form reading on screens. The one place the type must disappear |
| UI chrome | **IBM Plex Sans** | Engineered, instrument-like, pairs cleanly with Literata |
| Timecodes, speed, labels | **IBM Plex Mono** | Digits that sit still while the clock runs |

Reading column: up to 1040px wide, so a large screen is used. Reader body 19px/1.75. Scale: 12 · 14 · 16 · 19 · 24 · 32.

---

## 4. File structure

```
aloud/
├── DESIGN.md                    this document
├── mockups/
│   └── index.html               the five approved screens
├── index.html
├── package.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles/
    │   └── tokens.css           light + dark palettes, type scale
    ├── lib/
    │   ├── parse/
    │   │   ├── index.ts         dispatch on file type -> ParsedDoc
    │   │   ├── pdf.ts           pdf.js extraction + layout repair
    │   │   ├── docx.ts          mammoth
    │   │   ├── text.ts          .txt and .md
    │   │   └── clean.ts         de-hyphenate, drop headers/footers, normalize space
    │   ├── segment.ts           Intl.Segmenter -> Sentence[]
    │   ├── estimate.ts          listening time and clock formatting
    │   ├── speech.ts            SpeechEngine: the queue and its state machine
    │   ├── backends/
    │   │   ├── system.ts        the browser's own voices
    │   │   ├── kokoro.ts        generation, clip cache, prefetch, playback
    │   │   ├── routing.ts       the chosen voice decides which backend speaks
    │   │   └── browser.ts       real model loader, audio element, WebGPU check
    │   ├── voices.ts            async voice list
    │   └── db.ts                IndexedDB: documents, progress, settings
    ├── state/
    │   └── store.ts             zustand
    ├── hooks/
    │   ├── useSpeech.ts
    │   └── useKeyboard.ts
    └── components/
        ├── Shell.tsx            frame, header, theme toggle
        ├── LibrarySidebar.tsx
        ├── Dropzone.tsx
        ├── ReaderPane.tsx       paragraphs of <Sentence>, auto-scroll
        ├── Sentence.tsx         spoken / active / upcoming, click to jump
        ├── PlayerBar.tsx        transport, progress, time remaining
        ├── VoicePanel.tsx
        ├── Shortcuts.tsx        the keyboard help overlay
        └── Icons.tsx
```

---

## 5. Data model

```ts
type Doc = {
  id: string
  title: string
  source: 'pdf' | 'docx' | 'md' | 'txt' | 'paste'
  addedAt: number
  wordCount: number
  blocks?: Block[]            // parsed once on import; never re-parsed
  paragraphs?: string[]       // documents saved before blocks; read as paragraph blocks
}

type Run = { text: string; bold?: true; italic?: true; code?: true }

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: Run[] }
  | { kind: 'paragraph' | 'caption' | 'meta'; runs: Run[] }   // meta: first run is the bold label
  | { kind: 'list-item'; ordered?: number; runs: Run[] }
  | { kind: 'callout'; icon?: string; children: Block[] }      // one level only
  | { kind: 'code'; language?: string; text: string }
  | { kind: 'figure'; imageId: string; width: number; height: number }

type Sentence = {
  id: number
  blockPath: number[]         // [block] or [callout, child]
  start: number; end: number  // range of the block's display text
  text: string                // what is spoken
}

type Progress = { docId: string; sentenceIndex: number; updatedAt: number }

type Settings = {
  voiceURI: string
  rate: number                // 0.5 – 2.0
  pitch: number
  theme: 'light' | 'dark' | 'system'
}
```

Parse once on import and store the paragraphs. Sentences are derived on load —
cheap and deterministic, so they need not be stored. Progress is a single
sentence index, which is all "resume where I left off" requires.

Sentences are cut from each block's *display* text, and each one's spoken
text is derived from the runs it covers — so `parent_id` shows as a code chip
but is heard as "parent id", and the highlight sits on exactly what is shown.
A heading or metadata line is one sentence; a code block is one sentence,
"tsx code block."; a figure has none.

IndexedDB (version 2) stores: `documents`, `progress`, `settings`, and
`images` — figures cropped from PDFs, keyed by id with a `docId` index so
they are deleted with their document.

---

## 6. The speech engine

The one genuinely tricky part.

Chrome has a long-standing bug where a single long utterance silently dies after
roughly fifteen seconds. The fix and the feature turn out to be the same thing:
**speak one sentence per utterance and queue the next on `onend`.**

```
play(fromIndex):
  speechSynthesis.cancel()
  index = fromIndex
  speakCurrent()

speakCurrent():
  u = new SpeechSynthesisUtterance(sentences[index].text)
  u.voice = selectedVoice; u.rate = rate; u.pitch = pitch
  u.onstart = -> emit('sentence', index)   // highlight + scroll + save progress
  u.onend   = -> index++; index < len ? speakCurrent() : emit('done')
  u.onerror = -> emit('error')
  speechSynthesis.speak(u)
```

That single decision buys sentence highlighting, click-to-jump, next/previous
sentence, accurate resume, and immunity to the Chrome bug — all from the same
mechanism.

### States

`idle -> loading -> ready -> speaking <-> paused -> finished`

`jump(i)` is valid from `ready`, `speaking` and `paused`; it cancels the queue
and restarts at `i`, preserving whether audio was running.

### Known browser quirks, handled explicitly

- **`getVoices()` returns empty on first call.** It populates asynchronously.
  `voices.ts` resolves a promise on the `voiceschanged` event.
- **Safari's `pause()` is unreliable mid-utterance.** Fallback: on resume,
  cancel and re-speak the current sentence from its start. You lose at most one
  sentence, and it is the behaviour you would want anyway.
- **These quirks applied to the browser's own voices,** which Aloud no longer
  uses; Kokoro plays each sentence through an audio element instead. The
  one-sentence-per-clip queue is unchanged.
- **Word-level highlighting is out of scope.** The `onboundary` event fires in
  Chrome and largely does not in Safari. Sentence-level is the robust primitive.

---

## 7. PDF extraction — the honest caveat

PDFs store positioned glyphs, not paragraphs. `pdf.ts` sorts text items by
position, groups them into lines, and joins lines into paragraphs. `clean.ts`
then rejoins hyphens broken across line ends and drops running headers and
footers — lines that repeat on most pages.

For documents with visible structure — a Notion or browser-printed export —
`pdfLayout.ts` goes further, in three pure passes: pieces become styled lines
(bold from the embedded font's weight, code from its monospace family); lines
are classified against the document's own body size, margin and leading; and
lines join into blocks, including across page breaks when a block stopped
mid-sentence. `pdfFigures.ts` locates images through the page's operator list
and crops them from a 2× rendering. Below 10% structured lines the older
paragraph path is used unchanged.

This handles ordinary single-column documents well. **Multi-column academic PDFs
will sometimes read across columns**, and a scanned PDF contains no text at all.
For the scanned case the app says so plainly rather than reading an empty page.
OCR is out of scope.

---

## 8. Interface

Three regions: a collapsible library rail, the reading pane, and a player bar
pinned to the bottom.

The active sentence is marked by a soft background wash and a 2px accent bar in
the left margin — the text itself is never tinted, since something bright moving
down the page for twenty minutes is tiring. Auto-scroll keeps the active
sentence at roughly one-third height, and is suppressed under
`prefers-reduced-motion`.

### Keyboard

| Key | Action |
|---|---|
| `Space` | play / pause |
| `←` `→` | previous / next sentence |
| `↑` `↓` | speed up / slow down |
| `L` | toggle library |
| `T` | toggle theme |

---

## 9. Build order

0. Mockups + this document — **review gate**
1. Scaffold Vite + React + TS + Tailwind; `tokens.css` and the theme toggle
2. `segment.ts` — tests first (abbreviations, decimals, quotes, ellipses)
3. `parse/` — tests first for `text.ts` and `clean.ts`; `pdf.ts` and `docx.ts`
   verified against real sample files
4. `speech.ts` — tests first against a fake `speechSynthesis`: the queue,
   pause/resume, jump-to-index
5. `db.ts` + store — documents, progress and settings survive a reload
6. Components, following the approved mockups
7. Keyboard shortcuts, auto-scroll, reduced motion
8. Error and edge states: scanned PDF, empty file, unsupported type, no voices,
   very large document

---

## 10. Verification

**Automated** (`npm test`):
- Segmentation holds on "Dr. Smith paid $3.50. Next."
- `clean.ts` rejoins hyphenated line breaks and strips repeated headers
- The engine, driven by a fake synthesizer, advances the queue, resumes at the
  right index, and stops cleanly on `cancel()`

**Manual, in a real browser** — what a test double cannot prove:
1. `npm run dev`, drop in a real PDF — text appears, correctly ordered
2. Press play — audio comes out, the right sentence highlights, the page follows
3. Click a sentence mid-document — playback jumps there
4. Pause, reload the tab, press play — resumes from the same sentence
5. Repeat with `.docx`, `.md`, and pasted text
6. Drop in a scanned PDF — clear message, no crash
7. Toggle the theme; confirm active-sentence contrast in both
8. Drive a full document by keyboard alone
9. Read unattended for five minutes — confirm no stall (the Chrome bug)
10. Check Chrome and Safari — voice availability and `pause()` differ

---

## 11. Out of scope

Cloud AI voices · export to MP3 · OCR for scanned PDFs · word-level highlighting
· EPUB · cross-device sync · mobile layout.

Each is a clean addition later. None changes the architecture above.
