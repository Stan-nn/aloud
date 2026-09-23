import { linesToParagraphs, normalizeWhitespace } from './clean'
import { spokenIdentifier, spokenUrlsIn } from './speakable'
import {
  displayText,
  plain,
  type Block,
  type CalloutBlock,
  type LeafBlock,
} from '../blocks'
import { spokenParagraphs } from '../segment'
import { inlineRuns } from './inline'

function splitLines(source: string): string[] {
  return source.replace(/\r\n?/g, '\n').split('\n')
}

export function parsePlainText(source: string): string[] {
  return linesToParagraphs(splitLines(source))
    .map((paragraph) => spokenUrlsIn(normalizeWhitespace(paragraph)))
    .filter(hasWords)
}

/**
 * Markdown is written to be looked at, and a good deal of it is not worth
 * hearing. Headings, emphasis and link targets are stripped back to their
 * words; images and rules are dropped; code blocks are replaced by a short
 * spoken marker so the listener knows something was passed over rather than
 * lost. Each list item and table row becomes its own paragraph so the reader
 * pauses between them.
 */

const FENCE = /^\s*(```|~~~)\s*([A-Za-z0-9+#-]*)/
const HORIZONTAL_RULE = /^\s*([-*_])\s*(\1\s*){2,}$/
const HEADING = /^\s*(#{1,6})\s+/
const BLOCKQUOTE = /^\s*>\s?/
const BULLET = /^\s*[-*+]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/** A figure written as a bare filename, e.g. "!diagram-one.svg". */
const BARE_IMAGE = /^\s*!\s*[\w./-]+\.(svg|png|jpe?g|gif|webp)\s*$/i

const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>/g

/**
 * A specification header is a run of "**Label**: value" lines. They soft-wrap
 * into one another otherwise, and are read as a single run-on sentence.
 */
const METADATA_LINE = /^\s*\*\*[^*\n]+\*\*\s*:/

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|(\s*:?-{2,}:?\s*\|)+\s*$/

const BOLD = /\*\*(?=\S)([\s\S]*?\S)\*\*/g
const ITALIC_STAR = /(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g
const ITALIC_UNDERSCORE = /(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g
const INLINE_CODE = /`([^`\n]+)`/g
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g
const LINK = /\[([^\]]*)\]\([^)]*\)/g

/** Anything with no letter or digit left in it has nothing to say. */
function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

function stripInline(text: string): string {
  return text
    .replace(IMAGE, '')
    .replace(LINK, '$1')
    .replace(INLINE_CODE, (_, code: string) => spokenIdentifier(code))
    .replace(BOLD, '$1')
    .replace(ITALIC_STAR, '$1')
    .replace(ITALIC_UNDERSCORE, '$1')
    .replace(HTML_TAG, ' ')
}

function speakable(text: string): string {
  return spokenUrlsIn(normalizeWhitespace(stripInline(text)))
}

function tableCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/**
 * A table read straight out loud is a stream of pipes. Pairing each cell with
 * its column name turns a row into a sentence a listener can follow.
 */
function spokenTableRow(headers: string[], row: string): string {
  const cells = tableCells(row)
  const parts: string[] = []

  cells.forEach((cell, i) => {
    const value = speakable(cell)
    if (!hasWords(value)) return
    const header = speakable(headers[i] ?? '')
    parts.push(hasWords(header) ? `${header}: ${value}.` : `${value}.`)
  })

  return parts.join(' ')
}

const ASIDE_OPEN = /^\s*<aside>\s*$/i
const ASIDE_CLOSE = /^\s*<\/aside>\s*$/i
const FIGURE_CAPTION = /^Figure\s+\d+/

/**
 * Markdown as blocks. Headings keep their level, "**Label**:" lines become
 * metadata, list items and table rows stand alone, a fenced block keeps its
 * contents for the screen, and an <aside> becomes a callout.
 */
export function markdownBlocks(source: string): Block[] {
  const lines = splitLines(source)
  const blocks: Block[] = []
  let callout: CalloutBlock | null = null
  let current: string[] = []
  let listItem: { ordered?: number } | null = null
  let fence: { language?: string; lines: string[] } | null = null

  const add = (block: LeafBlock) => {
    if (callout) callout.children.push(block)
    else blocks.push(block)
  }

  const flush = () => {
    if (current.length === 0) return
    const runs = inlineRuns(current.join(' '))
    const item = listItem
    current = []
    listItem = null

    const text = displayText(runs)
    if (!hasWords(text)) {
      // A lone emoji at the top of an aside is the callout's icon.
      if (callout && callout.children.length === 0 && !callout.icon && text) {
        callout.icon = text
      }
      return
    }

    if (item) add({ kind: 'list-item', ...item, runs })
    else if (runs.every((run) => run.italic) && FIGURE_CAPTION.test(text)) {
      add({ kind: 'caption', runs })
    } else add({ kind: 'paragraph', runs })
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!

    const fenceMatch = FENCE.exec(raw)
    if (fenceMatch) {
      if (fence === null) {
        flush()
        const language = fenceMatch[2]?.trim()
        fence = language ? { language, lines: [] } : { lines: [] }
      } else {
        add({
          kind: 'code',
          ...(fence.language ? { language: fence.language } : {}),
          text: fence.lines.join('\n'),
        })
        fence = null
      }
      continue
    }
    if (fence) {
      fence.lines.push(raw)
      continue
    }

    if (ASIDE_OPEN.test(raw)) {
      flush()
      callout = { kind: 'callout', children: [] }
      continue
    }
    if (ASIDE_CLOSE.test(raw)) {
      flush()
      if (callout && callout.children.length > 0) blocks.push(callout)
      callout = null
      continue
    }

    if (!raw.trim() || HORIZONTAL_RULE.test(raw) || BARE_IMAGE.test(raw)) {
      flush()
      continue
    }

    // A table is only a table when a separator row follows the header.
    if (TABLE_ROW.test(raw) && TABLE_SEPARATOR.test(lines[i + 1] ?? '')) {
      flush()
      const headers = tableCells(raw)
      i++ // step over the separator
      while (i + 1 < lines.length && TABLE_ROW.test(lines[i + 1]!)) {
        const row = spokenTableRow(headers, lines[++i]!)
        if (hasWords(row)) add({ kind: 'paragraph', runs: plain(row) })
      }
      continue
    }

    const heading = HEADING.exec(raw)
    if (heading) {
      flush()
      const runs = inlineRuns(raw.slice(heading[0].length))
      const level = Math.min(heading[1]!.length, 3) as 1 | 2 | 3
      if (hasWords(displayText(runs))) add({ kind: 'heading', level, runs })
      continue
    }

    if (METADATA_LINE.test(raw)) {
      flush()
      add({ kind: 'meta', runs: inlineRuns(raw) })
      continue
    }

    const numbered = /^\s*(\d+)[.)]\s+/.exec(raw)
    if (BULLET.test(raw) || numbered) {
      flush()
      listItem = numbered ? { ordered: Number(numbered[1]) } : {}
      current.push(raw.replace(BULLET, '').replace(NUMBERED, ''))
      continue
    }

    current.push(raw.replace(BLOCKQUOTE, ''))
  }

  flush()
  if (callout && callout.children.length > 0) blocks.push(callout)
  return blocks
}

/** What gets read aloud, one string per block. */
export function parseMarkdown(source: string): string[] {
  return spokenParagraphs(markdownBlocks(source))
}
