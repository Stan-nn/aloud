import { describe, expect, test } from 'vitest'
import { groupIntoLines, pageToLines } from './pdf'
import type { PlacedText } from './pdf'

const at = (str: string, x: number, y: number, width?: number): PlacedText => ({
  str,
  x,
  y,
  width,
})

describe('groupIntoLines', () => {
  test('joins pieces that sit on the same line', () => {
    expect(
      groupIntoLines([at('The board', 72, 700), at('convened', 140, 700)]),
    ).toEqual(['The board convened'])
  })

  test('orders pieces on a line from left to right', () => {
    expect(
      groupIntoLines([at('second', 200, 700), at('first', 72, 700)]),
    ).toEqual(['first second'])
  })

  test('reads lines down the page, since PDF y counts upward', () => {
    expect(
      groupIntoLines([at('lower', 72, 600), at('upper', 72, 700)]),
    ).toEqual(['upper', 'lower'])
  })

  test('treats a hair of vertical jitter as the same line', () => {
    expect(
      groupIntoLines([at('same', 72, 700), at('line', 140, 700.4)]),
    ).toEqual(['same line'])
  })

  test('treats a full line step as a new line', () => {
    expect(
      groupIntoLines([at('first', 72, 700), at('second', 72, 686)]),
    ).toEqual(['first', 'second'])
  })

  test('does not double the space when a piece already ends with one', () => {
    expect(
      groupIntoLines([at('The board ', 72, 700), at('convened', 140, 700)]),
    ).toEqual(['The board convened'])
  })

  test('ignores pieces that carry no text', () => {
    expect(
      groupIntoLines([at('text', 72, 700), at('   ', 140, 700)]),
    ).toEqual(['text'])
  })

  test('returns nothing for a page with no text', () => {
    expect(groupIntoLines([])).toEqual([])
  })

  test('does not insert a space between glyph runs of one word', () => {
    // pdf.js often splits a single word into several runs. Joining those with
    // a space turns "thin" into "th in".
    expect(groupIntoLines([at('th', 72, 700, 8), at('in', 80, 700, 8)])).toEqual(
      ['thin'],
    )
  })

  test('still separates words that have a gap between them', () => {
    expect(
      groupIntoLines([at('The', 72, 700, 18), at('board', 95, 700, 30)]),
    ).toEqual(['The board'])
  })

  test('does not put a space before punctuation that follows a word', () => {
    expect(
      groupIntoLines([at('Confessions', 72, 700, 60), at(',', 132, 700, 3)]),
    ).toEqual(['Confessions,'])
  })

  test('falls back to a space when the width is unknown', () => {
    expect(groupIntoLines([at('The', 72, 700), at('board', 95, 700)])).toEqual([
      'The board',
    ])
  })

  test('keeps a blank line between paragraphs as a gap, not a line', () => {
    // A larger-than-normal vertical step still produces two lines, not three.
    expect(
      groupIntoLines([at('para one', 72, 700), at('para two', 72, 640)]),
    ).toEqual(['para one', 'para two'])
  })
})

describe('pageToLines', () => {
  const column = (texts: string[], step: number): PlacedText[] =>
    texts.map((t, i) => at(t, 72, 700 - i * step))

  test('leaves evenly spaced lines unbroken', () => {
    expect(pageToLines(column(['one', 'two', 'three'], 14))).toEqual([
      'one',
      'two',
      'three',
    ])
  })

  test('marks a paragraph break where the step grows', () => {
    const items = [
      at('first para line one', 72, 700),
      at('first para line two', 72, 686),
      at('second para begins', 72, 650),
      at('second para continues', 72, 636),
    ]
    expect(pageToLines(items)).toEqual([
      'first para line one',
      'first para line two',
      '',
      'second para begins',
      'second para continues',
    ])
  })

  test('does not break on a slightly looser line', () => {
    const items = [
      at('one', 72, 700),
      at('two', 72, 686),
      at('three', 72, 670),
      at('four', 72, 656),
    ]
    expect(pageToLines(items)).not.toContain('')
  })

  test('handles a page holding a single line', () => {
    expect(pageToLines([at('alone', 72, 700)])).toEqual(['alone'])
  })

  test('handles a page with nothing on it', () => {
    expect(pageToLines([])).toEqual([])
  })
})
