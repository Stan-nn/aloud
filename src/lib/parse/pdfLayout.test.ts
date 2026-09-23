import { describe, expect, test } from 'vitest'
import {
  buildBlocks,
  structureRatio,
  styledLines,
  type Line,
  type PageContent,
  type StyledPiece,
} from './pdfLayout'

type Options = Partial<Omit<StyledPiece, 'str' | 'x' | 'y'>>

/** One piece per word, laid out left to right with a normal word gap. */
function words(text: string, x: number, y: number, options: Options = {}): StyledPiece[] {
  const height = options.height ?? 12
  const charWidth = options.mono ? 0.6 * height : 6
  const pieces: StyledPiece[] = []
  let left = x
  for (const word of text.split(' ')) {
    const width = word.length * charWidth
    pieces.push({
      str: word,
      x: left,
      y,
      width,
      height,
      bold: false,
      italic: false,
      mono: false,
      ...options,
    })
    left += width + charWidth
  }
  return pieces
}

const glyph = (str: string, x: number, y: number, width: number, height: number): StyledPiece => ({
  str,
  x,
  y,
  width,
  height,
  bold: false,
  italic: false,
  mono: false,
})

describe('styledLines', () => {
  test('joins the words on a baseline into one plain run', () => {
    const [line] = styledLines(words('The board convened', 72, 700))
    expect(line!.text).toBe('The board convened')
    expect(line!.runs).toEqual([{ text: 'The board convened' }])
    expect(line!.x).toBe(72)
  })

  test('reads lines top to bottom', () => {
    const lines = styledLines([...words('lower', 72, 600), ...words('upper', 72, 700)])
    expect(lines.map((l) => l.text)).toEqual(['upper', 'lower'])
  })

  test('keeps a bold label apart from a regular value that touches it', () => {
    const pieces = [
      ...words('Status', 72, 700, { bold: true }),
      glyph(':', 108, 700, 4, 12),
      ...words('Draft', 118, 700),
    ]
    expect(styledLines(pieces)[0]!.runs).toEqual([
      { text: 'Status', bold: true },
      { text: ': Draft' },
    ])
  })

  test('keeps an inline code chip on its line though its baseline sits lower', () => {
    const pieces = [
      ...words('The', 72, 700),
      ...words('commentThread', 100, 699, { mono: true, height: 8.3 }),
      ...words('owns', 170, 700),
    ]
    const [line] = styledLines(pieces)
    expect(line!.runs).toEqual([
      { text: 'The ' },
      { text: 'commentThread', code: true },
      { text: ' owns' },
    ])
    expect(line!.height).toBe(12)
    expect(line!.allMono).toBe(false)
  })

  test('keeps spaces inside a code line exactly as wide as they were', () => {
    const cw = 0.6 * 8.3
    const pieces: StyledPiece[] = [
      { ...glyph('|', 97, 300, cw, 8.3), mono: true },
      { ...glyph('|-', 97 + 3 * cw, 300, 2 * cw, 8.3), mono: true },
    ]
    const [line] = styledLines(pieces)
    expect(line!.allMono).toBe(true)
    expect(line!.text).toBe('|  |-')
  })

  test('ignores glyphs the font gave no character for', () => {
    const pieces = [
      ...words('Exploration', 116, 514),
      glyph('\u0000', 183.7, 514, 4.4, 12),
      glyph('WIP', 188, 514, 22.7, 12),
      glyph('\u0000', 210.7, 514, 4.4, 12),
    ]
    expect(styledLines(pieces)[0]!.text).toBe('Exploration WIP')
  })

  test('puts no space before punctuation that follows a code chip', () => {
    const pieces = [
      ...words('owning', 72, 700),
      ...words('threadEntry', 115, 699, { mono: true, height: 8.3 }),
      glyph(',', 172, 700, 3, 12),
      ...words('authored', 180, 700),
    ]
    expect(styledLines(pieces)[0]!.text).toBe('owning threadEntry, authored')
  })

  test('shares a bold style across the space between two bold words', () => {
    const [line] = styledLines(words('Work in Progress', 115, 700, { bold: true }))
    expect(line!.runs).toEqual([{ text: 'Work in Progress', bold: true }])
  })
})

/** One line, built through pass 1 so fixtures match real output. */
function L(text: string, x: number, y: number, options: Options = {}): Line {
  return styledLines(words(text, x, y, options))[0]!
}

