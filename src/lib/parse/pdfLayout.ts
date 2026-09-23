import {
  displayText,
  normalizeRuns,
  sameStyle,
  type Block,
  type CalloutBlock,
  type LeafBlock,
  type Run,
  type TextBlock,
} from '../blocks'

/**
 * Putting a PDF's structure back. pdf.js gives positioned pieces of text with
 * a font; nothing says "heading" or "list". But a document's own typography
 * does: headings are larger and bold, code is monospace, list items and
 * callouts are indented. These passes read those signals, measured against
 * the document's own body text rather than any fixed size.
 */

export type StyledPiece = {
  str: string
  x: number
  /** Baseline, measured up from the bottom of the page. */
  y: number
  width?: number
  height: number
  bold: boolean
  italic: boolean
  mono: boolean
}

export type Line = {
  x: number
  /** Where the text starts once a leading bullet glyph is set aside. */
  bodyX: number
  y: number
  /** The height most of the line's text is set in. */
  height: number
  allMono: boolean
  runs: Run[]
  text: string
}

/** Baselines within this many units of each other belong to the same line. */
const SAME_LINE_TOLERANCE = 3
/** Closer than this to the end of the previous piece is the same word. */
const WORD_GAP = 0.8
/** A monospace glyph is this fraction of its font size wide. */
const MONO_CHAR = 0.6
/**
 * A glyph whose font gave no Unicode mapping arrives as a control character.
 * What it was cannot be known, so it is treated as absent.
 */
const UNMAPPED = /[\u0000-\u001f]/g
/** Punctuation that hugs the word before it, whatever the gap says. */
const CLOSING = /^[,.;:!?)\]]/
/** A glyph a word processor sets in front of a list item. */
const BULLET = /^[•◦▪‣●○■□▫]\s*/

function styleOf(piece: StyledPiece): Run {
  const run: Run = { text: piece.str.replace(UNMAPPED, '') }
  if (piece.mono) run.code = true
  else {
    if (piece.bold) run.bold = true
    if (piece.italic) run.italic = true
  }
  return run
}

/** The height carrying the most characters, ignoring inline code if there is other text. */
function dominantHeight(pieces: StyledPiece[]): number {
  const counted = pieces.some((p) => !p.mono) ? pieces.filter((p) => !p.mono) : pieces
  const weight = new Map<number, number>()
  for (const piece of counted) {
    weight.set(piece.height, (weight.get(piece.height) ?? 0) + piece.str.length)
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0]![0]
}

function toLine(cluster: StyledPiece[]): Line {
  const pieces = [...cluster].sort((a, b) => a.x - b.x)
  const allMono = pieces.every((p) => p.mono)
  const runs: Run[] = []
  let previous: StyledPiece | null = null

  for (const piece of pieces) {
    const run = styleOf(piece)
    if (previous) {
      const end = previous.width === undefined ? null : previous.x + previous.width
      const gap = end === null ? null : piece.x - end
      if (allMono && gap !== null) {
        // Code keeps its alignment, so the gap is measured in characters.
        const spaces = Math.round(gap / (MONO_CHAR * piece.height))
        if (spaces > 0) runs.push({ text: ' '.repeat(spaces), code: true })
      } else if ((gap === null || gap >= WORD_GAP) && !CLOSING.test(run.text)) {
        // Where pdf.js gives no width there is nothing to measure, so fall
        // back to a space: a missing space is harder to listen past.
        const before = runs[runs.length - 1]!
        runs.push(sameStyle(before, run) ? { ...run, text: ' ' } : { text: ' ' })
      }
    }
    runs.push(run)
    previous = piece
  }

  const x = pieces[0]!.x
  const bodyX =
    pieces.length > 1 && BULLET.test(pieces[0]!.str) && pieces[0]!.str.trim().length === 1
      ? pieces[1]!.x
      : x
  const y = Math.max(...pieces.map((p) => p.y))
  const height = dominantHeight(pieces)
  if (allMono) {
    const text = runs.map((r) => r.text).join('')
    return { x, bodyX, y, height, allMono, runs: [{ text, code: true }], text }
  }
  const normalized = normalizeRuns(runs)
  return { x, bodyX, y, height, allMono, runs: normalized, text: displayText(normalized) }
}

