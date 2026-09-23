import { describe, expect, test } from 'vitest'
import { inlineRuns } from './inline'

describe('inlineRuns', () => {
  test('marks bold and italic', () => {
    expect(inlineRuns('This is **bold** and *slanted*.')).toEqual([
      { text: 'This is ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'slanted', italic: true },
      { text: '.' },
    ])
  })

  test('keeps inline code literally, without reading emphasis inside it', () => {
    expect(inlineRuns('Use `a_b_c` and `**x**`.')).toEqual([
      { text: 'Use ' },
      { text: 'a_b_c', code: true },
      { text: ' and ' },
      { text: '**x**', code: true },
      { text: '.' },
    ])
  })

  test('keeps the words of a link and drops its target', () => {
    expect(inlineRuns('See [the report](https://x.io/r).')).toEqual([
      { text: 'See the report.' },
    ])
  })

  test('drops an image', () => {
    expect(inlineRuns('A ![chart](c.png) B')).toEqual([{ text: 'A B' }])
  })

  test('does not mistake a spaced asterisk for emphasis', () => {
    expect(inlineRuns('The 5 * 3 result.')).toEqual([{ text: 'The 5 * 3 result.' }])
  })

  test('removes HTML tags but keeps what they wrap', () => {
    expect(inlineRuns('<b>hi</b> there')).toEqual([{ text: 'hi there' }])
  })

  test('puts bold inside a label run for a metadata line', () => {
    expect(inlineRuns('**Status**: Exploration (WIP)')).toEqual([
      { text: 'Status', bold: true },
      { text: ': Exploration (WIP)' },
    ])
  })
})
