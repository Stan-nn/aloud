import { describe, expect, test } from 'vitest'
import { displayText, normalizeRuns, paragraphsToBlocks, spokenSlice } from './blocks'

describe('normalizeRuns', () => {
  test('merges neighbours of the same style', () => {
    expect(normalizeRuns([{ text: 'one ' }, { text: 'two' }])).toEqual([
      { text: 'one two' },
    ])
  })

  test('collapses whitespace across a seam between styles', () => {
    expect(
      normalizeRuns([{ text: 'Status ', bold: true }, { text: '  : x' }]),
    ).toEqual([{ text: 'Status ', bold: true }, { text: ': x' }])
  })

  test('trims the ends and drops runs left empty', () => {
    expect(normalizeRuns([{ text: '  ' }, { text: ' hi ', code: true }])).toEqual([
      { text: 'hi', code: true },
    ])
  })

  test('removes zero-width characters', () => {
    expect(normalizeRuns([{ text: 'a​b' }])).toEqual([{ text: 'ab' }])
  })
})

describe('spokenSlice', () => {
  const runs = [
    { text: 'The ' },
    { text: 'parent_id', code: true as const },
    { text: ' is kept.' },
  ]

  test('speaks an identifier in a code run as words', () => {
    expect(spokenSlice(runs, 0, displayText(runs).length)).toBe(
      'The parent id is kept.',
    )
  })

  test('speaks only the requested range', () => {
    expect(spokenSlice(runs, 4, 13)).toBe('parent id')
  })

  test('reduces a bare link to its host', () => {
    const link = [{ text: 'See https://example.com/a/b now.' }]
    expect(spokenSlice(link, 0, 32)).toBe('See example.com now.')
  })
})

describe('paragraphsToBlocks', () => {
  test('keeps one block per paragraph, blank ones included, so indices line up', () => {
    expect(paragraphsToBlocks(['One.', '   '])).toEqual([
      { kind: 'paragraph', runs: [{ text: 'One.' }] },
      { kind: 'paragraph', runs: [{ text: '   ' }] },
    ])
  })
})