export function styledLines(pieces: StyledPiece[]): Line[] {
  const withText = pieces.filter(
    (piece) => piece.str.replace(UNMAPPED, '').trim().length > 0,
  )
  const clusters: StyledPiece[][] = []

  // Cluster by baseline first. Ordering by y alone would let a piece sitting
  // a fraction higher on the same line jump ahead of the piece to its left.
  for (const piece of [...withText].sort((a, b) => b.y - a.y)) {
    const cluster = clusters[clusters.length - 1]
    if (cluster && Math.abs(cluster[0]!.y - piece.y) <= SAME_LINE_TOLERANCE) {
      cluster.push(piece)
    } else {
      clusters.push([piece])
    }
  }

  return clusters.map(toLine)
}

// ---------------------------------------------------------------------------
// Lines to blocks
// ---------------------------------------------------------------------------

export type FigureMark = { y: number; imageId: string; width: number; height: number }
export type PageContent = { lines: Line[]; figures: FigureMark[] }

type Kind =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'code'
  | 'callout-open'
  | 'callout'
  | 'meta'
  | 'caption'
  | 'list'
  | 'paragraph'
  | 'drop'

type Metrics = { body: number; margin: number; leading: number; monoShare: number }

const EMOJI_START = /^\p{Extended_Pictographic}/u
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\uFE0F\u200D\s]+$/u
const LEADING_EMOJI = /^\p{Extended_Pictographic}\uFE0F?/u
const ENDS_SENTENCE = /[.:?!]["')\]]?\s*$/
const LINE_END_HYPHEN = /\p{L}-$/u
const OPENS_WORD = /^\p{L}/u
const ORDINAL = /^(\d+)[.)]\s*/

