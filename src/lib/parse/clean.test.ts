import { describe, expect, test } from 'vitest'
import {
  dropRunningHeaders,
  joinHyphenatedLines,
  linesToParagraphs,
  normalizeWhitespace,
} from './clean'

describe('joinHyphenatedLines', () => {
  test('rejoins a word broken across a line end', () => {
    expect(joinHyphenatedLines(['an attrac-', 'tive proposal'])).toEqual([
      'an attractive proposal',
    ])
  })

  test('leaves a hyphenated compound alone when the line ends a phrase', () => {
    expect(joinHyphenatedLines(['a well-known fact', 'was cited'])).toEqual([
      'a well-known fact',
      'was cited',
    ])
  })

  test('does not join when the next line starts a new sentence', () => {
    expect(joinHyphenatedLines(['the budget -', 'The board agreed'])).toEqual([
      'the budget -',
      'The board agreed',
    ])
  })

  test('rejoins a run of three broken lines', () => {
    expect(joinHyphenatedLines(['inter-', 'nation-', 'al law'])).toEqual([
      'international law',
    ])
  })

  test('leaves an em dash at a line end alone', () => {
    expect(joinHyphenatedLines(['he paused —', 'then spoke'])).toEqual([
      'he paused —',
      'then spoke',
    ])
  })
})

describe('dropRunningHeaders', () => {
  const page = (header: string, body: string, footer: string) => [
    header,
    body,
    footer,
  ]

  test('removes a header that repeats on every page', () => {
    const pages = [
      page('Annual Report 2025', 'First page body.', 'Page 1'),
      page('Annual Report 2025', 'Second page body.', 'Page 2'),
      page('Annual Report 2025', 'Third page body.', 'Page 3'),
    ]
    expect(dropRunningHeaders(pages).flat()).toEqual([
      'First page body.',
      'Second page body.',
      'Third page body.',
    ])
  })

  test('removes a running footer whose only difference is the page number', () => {
    const pages = [
      page('Annual Report 2025', 'First page body.', 'Page 1'),
      page('Annual Report 2025', 'Second page body.', 'Page 2'),
      page('Annual Report 2025', 'Third page body.', 'Page 3'),
    ]
    expect(dropRunningHeaders(pages).flat()).not.toContain('Page 2')
  })

  test('removes a bare page number in the margin', () => {
    const pages = [
      page('Head', 'First page body.', '1'),
      page('Head', 'Second page body.', '2'),
      page('Head', 'Third page body.', '3'),
    ]
    expect(dropRunningHeaders(pages).flat()).toEqual([
      'First page body.',
      'Second page body.',
      'Third page body.',
    ])
  })

  test('keeps a line that appears on only one page', () => {
    const pages = [
      page('Annual Report 2025', 'Body one.', 'Page 1'),
      page('Annual Report 2025', 'A unique aside.', 'Page 2'),
      page('Annual Report 2025', 'Body three.', 'Page 3'),
    ]
    expect(dropRunningHeaders(pages).flat()).toContain('A unique aside.')
  })

  test('keeps a repeated line that sits in the body rather than the margins', () => {
    const pages = [
      ['Head A', 'x', 'x', 'The refrain repeats.', 'x', 'x', 'Foot A'],
      ['Head B', 'x', 'x', 'The refrain repeats.', 'x', 'x', 'Foot B'],
      ['Head C', 'x', 'x', 'The refrain repeats.', 'x', 'x', 'Foot C'],
    ]
    const out = dropRunningHeaders(pages).flat()
    expect(out.filter((l) => l === 'The refrain repeats.')).toHaveLength(3)
  })

  test('does not strip anything from a document of one or two pages', () => {
    const pages = [
      page('Same Header', 'Body one.', 'Page 1'),
      page('Same Header', 'Body two.', 'Page 2'),
    ]
    expect(dropRunningHeaders(pages).flat()).toContain('Same Header')
  })

  test('treats a header as repeating even when its page number changes', () => {
    const pages = [
      page('Chapter 4 — 1', 'Body one.', ''),
      page('Chapter 4 — 2', 'Body two.', ''),
      page('Chapter 4 — 3', 'Body three.', ''),
    ]
    const out = dropRunningHeaders(pages).flat()
    expect(out.some((l) => l.startsWith('Chapter 4'))).toBe(false)
  })
})

describe('linesToParagraphs', () => {
  test('starts a new paragraph at a blank line', () => {
    expect(
      linesToParagraphs(['One line.', 'Still one.', '', 'A second one.']),
    ).toEqual(['One line. Still one.', 'A second one.'])
  })

  test('collapses several blank lines into a single break', () => {
    expect(linesToParagraphs(['First.', '', '', '', 'Second.'])).toEqual([
      'First.',
      'Second.',
    ])
  })

  test('returns nothing when every line is blank', () => {
    expect(linesToParagraphs(['', '   ', ''])).toEqual([])
  })
})

describe('normalizeWhitespace', () => {
  test('collapses runs of spaces', () => {
    expect(normalizeWhitespace('too     many   spaces')).toBe(
      'too many spaces',
    )
  })

  test('turns a non-breaking space into an ordinary one', () => {
    expect(normalizeWhitespace('a b')).toBe('a b')
  })

  test('removes zero-width characters', () => {
    expect(normalizeWhitespace('in​visible')).toBe('invisible')
  })

  test('trims the ends', () => {
    expect(normalizeWhitespace('  padded  ')).toBe('padded')
  })
})
