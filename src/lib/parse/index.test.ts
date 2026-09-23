import { describe, expect, test } from 'vitest'
import { countWords, sourceForFilename, titleForFilename } from './index'

describe('titleForFilename', () => {
  test('drops the extension', () => {
    expect(titleForFilename('Annual Report.pdf')).toBe('Annual Report')
  })

  test('turns underscores and hyphens into spaces', () => {
    expect(titleForFilename('annual_report-2025.docx')).toBe(
      'annual report 2025',
    )
  })

  test('keeps a name that has no extension', () => {
    expect(titleForFilename('README')).toBe('README')
  })

  test('keeps dots inside the name', () => {
    expect(titleForFilename('v1.2 notes.md')).toBe('v1.2 notes')
  })

  test('falls back for a file with no name', () => {
    expect(titleForFilename('')).toBe('Untitled')
  })
})

describe('sourceForFilename', () => {
  test.each([
    ['report.pdf', 'pdf'],
    ['report.PDF', 'pdf'],
    ['notes.docx', 'docx'],
    ['notes.md', 'md'],
    ['notes.markdown', 'md'],
    ['notes.txt', 'txt'],
  ])('recognises %s', (name, expected) => {
    expect(sourceForFilename(name)).toBe(expected)
  })

  test('returns nothing for a type it cannot read', () => {
    expect(sourceForFilename('slides.pptx')).toBeNull()
  })

  test('returns nothing for a file with no extension', () => {
    expect(sourceForFilename('README')).toBeNull()
  })

  test('does not mistake an old Word file for a readable one', () => {
    expect(sourceForFilename('legacy.doc')).toBeNull()
  })
})

describe('countWords', () => {
  test('counts the words across paragraphs', () => {
    expect(countWords(['One two three.', 'Four five.'])).toBe(5)
  })

  test('is not fooled by extra spacing', () => {
    expect(countWords(['  One   two  '])).toBe(2)
  })

  test('counts nothing in an empty document', () => {
    expect(countWords([])).toBe(0)
  })

  test('counts nothing in a blank paragraph', () => {
    expect(countWords(['   '])).toBe(0)
  })
})
