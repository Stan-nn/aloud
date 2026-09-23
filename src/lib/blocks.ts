import { spokenIdentifier, spokenUrlsIn } from './parse/speakable'

/**
 * A document as structure rather than as a string. A block is something the
 * page lays out on its own — a heading, a paragraph, a code listing — and its
 * text is a list of runs, each carrying the styling it was written with.
 * The same runs are shown on screen and, sentence by sentence, turned into
 * what the voice says.
 */

export type Run = { text: string; bold?: true; italic?: true; code?: true }

export type TextBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'caption'; runs: Run[] }
  /** A "Label: value" line. The first run is the bold label. */
  | { kind: 'meta'; runs: Run[] }
  | { kind: 'list-item'; ordered?: number; runs: Run[] }

export type CodeBlock = { kind: 'code'; language?: string; text: string }

export type FigureBlock = {
  kind: 'figure'
  imageId: string
  width: number
  height: number
}

export type LeafBlock = TextBlock | CodeBlock | FigureBlock

/** A boxed aside. Callouts hold leaf blocks only; they never nest. */
export type CalloutBlock = { kind: 'callout'; icon?: string; children: LeafBlock[] }

export type Block = LeafBlock | CalloutBlock

export function plain(text: string): Run[] {
  return text ? [{ text }] : []
}

/**
 * Text that arrived as bare paragraphs — plain text, Word files, documents
 * saved before blocks existed. Blank paragraphs are kept so that block
 * indices match the old paragraph indices.
 */
export function paragraphsToBlocks(paragraphs: string[]): Block[] {
  return paragraphs.map((paragraph) => ({ kind: 'paragraph', runs: plain(paragraph) }))
}

export function isTextBlock(block: Block): block is TextBlock {
  return 'runs' in block
}

export function displayText(runs: Run[]): string {
  return runs.map((run) => run.text).join('')
}

export function sameStyle(a: Run, b: Run): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.code === !!b.code
}

const ZERO_WIDTH = /[​-‍⁠﻿]/g

/**
 * Collapse whitespace the way a browser would, but across run boundaries
 * too, so a space at the end of one run and the start of the next becomes
 * one space. Neighbouring runs of the same style merge; the ends are trimmed.
 */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const run of runs) {
    let text = run.text.replace(ZERO_WIDTH, '').replace(/\s+/g, ' ')
    const previous = out[out.length - 1]
    if (previous && previous.text.endsWith(' ') && text.startsWith(' ')) {
      text = text.slice(1)
    }
    if (!text) continue
    if (previous && sameStyle(previous, run)) previous.text += text
    else out.push({ ...run, text })
  }

  const first = out[0]
  if (first) first.text = first.text.replace(/^\s+/, '')
  const last = out[out.length - 1]
  if (last) last.text = last.text.replace(/\s+$/, '')
  return out.filter((run) => run.text.length > 0)
}

/**
 * What the voice says for [start, end) of a block's display text. Only a
 * code run is treated as an identifier, since the backticks are what mark it
 * as one; the rest is left as written apart from bare links.
 */
export function spokenSlice(runs: Run[], start: number, end: number): string {
  let position = 0
  let out = ''
  for (const run of runs) {
    const runStart = position
    const runEnd = position + run.text.length
    position = runEnd
    const from = Math.max(start, runStart)
    const to = Math.min(end, runEnd)
    if (from >= to) continue

    const piece = run.text.slice(from - runStart, to - runStart)
    if (run.code) {
      const [, before = '', body = '', after = ''] =
        /^(\s*)(.*?)(\s*)$/s.exec(piece) ?? []
      out += before + spokenIdentifier(body) + after
    } else {
      out += piece
    }
  }
  return spokenUrlsIn(out.replace(/\s+/g, ' ').trim())
}
