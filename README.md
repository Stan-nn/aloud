# Aloud

A local web app that reads your documents aloud. Drop in a PDF, Word file,
Markdown or pasted text; it pulls out the words and speaks them with Kokoro, an
open-weight voice model that runs on your machine. The sentence being spoken is
highlighted and the page scrolls to follow.

No account, no API key, no server, no cost. Parsing and speech both happen
inside the browser tab.

Kokoro is an 82M-parameter model. It is downloaded once, the first time you
press play, and then works offline (see *Voices* below). The voices your
operating system has installed are not used.

```bash
npm install
npm run dev        # http://localhost:5173
```

| | |
|---|---|
| `npm run dev` | Run it |
| `npm test` | 369 tests |
| `npm run typecheck` | TypeScript, no emit |
| `npm run build` | Production bundle into `dist/` |

## What it does

- **Reads PDF, .docx, .md, .txt, and pasted text.** Parsing happens in the tab.
- **Handles technical documents.** Specs and RFDs are dense with things written
  for the eye rather than the ear, so the reader converts them: tables are read
  row by row with their column names, `parent_id` is spoken as "parent id",
  a bare URL becomes its host, numbered headings stay in one piece, HTML tags
  and figure references are dropped, and a skipped code block is announced so
  you know to look at the screen. See "Reading technical documents" below.
- **Shows the document's structure.** Headings, `Label: value` lines, inline
  code, callouts, lists, code listings and figures appear as they do in the
  original — rebuilt from font size, weight and indentation in a PDF, and from
  the syntax in Markdown. What you hear is still each sentence's spoken form.
- **Highlights the sentence being spoken** and scrolls to keep it in view.
  Click any sentence to jump there.
- **Remembers your documents and your place in each.** Close the tab, come
  back, press play, carry on.
- **Kokoro voices only**, generated on your machine.
- **Light and dark**, following your system until you pick one.

## Voices

28 voices from Kokoro, an open-weight 82M-parameter model, generated on your
machine. Kokoro grades its own voices and the list is ordered by that grade,
worst last, because the range is real: `Heart` is an A and `Adam` is an F+.
Heart is the default. A voice chosen in an older version from the voices
installed on the machine is replaced by Heart.

### What the download actually costs

Nothing downloads until you first press play. Then, once:

| | With WebGPU | Without WebGPU |
|---|---|---|
| Model | 310 MB (`fp32`, full precision) | 88 MB (`q8`) |
| ONNX runtime | ~22 MB | ~22 MB |
| Speed | Fast enough to read continuously | Slower; may stall between sentences |

The app detects WebGPU and picks the build that will actually be usable, and
tells you the size before you commit. Afterwards the model is cached by the
browser and the voice works offline.

### On privacy

The honest version: **your documents never leave your machine** — Kokoro
synthesizes locally, so no text is ever transmitted. What does happen is a
one-time model download from Hugging Face, which tells their CDN that someone
fetched a model. Nothing about what you read.

### Limits

- Kokoro takes a speaking speed but has **no pitch control**, so there is no
  pitch slider.
- **Nothing speaks until the model has downloaded.** On a first run with no
  network, there is no voice at all.
- A sentence has to be generated before it can play. The app generates two
  sentences ahead while the current one is speaking, so continuous reading
  works — but jumping to a distant sentence has a short pause while that one
  is made.

### Keyboard

| Key | Action |
|---|---|
| `Space` | Play or pause |
| `←` `→` | Previous or next sentence |
| `↑` `↓` | Speed up or slow down |
| `L` | Show or hide the library |
| `V` | Show or hide voice settings |
| `T` | Switch between light and dark |
| `?` | Show the shortcut list |

## Reading technical documents

Specifications, RFDs and API docs are full of notation that reads badly aloud.
The Markdown reader converts each case rather than reading it literally:

