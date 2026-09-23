import { describe, expect, test } from 'vitest'
import { markdownBlocks, parseMarkdown, parsePlainText } from './text'

describe('parsePlainText', () => {
  test('splits on blank lines', () => {
    expect(parsePlainText('First para.\n\nSecond para.')).toEqual([
      'First para.',
      'Second para.',
    ])
  })

  test('joins a soft line break inside a paragraph', () => {
    expect(parsePlainText('One line\nand its continuation.')).toEqual([
      'One line and its continuation.',
    ])
  })

  test('tolerates windows line endings', () => {
    expect(parsePlainText('First.\r\n\r\nSecond.')).toEqual([
      'First.',
      'Second.',
    ])
  })

  test('returns nothing for an empty string', () => {
    expect(parsePlainText('')).toEqual([])
  })
})

describe('parseMarkdown', () => {
  test('keeps heading text without the hashes', () => {
    expect(parseMarkdown('## The Silent Revolution')).toEqual([
      'The Silent Revolution',
    ])
  })

  test('removes bold and italic markers', () => {
    expect(parseMarkdown('This is **bold** and *slanted*.')).toEqual([
      'This is bold and slanted.',
    ])
  })

  test('removes underscore emphasis', () => {
    expect(parseMarkdown('An _emphatic_ word.')).toEqual(['An emphatic word.'])
  })

  test('keeps the words of a link and drops its target', () => {
    expect(parseMarkdown('See [the report](https://example.com/r.pdf).')).toEqual(
      ['See the report.'],
    )
  })

  test('removes an image entirely', () => {
    expect(parseMarkdown('Before.\n\n![chart](c.png)\n\nAfter.')).toEqual([
      'Before.',
      'After.',
    ])
  })

  test('removes inline code backticks but keeps the code', () => {
    expect(parseMarkdown('Run `npm test` first.')).toEqual([
      'Run npm test first.',
    ])
  })

  test('does not read the contents of a fenced code block', () => {
    const src = 'Before.\n\n```js\nconst x = 1\n```\n\nAfter.'
    expect(parseMarkdown(src).join(' ')).not.toContain('const x = 1')
  })

  test('makes each bullet its own paragraph', () => {
    expect(parseMarkdown('- First item\n- Second item')).toEqual([
      'First item',
      'Second item',
    ])
  })

  test('makes each numbered item its own paragraph', () => {
    expect(parseMarkdown('1. First step\n2. Second step')).toEqual([
      'First step',
      'Second step',
    ])
  })

  test('removes the blockquote marker', () => {
    expect(parseMarkdown('> A quoted line.')).toEqual(['A quoted line.'])
  })

  test('drops a horizontal rule', () => {
    expect(parseMarkdown('Before.\n\n---\n\nAfter.')).toEqual([
      'Before.',
      'After.',
    ])
  })

  test('joins a soft line break inside a paragraph', () => {
    expect(parseMarkdown('A sentence that runs\nacross two lines.')).toEqual([
      'A sentence that runs across two lines.',
    ])
  })

  test('does not mistake a mid-word asterisk for emphasis', () => {
    expect(parseMarkdown('The 5 * 3 result.')).toEqual(['The 5 * 3 result.'])
  })
})

describe('parseMarkdown on technical documents', () => {
  test('keeps a numbered heading in one piece', () => {
    expect(parseMarkdown('## 1. Summary')).toEqual(['1 Summary'])
  })

  test('keeps a multi-level section number in one piece', () => {
    expect(parseMarkdown('### 13.16. Peek Projection')).toEqual([
      '13.16 Peek Projection',
    ])
  })

  test('leaves an unnumbered heading alone', () => {
    expect(parseMarkdown('## Summary')).toEqual(['Summary'])
  })

  test('does not strip a number that is part of the title', () => {
    expect(parseMarkdown('## osTicket 2.0 goals')).toEqual([
      'osTicket 2.0 goals',
    ])
  })

  test('removes HTML tags but keeps what they wrap', () => {
    expect(parseMarkdown('<aside>\n\nBe careful.\n\n</aside>')).toEqual([
      'Be careful.',
    ])
  })

  test('drops a figure reference written as a bare filename', () => {
    expect(parseMarkdown('Before.\n\n!diagram-one.svg\n\nAfter.')).toEqual([
      'Before.',
      'After.',
    ])
  })

  test('does not mistake an exclamation for a figure reference', () => {
    expect(parseMarkdown('That worked! Good.')).toEqual(['That worked! Good.'])
  })

  test('drops a line left with no words after stripping', () => {
    expect(parseMarkdown('Before.\n\n⚠️\n\nAfter.')).toEqual([
      'Before.',
      'After.',
    ])
  })

  test('says that a code block was skipped', () => {
    expect(parseMarkdown('Before.\n\n```\nx = 1\n```\n\nAfter.')).toEqual([
      'Before.',
      'Code block.',
      'After.',
    ])
  })

  test('names the language of a skipped code block', () => {
    expect(parseMarkdown('```tsx\nconst x = 1\n```')).toEqual([
      'tsx code block.',
    ])
  })

  test('speaks an identifier in inline code as words', () => {
    expect(parseMarkdown('The `parent_id` is stored.')).toEqual([
      'The parent id is stored.',
    ])
  })

  test('speaks a camelCase identifier as words', () => {
    expect(parseMarkdown('`entriesCount` counts both.')).toEqual([
      'entries Count counts both.',
    ])
  })

  test('reduces a bare link to its host', () => {
    expect(parseMarkdown('See https://example.com/a/b for details.')).toEqual([
      'See example.com for details.',
    ])
  })

  test('reads each table row with its column names', () => {
    const table = [
      '| Field | Owner |',
      '|---|---|',
      '| entriesCount | Comment Thread |',
      '| commentsCount | Current actor |',
    ].join('\n')
    expect(parseMarkdown(table)).toEqual([
      'Field: entriesCount. Owner: Comment Thread.',
      'Field: commentsCount. Owner: Current actor.',
    ])
  })

  test('does not read the table separator row', () => {
    const table = '| A | B |\n|---|---|\n| one | two |'
    expect(parseMarkdown(table).join(' ')).not.toContain('---')
  })

  test('leaves out a cell that is empty', () => {
    const table = '| A | B |\n|---|---|\n| one |  |'
    expect(parseMarkdown(table)).toEqual(['A: one.'])
  })

  test('speaks identifiers inside table cells', () => {
    const table = '| Field | Owner |\n|---|---|\n| `parent_id` | thread |'
    expect(parseMarkdown(table)).toEqual(['Field: parent id. Owner: thread.'])
  })

  test('treats pipes without a separator row as ordinary text', () => {
    expect(parseMarkdown('The | character is a pipe.')).toEqual([
      'The | character is a pipe.',
    ])
  })
})