function mode(values: number[]): number | undefined {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

/** The document's body size, left margin and line step, from its commonest text. */
function measure(pages: PageContent[]): Metrics {
  const text = pages
    .flatMap((p) => p.lines)
    .filter((l) => !l.allMono && !EMOJI_ONLY.test(l.text))
  const body = mode(text.map((l) => Math.round(l.height * 10) / 10)) ?? 12
  const margin = mode(text.map((l) => Math.round(l.x))) ?? 72

  const bodyLike = (l: Line) => !l.allMono && Math.abs(l.height - body) < 0.5
  const steps: number[] = []
  for (const { lines } of pages) {
    for (let i = 1; i < lines.length; i++) {
      const a = lines[i - 1]!
      const b = lines[i]!
      if (bodyLike(a) && bodyLike(b) && a.y > b.y) steps.push(a.y - b.y)
    }
  }
  const all = pages.flatMap((p) => p.lines)
  const monoShare = all.length ? all.filter((l) => l.allMono).length / all.length : 0
  return { body, margin, leading: median(steps) || body * 1.5, monoShare }
}

function allBold(line: Line): boolean {
  const worded = line.runs.filter((r) => r.text.trim())
  return worded.length > 0 && worded.every((r) => r.bold)
}

function classify(line: Line, m: Metrics, inCallout: boolean): Kind {
  const text = line.text.trim()
  // An emoji set in from the margin opens a callout; one at the margin is
  // decoration, like the page icon Notion prints above a title.
  if (EMOJI_START.test(text) && line.x >= m.margin + 5) return 'callout-open'
  if (EMOJI_ONLY.test(text)) return 'drop'
  if (!line.allMono) {
    if (line.height >= 2.2 * m.body) return 'h1'
    if (line.height >= 1.4 * m.body && allBold(line)) return 'h2'
    if (line.height >= 1.2 * m.body && allBold(line)) return 'h3'
  }
  if (line.allMono && line.x >= m.margin + 5) return 'code'
  if (inCallout && line.x >= m.margin + 30) return 'callout'

  const [first, second] = line.runs
  if (
    first?.bold &&
    (first.text.trimEnd().endsWith(':') || second?.text.trimStart().startsWith(':'))
  ) {
    return 'meta'
  }
  if (/^Figure \d+/.test(text)) return 'caption'
  if (line.bodyX !== line.x && line.x >= m.margin - 4) return 'list'
  if (line.x >= m.margin + 8 && line.x < m.margin + 30) return 'list'
  return 'paragraph'
}

/**
 * An indented line with no bullet or number, followed straight away by a line
 * back at the margin, is a paragraph's first-line indent — the commonest
 * layout in print — not a one-line list item.
 */
function refine(kind: Kind, line: Line, next: Line | undefined, m: Metrics): Kind {
  if (kind !== 'list' || line.bodyX !== line.x || ORDINAL.test(line.text)) return kind
  if (!next || Math.abs(next.x - m.margin) > 4) return kind
  return line.y - next.y <= 1.2 * m.leading ? 'paragraph' : kind
}

/** Each line's classification, first-line indents resolved. */
function classifyPage(lines: Line[], m: Metrics, inCallout: boolean): Kind[] {
  return lines.map((line, i) => refine(classify(line, m, inCallout), line, lines[i + 1], m))
}

/** The share of lines that are anything other than a plain paragraph. */
export function structureRatio(pages: PageContent[]): number {
  const m = measure(pages)
  // A document set in a monospace face — a screenplay, a typed letter, an
  // RFC — has no code to pick out; all of it is the body.
  if (m.monoShare > 0.5) return 0
  const kinds = pages.flatMap((p) => classifyPage(p.lines, m, false))
  if (kinds.length === 0) return 0
  return kinds.filter((kind) => kind !== 'paragraph').length / kinds.length
}

function withoutBold(runs: Run[]): Run[] {
  return normalizeRuns(
    runs.map((run) => {
      const copy = { ...run }
      delete copy.bold
      return copy
    }),
  )
}

function newBlock(kind: Kind, line: Line): TextBlock {
  switch (kind) {
    case 'h1':
      return { kind: 'heading', level: 1, runs: withoutBold(line.runs) }
    case 'h2':
      return { kind: 'heading', level: 2, runs: withoutBold(line.runs) }
    case 'h3':
      return { kind: 'heading', level: 3, runs: withoutBold(line.runs) }
    case 'meta':
      return { kind: 'meta', runs: line.runs }
    case 'caption':
      return { kind: 'caption', runs: line.runs }
    case 'list': {
      if (line.bodyX !== line.x) {
        const [first, ...rest] = line.runs
        const runs = normalizeRuns([{ ...first!, text: first!.text.replace(BULLET, '') }, ...rest])
        return { kind: 'list-item', runs }
      }
      const ordinal = ORDINAL.exec(line.text)
      if (!ordinal) return { kind: 'list-item', runs: line.runs }
      const [first, ...rest] = line.runs
      const runs = normalizeRuns([
        { ...first!, text: first!.text.replace(ORDINAL, '') },
        ...rest,
      ])
      return { kind: 'list-item', ordered: Number(ordinal[1]), runs }
    }
    default:
      return { kind: 'paragraph', runs: line.runs }
  }
}

/**
 * Add a wrapped line to a block. A PDF printed from a browser never
 * hyphenates on its own, so a hyphen at a line end is a real one
 * ("Entry-" / "scoped") and the halves join without a space.
 */
function append(block: TextBlock, runs: Run[]): void {
  const last = block.runs[block.runs.length - 1]
  const first = runs[0]
  if (
    last &&
    first &&
    !last.code &&
    !first.code &&
    LINE_END_HYPHEN.test(last.text) &&
    OPENS_WORD.test(first.text)
  ) {
    block.runs = normalizeRuns([...block.runs, ...runs])
  } else {
    block.runs = normalizeRuns([...block.runs, { text: ' ' }, ...runs])
  }
}

type CodeLine = { x: number; y: number; height: number; text: string; page: number }

/** Code lines as text, indentation and blank lines recovered from geometry. */
function codeText(lines: CodeLine[]): string {
  const minX = Math.min(...lines.map((l) => l.x))
  const out: string[] = []
  lines.forEach((line, i) => {
    const previous = lines[i - 1]
    if (previous && previous.page === line.page) {
      const blanks = Math.round((previous.y - line.y) / (1.5 * line.height)) - 1
      for (let b = 0; b < blanks; b++) out.push('')
    }
    const indent = Math.max(0, Math.round((line.x - minX) / (MONO_CHAR * line.height)))
    out.push(' '.repeat(indent) + line.text)
  })
  return out.join('\n')
}

type Open = { kind: Kind; block: TextBlock; x: number; lines: number }

export function buildBlocks(pages: PageContent[]): Block[] {
  const m = measure(pages)
  const out: Block[] = []
  let callout = null as CalloutBlock | null
  let open = null as Open | null
  let code = null as CodeLine[] | null
  let last = null as { y: number; page: number } | null

  const push = (block: LeafBlock) => {
    if (callout) callout.children.push(block)
    else out.push(block)
  }
  const closeCode = () => {
    if (code) push({ kind: 'code', text: codeText(code) })
    code = null
  }
  const closeCallout = () => {
    open = null
    closeCode()
    if (callout && callout.children.length > 0) out.push(callout)
    callout = null
  }

  /** Whether a line carries on the block still open, rather than starting one. */
  const continues = (current: Open, kind: Kind, line: Line, step: number | null): boolean => {
    // A paragraph whose first line was indented carries on at the margin.
    const returnsToMargin =
      current.kind === 'paragraph' &&
      current.lines === 1 &&
      current.x > line.x &&
      Math.abs(line.x - m.margin) <= 4
    if (Math.abs(line.x - current.x) > 4 && !returnsToMargin) return false
    if (current.kind === 'h1' || current.kind === 'h2' || current.kind === 'h3') {
      return kind === current.kind && step !== null && step <= 1.3 * line.height
    }
    // Across a page break there is no gap to measure; a block carries on
    // only if it stopped mid-sentence.
    const near =
      step === null
        ? !ENDS_SENTENCE.test(displayText(current.block.runs))
        : step <= 1.2 * m.leading
    if (!near) return false
    if (current.kind === 'meta' || current.kind === 'caption') return kind === 'paragraph'
    // A bullet's hanging lines may sit deeper than the list indent.
    if (current.kind === 'list') return kind === 'list' || kind === 'paragraph'
    return kind === current.kind
  }

  const handle = (line: Line, kind: Kind, step: number | null, pageIndex: number) => {
    if (kind === 'drop') return

    if (kind === 'code') {
      open = null
      if (!code) {
        if (callout && line.x < m.margin + 30) closeCallout()
        code = []
      }
      code.push({ x: line.x, y: line.y, height: line.height, text: line.text, page: pageIndex })
      return
    }
    closeCode()

    if (kind === 'callout-open') {
      closeCallout()
      const icon = LEADING_EMOJI.exec(line.text.trim())?.[0]
      callout = icon ? { kind: 'callout', icon, children: [] } : { kind: 'callout', children: [] }
      const [first, ...rest] = line.runs
      const title = normalizeRuns([
        { ...first!, text: first!.text.trimStart().replace(LEADING_EMOJI, '') },
        ...rest,
      ])
      // The line beside the icon is the callout's title, kept apart from its body.
      if (title.length > 0) push({ kind: 'paragraph', runs: title })
      return
    }

    if (callout && kind !== 'callout') closeCallout()

    if (open && continues(open, kind, line, step)) {
      // A heading is bold by being a heading; its runs carry no weight of their own.
      const heading = open.block.kind === 'heading'
      append(open.block, heading ? withoutBold(line.runs) : line.runs)
      open.lines++
      open.x = line.bodyX
      return
    }
    const block = newBlock(kind, line)
    push(block)
    open = { kind, block, x: line.bodyX, lines: 1 }
  }

  pages.forEach((page, pageIndex) => {
    const items: ({ y: number; line: Line } | { y: number; figure: FigureMark })[] = [
      ...page.lines.map((line) => ({ y: line.y, line })),
      ...page.figures.map((figure) => ({ y: figure.y, figure })),
    ].sort((a, b) => b.y - a.y)

    for (const item of items) {
      if ('figure' in item) {
        closeCallout()
        const { imageId, width, height } = item.figure
        out.push({ kind: 'figure', imageId, width, height })
        last = null
        continue
      }
      const next = page.lines[page.lines.indexOf(item.line) + 1]
      const kind = refine(classify(item.line, m, callout !== null), item.line, next, m)
      const step = last && last.page === pageIndex ? last.y - item.line.y : null
      handle(item.line, kind, step, pageIndex)
      last = { y: item.line.y, page: pageIndex }
    }
  })

  closeCallout()
  closeCode()
  return out
}
