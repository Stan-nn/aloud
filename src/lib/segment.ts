import {
  displayText,
  paragraphsToBlocks,
  spokenSlice,
  type Block,
  type LeafBlock,
  type Run,
} from './blocks'

export type Sentence = {
  id: number
  /** Index of the owning block; two indices when it sits inside a callout. */
  blockPath: number[]
  /** The sentence's range within its block's display text. */
  start: number
  end: number
  /** What the voice says. */
  text: string
}

/**
 * Abbreviations that end in a period but do not end a sentence.
 * Intl.Segmenter already gets decimals, "e.g." and ellipses right; the
 * boundary it reports wrongly is a capitalised title followed by a name.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'rev', 'hon', 'st',
  'sr', 'jr', 'gen', 'col', 'capt', 'lt', 'sgt', 'pres',
  'inc', 'ltd', 'co', 'corp', 'dept', 'est',
  'vs', 'approx', 'fig', 'eq', 'vol', 'no', 'pp', 'cf', 'al',
])

const TRAILING_WORD = /(\p{L}+)\.\s*$/u

function endsWithAbbreviation(text: string): boolean {
  const match = TRAILING_WORD.exec(text)
  return match !== null && ABBREVIATIONS.has(match[1]!.toLowerCase())
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

const HAS_WORDS = /[\p{L}\p{N}]/u

/**
 * A section number ends in a period that is not the end of a sentence.
 * Dropping just that period keeps "13.16. Peek Projection" as one utterance
 * instead of "thirteen point sixteen." followed by "Peek Projection".
 */
const SECTION_NUMBER = /^(\d+(?:\.\d+)*)\.\s+/

type Range = [number, number]

function trimRange(text: string, start: number, end: number): Range {
  while (start < end && /\s/.test(text[start]!)) start++
  while (end > start && /\s/.test(text[end - 1]!)) end--
  return [start, end]
}

function codeSpans(runs: Run[]): Range[] {
  const spans: Range[] = []
  let position = 0
  for (const run of runs) {
    if (run.code) spans.push([position, position + run.text.length])
    position += run.text.length
  }
  return spans
}

function sentenceRanges(text: string, runs: Run[]): Range[] {
  const ranges: Range[] = []
  for (const { segment, index } of segmenter.segment(text)) {
    const previous = ranges[ranges.length - 1]
    // Rejoin a piece the segmenter split off at an abbreviation's period.
    if (previous && endsWithAbbreviation(text.slice(previous[0], previous[1]))) {
      previous[1] = index + segment.length
    } else {
      ranges.push([index, index + segment.length])
    }
  }

  // An identifier is one thing even when it contains ". ", so a boundary
  // that falls inside a code run joins the sentences either side of it.
  const spans = codeSpans(runs)
  const joined: Range[] = []
  for (const range of ranges) {
    const previous = joined[joined.length - 1]
    const splitsCode =
      previous !== undefined &&
      spans.some(([start, end]) => previous[1] > start && previous[1] < end)
    if (splitsCode) previous![1] = range[1]
    else joined.push([range[0], range[1]])
  }

  return joined
    .map(([start, end]) => trimRange(text, start, end))
    .filter(([start, end]) => end > start)
}

type Piece = { start: number; end: number; text: string }

function blockSentences(block: LeafBlock): Piece[] {
  switch (block.kind) {
    case 'figure':
      return []
    case 'code':
      return [
        {
          start: 0,
          end: block.text.length,
          text: block.language ? `${block.language} code block.` : 'Code block.',
        },
      ]
    default: {
      const display = displayText(block.runs)
      // A heading is read in one breath however it is punctuated. A metadata
      // line is not: a bold "Note:" can open a whole paragraph.
      const ranges = block.kind === 'heading'
        ? [trimRange(display, 0, display.length)]
        : sentenceRanges(display, block.runs)

      return ranges
        .map(([start, end]) => {
          let text = spokenSlice(block.runs, start, end)
          if (block.kind === 'heading') text = text.replace(SECTION_NUMBER, '$1 ')
          return { start, end, text }
        })
        .filter((piece) => HAS_WORDS.test(piece.text))
    }
  }
}

export function segmentBlocks(blocks: Block[]): Sentence[] {
  const sentences: Sentence[] = []
  const add = (block: LeafBlock, blockPath: number[]) => {
    for (const piece of blockSentences(block)) {
      sentences.push({ id: sentences.length, blockPath, ...piece })
    }
  }

  blocks.forEach((block, i) => {
    if (block.kind === 'callout') {
      block.children.forEach((child, j) => add(child, [i, j]))
    } else {
      add(block, [i])
    }
  })
  return sentences
}

/** Bare paragraphs, as plain text and pre-block documents arrive. */
export function segment(paragraphs: string[]): Sentence[] {
  return segmentBlocks(paragraphsToBlocks(paragraphs))
}

/** Everything the voice will say, one string per block — for word counts and tests. */
export function spokenParagraphs(blocks: Block[]): string[] {
  const out: string[] = []
  let key: string | null = null
  for (const sentence of segmentBlocks(blocks)) {
    const path = sentence.blockPath.join('.')
    if (path === key) out[out.length - 1] += ` ${sentence.text}`
    else out.push(sentence.text)
    key = path
  }
  return out
}
