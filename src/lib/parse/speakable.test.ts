import { describe, expect, test } from 'vitest'
import { spokenIdentifier, spokenUrlsIn } from './speakable'

describe('spokenIdentifier', () => {
  test('separates a snake_case name', () => {
    expect(spokenIdentifier('parent_id')).toBe('parent id')
  })

  test('separates a camelCase name', () => {
    expect(spokenIdentifier('commentThread')).toBe('comment Thread')
  })

  test('separates a PascalCase name', () => {
    expect(spokenIdentifier('CommentThreadData')).toBe('Comment Thread Data')
  })

  test('separates a kebab-case name', () => {
    expect(spokenIdentifier('thread-entry')).toBe('thread entry')
  })

  test('keeps a run of capitals together', () => {
    expect(spokenIdentifier('HTTPResponse')).toBe('HTTP Response')
  })

  test('keeps a trailing acronym together', () => {
    expect(spokenIdentifier('entryID')).toBe('entry ID')
  })

  test('leaves an ordinary word alone', () => {
    expect(spokenIdentifier('comment')).toBe('comment')
  })

  test('keeps digits attached to their word', () => {
    expect(spokenIdentifier('utf8Encoder')).toBe('utf8 Encoder')
  })

  test('leaves a path alone rather than pulling it apart', () => {
    expect(spokenIdentifier('/tickets/{ticket}/thread')).toBe(
      '/tickets/{ticket}/thread',
    )
  })

  test('leaves a command alone', () => {
    expect(spokenIdentifier('npm run dev')).toBe('npm run dev')
  })

  test('leaves a dotted expression alone', () => {
    expect(spokenIdentifier('summary.entriesCount')).toBe(
      'summary.entriesCount',
    )
  })

  test('leaves an empty string alone', () => {
    expect(spokenIdentifier('')).toBe('')
  })
})

describe('spokenUrlsIn', () => {
  test('reduces a bare link to its host', () => {
    expect(spokenUrlsIn('See https://example.com/rfd/actions for more.')).toBe(
      'See example.com for more.',
    )
  })

  test('drops a leading www', () => {
    expect(spokenUrlsIn('Visit http://www.example.com/x today.')).toBe(
      'Visit example.com today.',
    )
  })

  test('handles several links in one sentence', () => {
    expect(spokenUrlsIn('Both https://a.com/1 and https://b.org/2 apply.')).toBe(
      'Both a.com and b.org apply.',
    )
  })

  test('does not swallow the punctuation after a link', () => {
    expect(spokenUrlsIn('Read https://example.com/a, then stop.')).toBe(
      'Read example.com, then stop.',
    )
  })

  test('leaves text without links alone', () => {
    expect(spokenUrlsIn('Nothing to see here.')).toBe('Nothing to see here.')
  })
})
