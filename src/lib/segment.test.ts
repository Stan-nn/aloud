import { describe, expect, test } from 'vitest'
import { segment, segmentBlocks, spokenParagraphs } from './segment'
import type { Block } from './blocks'

describe('segment', () => {
  test('splits a paragraph into its sentences', () => {
    const out = segment(['The bell rang. Everyone stood up.'])
    expect(out.map((s) => s.text)).toEqual([
      'The bell rang.',
      'Everyone stood up.',
    ])
  })

  test('numbers sentences sequentially across paragraphs', () => {
    const out = segment(['One. Two.', 'Three.'])
    expect(out.map((s) => s.id)).toEqual([0, 1, 2])
  })

  test('records which paragraph each sentence came from', () => {
    const out = segment(['One. Two.', 'Three.'])
    expect(out.map((s) => s.blockPath[0])).toEqual([0, 0, 1])
  })

  test('does not split on a title abbreviation', () => {
    const out = segment(['Dr. Smith went home. She was tired.'])
    expect(out.map((s) => s.text)).toEqual([
      'Dr. Smith went home.',
      'She was tired.',
    ])
  })

  test('does not split inside a decimal number', () => {
    const out = segment(['The fare was $3.50 exactly. He paid it.'])
    expect(out.map((s) => s.text)).toEqual([
      'The fare was $3.50 exactly.',
      'He paid it.',
    ])
  })

  test('does not split on a latin abbreviation mid-sentence', () => {
    const out = segment(['Bring fruit, e.g. apples, to the meeting.'])
    expect(out).toHaveLength(1)
  })

  test('keeps an ellipsis with its sentence', () => {
    const out = segment(['He paused... then spoke. It was over.'])
    expect(out.map((s) => s.text)).toEqual([
      'He paused... then spoke.',
      'It was over.',
    ])
  })

  test('keeps a closing quotation mark with its sentence', () => {
    const out = segment(['"Stop," she said. He stopped.'])
    expect(out[0].text).toBe('"Stop," she said.')
  })

  test('trims surrounding whitespace from each sentence', () => {
    const out = segment(['  Spaced out.   And again.  '])
    expect(out.map((s) => s.text)).toEqual(['Spaced out.', 'And again.'])
  })

  test('skips paragraphs that hold no words', () => {
    const out = segment(['Real text.', '   ', '', 'More text.'])
    expect(out.map((s) => s.text)).toEqual(['Real text.', 'More text.'])
  })

  test('keeps paragraph indices aligned with the input after skipping blanks', () => {
    const out = segment(['Real text.', '   ', 'More text.'])
    expect(out.map((s) => s.blockPath[0])).toEqual([0, 2])
  })

  test('treats a paragraph with no terminal punctuation as one sentence', () => {
    const out = segment(['A heading with no full stop'])
    expect(out.map((s) => s.text)).toEqual(['A heading with no full stop'])
  })

  test('returns nothing for an empty document', () => {
    expect(segment([])).toEqual([])
  })
})

describe('segmentBlocks', () => {
  const para = (...runs: { text: string; code?: true; bold?: true }[]): Block => ({
    kind: 'paragraph',
    runs,
  })

  test('points each sentence at its block and its range of display text', () => {
    const out = segmentBlocks([para({ text: 'One. Two.' })])
    expect(out.map((s) => [s.blockPath, s.start, s.end])).toEqual([
      [[0], 0, 4],
      [[0], 5, 9],
    ])
  })

  test('speaks a code chip as words while the range still covers what is shown', () => {
    const [sentence] = segmentBlocks([
      para({ text: 'The ' }, { text: 'parent_id', code: true }, { text: ' is kept.' }),
    ])
    expect(sentence!.text).toBe('The parent id is kept.')
    expect(sentence!.end).toBe('The parent_id is kept.'.length)
  })

  test('never splits a sentence inside a code chip', () => {
    const out = segmentBlocks([
      para({ text: 'Call ' }, { text: 'a. Then b', code: true }, { text: ' now. Done.' }),
    ])
    expect(out.map((s) => s.text)).toEqual(['Call a. Then b now.', 'Done.'])
  })

  test('reads a heading as one utterance without the section period', () => {
    const out = segmentBlocks([
      { kind: 'heading', level: 3, runs: [{ text: '13.16. Peek Projection' }] },
    ])
    expect(out.map((s) => s.text)).toEqual(['13.16 Peek Projection'])
  })

  test('reads a metadata line in its own sentences, so a bold "Note:" paragraph still splits', () => {
    const out = segmentBlocks([
      {
        kind: 'meta',
        runs: [{ text: 'Note', bold: true }, { text: ': this holds. It also runs on.' }],
      },
    ])
    expect(out.map((s) => s.text)).toEqual(['Note: this holds.', 'It also runs on.'])
  })

  test('announces a code block instead of reading it', () => {
    const out = segmentBlocks([
      { kind: 'code', language: 'tsx', text: 'const x = 1' },
      { kind: 'code', text: 'y' },
    ])
    expect(out.map((s) => [s.text, s.start, s.end])).toEqual([
      ['tsx code block.', 0, 11],
      ['Code block.', 0, 1],
    ])
  })

  test('gives a figure no sentence', () => {
    expect(
      segmentBlocks([{ kind: 'figure', imageId: 'x', width: 1, height: 1 }]),
    ).toEqual([])
  })

  test('addresses a callout child by a two-part path', () => {
    const out = segmentBlocks([
      para({ text: 'Before.' }),
      {
        kind: 'callout',
        icon: '⚠️',
        children: [{ kind: 'paragraph', runs: [{ text: 'Inside.' }] }],
      },
    ])
    expect(out.map((s) => s.blockPath)).toEqual([[0], [1, 0]])
  })

  test('skips a range with no words in it', () => {
    expect(segmentBlocks([para({ text: '⚠️' })])).toEqual([])
  })
})

describe('spokenParagraphs', () => {
  test('joins each block into one spoken paragraph', () => {
    expect(
      spokenParagraphs([
        { kind: 'paragraph', runs: [{ text: 'One. Two.' }] },
        { kind: 'code', text: 'x' },
      ]),
    ).toEqual(['One. Two.', 'Code block.'])
  })
})