| Written | Heard |
|---|---|
| `## 13.16. Peek Projection` | "13.16 Peek Projection" — one utterance, not "thirteen point sixteen." then a fragment |
| `**Status**: Draft` | Its own sentence, rather than running into the next label |
| `` `parent_id` `` | "parent id" |
| `` `entriesCount` `` | "entries Count" |
| `` `HTTPResponse` `` | "HTTP Response" |
| A Markdown table | Each row as a sentence: "Field: entries Count. Owner: Comment Thread." |
| `https://example.com/rfd/actions` | "example.com" |
| ` ```tsx ` fenced block | "tsx code block." — contents skipped, but you are told |
| `<aside>`, `!figure-one.svg`, `⚠️` | Dropped |

Identifier expansion applies only inside inline code, where a backtick marks
the text as an identifier. A path, a command, or a dotted expression is left
alone.

### How structure comes back out of a PDF

A PDF stores positioned glyphs, not headings. The reader measures the
document's own body text — its commonest size, left margin and line step —
and reads everything else against that: text 2.2× the body size is the title,
bold text 1.4× or 1.2× is a section heading, lines entirely in a monospace
font are code (their indentation recovered from the x offset), lines set in
by about 22pt are list items, a line opening with an emoji set in from the
margin starts a callout, and a bold word followed by a colon is a metadata
line. Figures are found in the page's drawing operations and cropped from a
rendering of the page. A PDF where under 10% of lines look structured is read
as plain paragraphs, exactly as before.

## Design

`DESIGN.md` holds the structure: file tree, data model, the speech engine's
state machine, the palette and type choices, and the browser quirks the engine
works around. `mockups/aloud-mockups.html` is the five-screen mockup the build
follows — open it directly, or see the
[published version](https://claude.ai/code/artifact/47f10a9c-1816-47c5-83ef-4d4d9e40c775).

## Known limits

- **Scanned PDFs have no text to extract.** The app says so rather than showing
  a blank page. OCR is out of scope.
- **Multi-column academic PDFs may read across columns.** Text is reassembled
  from glyph positions, and column detection is not implemented.
- **Voice quality is whatever your system provides.** Built-in voices are
  serviceable, not lifelike. Cloud voices would sound far better and would
  need an API key, a server, and a bill; that trade was declined.
- **Word-level highlighting is not implemented.** Chrome fires the boundary
  event, Safari largely does not, so sentence-level is the reliable primitive.
- **PDF text is only as good as its font mapping.** Some glyphs in a Notion
  export carry no character at all: `(WIP)` shows as `WIP`, a date's hyphens
  become spaces, a figure caption loses its dash and an @mention its `@`.
  Nothing in the file says what they were.
- **Word files show plain paragraphs.** Their structure is not yet kept.
- **Desktop browser first.** There is no mobile layout.

## Verification status

Automated, all passing:

- 369 tests, including end-to-end extraction from the real PDF, `.docx`, `.md`
  and `.txt` files in `samples/`, the full speech queue driven by a fake
  backend, and the Kokoro backend's generation, caching, prefetch and
  cancellation driven by a fake model — no download, no audio
- `tsc --noEmit` clean
- Production build clean

**Not yet done: a run in a real browser with sound.** No browser automation was
available in the session that built this, so the following still need a human
with speakers. Everything below the audio line is covered by tests; what is
listed here is what tests cannot prove.

1. `npm run dev`, drop in a PDF — does audio actually come out?
2. Does the highlight track what you hear, and does the page follow?
3. Click a sentence mid-document — does playback jump there?
4. Pause, reload the tab, press play — does it resume in the same place?
5. Let it read unattended for five minutes — does it stall?
6. Try Safari as well as Chrome — audio playback and WebGPU support differ.
7. **Kokoro end to end**: press play on a fresh profile. Does the download
   start, report progress, finish, and then speak? Is generation fast enough
   to keep up at 1.0×, or does it stall between sentences?
8. Pause, resume, next/previous and click-to-jump during playback.
9. Reload after the model is cached: the second run should not re-download.