/** Body lines at the margin, one leading apart, which set the document's measurements. */
function prose(y: number, count: number, x = 72): Line[] {
  return Array.from({ length: count }, (_, i) => L(`Body line ${i} continues`, x, y - i * 18))
}

const page = (lines: Line[], figures: PageContent['figures'] = []): PageContent => ({
  lines,
  figures,
})

const texts = (blocks: ReturnType<typeof buildBlocks>) =>
  blocks.map((b) => ('runs' in b ? `${b.kind}:${b.runs.map((r) => r.text).join('')}` : b.kind))

describe('buildBlocks', () => {
  test('finds headings by size and weight, joining a wrapped title', () => {
    const blocks = buildBlocks([
      page([
        L('RFD: Thread Entry', 72, 900, { height: 30, bold: true }),
        L('Element Contract', 72, 864, { height: 30, bold: true }),
        L('1. Summary', 72, 820, { height: 18, bold: true }),
        ...prose(790, 4),
        L('2.1. Subject', 72, 700, { height: 15, bold: true }),
        ...prose(670, 3),
      ]),
    ])
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      runs: [{ text: 'RFD: Thread Entry Element Contract' }],
    })
    expect(blocks[1]).toMatchObject({ kind: 'heading', level: 2 })
    expect(blocks[3]).toMatchObject({ kind: 'heading', level: 3 })
  })

  test('splits paragraphs on a gap wider than the leading', () => {
    const blocks = buildBlocks([page([...prose(900, 3), ...prose(900 - 2 * 18 - 24, 3)])])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph'])
  })

  test('reads a labelled line as metadata and keeps its wrapped value', () => {
    const blocks = buildBlocks([
      page([
        styledLines([
          ...words('Audience', 72, 900, { bold: true }),
          ...words(': Frontend Engineers,', 120, 900),
        ])[0]!,
        L('and Element Maintainers', 72, 882),
        styledLines([...words('Repo', 72, 864, { bold: true }), ...words(': osTicket', 96, 864)])[0]!,
        ...prose(830, 3),
      ]),
    ])
    expect(texts(blocks).slice(0, 2)).toEqual([
      'meta:Audience: Frontend Engineers, and Element Maintainers',
      'meta:Repo: osTicket',
    ])
  })

  test('makes indented lines list items, continuations joining their item', () => {
    const blocks = buildBlocks([
      page([
        ...prose(900, 3),
        L('Identifying sensitive content', 94, 830),
        L('removal.', 94, 812),
        L('Coordinating a follow-up.', 94, 786),
      ]),
    ])
    expect(texts(blocks).slice(1)).toEqual([
      'list-item:Identifying sensitive content removal.',
      'list-item:Coordinating a follow-up.',
    ])
  })

  test('keeps a real hyphen at a line end, since a browser-made PDF does not hyphenate', () => {
    const blocks = buildBlocks([
      page([L('an Entry-', 72, 900), L('scoped surface for agents', 72, 882), ...prose(864, 3)]),
    ])
    expect(texts(blocks)[0]).toMatch(/^paragraph:an Entry-scoped surface/)
  })

  test('keeps a code block with its indentation and blank lines', () => {
    const mono = { mono: true, height: 8.3 }
    const blocks = buildBlocks([
      page([
        ...prose(900, 3),
        L('Does it describe the record?', 82, 830, mono),
        L('-> Add an Internal Note.', 102, 818, mono),
        L('Does it discuss an Entry?', 82, 793, mono),
        ...prose(750, 2),
      ]),
    ])
    expect(blocks[1]).toEqual({
      kind: 'code',
      text: 'Does it describe the record?\n    -> Add an Internal Note.\n\nDoes it discuss an Entry?',
    })
  })

  test('opens a callout at an emoji-led line and keeps its title apart from its body', () => {
    const emojiLine = styledLines([
      glyph('⚠', 84, 868, 12, 18),
      ...words('Work in Progress', 115, 871, { bold: true }),
    ])[0]!
    const blocks = buildBlocks([
      page([
        ...prose(950, 3),
        emojiLine,
        L('This RFD records a proposal', 115, 853),
        L('for review.', 115, 835),
        ...prose(800, 2),
      ]),
    ])
    expect(blocks[1]).toEqual({
      kind: 'callout',
      icon: '⚠',
      children: [
        { kind: 'paragraph', runs: [{ text: 'Work in Progress', bold: true }] },
        { kind: 'paragraph', runs: [{ text: 'This RFD records a proposal for review.' }] },
      ],
    })
    expect(blocks[2]).toMatchObject({ kind: 'paragraph' })
  })

  test('continues a callout onto the next page', () => {
    const emojiLine = styledLines([
      glyph('⚠', 84, 300, 12, 18),
      ...words('Note', 115, 300, { bold: true }),
    ])[0]!
    const blocks = buildBlocks([
      page([...prose(900, 5), emojiLine, L('Read semantics,', 115, 282)]),
      page([L('pagination remain open.', 115, 923), ...prose(870, 3)]),
    ])
    const callout = blocks.find((b) => b.kind === 'callout')
    expect(callout).toMatchObject({
      children: [{}, { runs: [{ text: 'Read semantics, pagination remain open.' }] }],
    })
  })

  test('joins a paragraph broken by a page only when it did not end a sentence', () => {
    const joined = buildBlocks([
      page([...prose(900, 3), L('and so it', 72, 846)]),
      page([L('carries on.', 72, 923), ...prose(905, 2)]),
    ])
    expect(joined).toHaveLength(1)

    const apart = buildBlocks([
      page([...prose(900, 3), L('It ended.', 72, 846)]),
      page([L('A new one.', 72, 923), ...prose(905, 2)]),
    ])
    expect(apart).toHaveLength(2)
  })

  test('places a figure before the caption beneath it', () => {
    const blocks = buildBlocks([
      page(
        [...prose(900, 3), L('Figure 1 A drawer opens.', 72, 500), ...prose(470, 2)],
        [{ y: 840, imageId: 'img-1', width: 469, height: 337 }],
      ),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'figure', 'caption', 'paragraph'])
  })

  test('drops a decorative emoji standing alone at the margin', () => {
    const blocks = buildBlocks([
      page([styledLines([glyph('💬', 74, 950, 36, 36)])[0]!, ...prose(900, 3)]),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })
})