describe('parseMarkdown on document metadata', () => {
  test('reads each labelled metadata line separately', () => {
    const header = '**Status**: Draft\n**Author**: Kim\n**Repo**: osTicket'
    expect(parseMarkdown(header)).toEqual([
      'Status: Draft',
      'Author: Kim',
      'Repo: osTicket',
    ])
  })

  test('does not split an ordinary sentence containing bold text', () => {
    expect(parseMarkdown('This is **bold** and it continues.')).toEqual([
      'This is bold and it continues.',
    ])
  })

  test('does not treat a bold phrase mid-sentence as a label', () => {
    expect(parseMarkdown('We agreed **the plan**: it ships Friday.')).toEqual([
      'We agreed the plan: it ships Friday.',
    ])
  })
})

describe('markdownBlocks', () => {
  test('keeps the heading level', () => {
    expect(markdownBlocks('# T\n\n## 1. Summary\n\n### 2.1. Sub\n\n#### Deep')).toEqual([
      { kind: 'heading', level: 1, runs: [{ text: 'T' }] },
      { kind: 'heading', level: 2, runs: [{ text: '1. Summary' }] },
      { kind: 'heading', level: 3, runs: [{ text: '2.1. Sub' }] },
      { kind: 'heading', level: 3, runs: [{ text: 'Deep' }] },
    ])
  })

  test('turns a labelled line into a metadata block', () => {
    expect(markdownBlocks('**Status**: Draft')).toEqual([
      { kind: 'meta', runs: [{ text: 'Status', bold: true }, { text: ': Draft' }] },
    ])
  })

  test('keeps a code block with its contents and language', () => {
    expect(markdownBlocks('```tsx\nconst x = 1\n  y()\n```')).toEqual([
      { kind: 'code', language: 'tsx', text: 'const x = 1\n  y()' },
    ])
  })

  test('makes list items, numbered ones keeping their number', () => {
    expect(markdownBlocks('- a\n- b\n\n3. c')).toEqual([
      { kind: 'list-item', runs: [{ text: 'a' }] },
      { kind: 'list-item', runs: [{ text: 'b' }] },
      { kind: 'list-item', ordered: 3, runs: [{ text: 'c' }] },
    ])
  })

  test('turns an aside into a callout whose lone emoji is its icon', () => {
    expect(
      markdownBlocks(
        '<aside>\n⚠️\n\n**Work in Progress**\n\nBody `x`.\n\n</aside>\n\nAfter.',
      ),
    ).toEqual([
      {
        kind: 'callout',
        icon: '⚠️',
        children: [
          { kind: 'paragraph', runs: [{ text: 'Work in Progress', bold: true }] },
          {
            kind: 'paragraph',
            runs: [{ text: 'Body ' }, { text: 'x', code: true }, { text: '.' }],
          },
        ],
      },
      { kind: 'paragraph', runs: [{ text: 'After.' }] },
    ])
  })

  test('makes an italic figure line a caption', () => {
    expect(markdownBlocks('*Figure 1 — The drawer.*')).toEqual([
      { kind: 'caption', runs: [{ text: 'Figure 1 — The drawer.', italic: true }] },
    ])
  })

  test('keeps inline code as a code run', () => {
    expect(markdownBlocks('The `parent_id` is stored.')).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'The ' }, { text: 'parent_id', code: true }, { text: ' is stored.' }],
      },
    ])
  })
})