describe('ordinary layouts', () => {
  test('reads a first-line indent as the start of a paragraph, not a list item', () => {
    const blocks = buildBlocks([
      page([
        L('The results of this experiment show that the', 87, 900),
        L('method works on every sample we tried here.', 72, 882),
        L('It is also fast.', 72, 864),
        L('A second paragraph opens with an indent', 87, 846),
        L('and runs on at the margin.', 72, 828),
      ]),
    ])
    expect(texts(blocks)).toEqual([
      'paragraph:The results of this experiment show that the method works on every sample we tried here. It is also fast.',
      'paragraph:A second paragraph opens with an indent and runs on at the margin.',
    ])
  })

  test('joins a paragraph whose first line has a deep indent', () => {
    const blocks = buildBlocks([
      page([L('Deeply indented first line of text', 108, 900), ...prose(882, 3)]),
    ])
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph'])
  })

  test('treats a bullet glyph as a list marker and joins its hanging lines', () => {
    const blocks = buildBlocks([
      page([
        ...prose(950, 3),
        styledLines([glyph('•', 90, 880, 4, 12), ...words('The first part of a bullet that', 100, 880)])[0]!,
        L('wraps onto a second line.', 100, 862),
        styledLines([glyph('•', 90, 836, 4, 12), ...words('Another point.', 100, 836)])[0]!,
      ]),
    ])
    expect(texts(blocks).slice(1)).toEqual([
      'list-item:The first part of a bullet that wraps onto a second line.',
      'list-item:Another point.',
    ])
  })

  test('does not find structure in indented prose', () => {
    const paragraph = (y: number) => [
      L('Indented opening line of a paragraph', 87, y),
      ...prose(y - 18, 7),
    ]
    expect(structureRatio([page([...paragraph(950), ...paragraph(780), ...paragraph(610)])])).toBeLessThan(0.1)
  })

  test('finds no code in a document set entirely in a monospace face', () => {
    const lines = Array.from({ length: 30 }, (_, i) =>
      L(`INT. KITCHEN - NIGHT line ${i}`, i % 3 ? 108 : 252, 900 - i * 14, { mono: true }),
    )
    expect(structureRatio([page(lines)])).toBe(0)
  })
})

describe('structureRatio', () => {
  test('is low for plain prose', () => {
    expect(structureRatio([page(prose(900, 20))])).toBeLessThan(0.1)
  })

  test('is high for a structured page', () => {
    const lines = [
      L('Title', 72, 950, { height: 30, bold: true }),
      ...prose(900, 4),
      L('Item one', 94, 810),
      L('Item two', 94, 784),
    ]
    expect(structureRatio([page(lines)])).toBeGreaterThan(0.1)
  })
})
