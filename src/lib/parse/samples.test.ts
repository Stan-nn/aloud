import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
// jsdom's File has neither text() nor arrayBuffer(); Node's implements both,
// and matches what a browser actually hands the app from a file input.
import { File } from 'node:buffer'
import { beforeAll, describe, expect, test } from 'vitest'
import { parseFile } from './index'
import { segmentBlocks, spokenParagraphs } from '../segment'

/**
 * End-to-end checks against real files of each supported format, rather than
 * hand-built fixtures. These catch the things unit tests cannot: that the
 * libraries are wired up correctly and that what comes out the far end is
 * actually readable prose.
 */

const SAMPLES = join(process.cwd(), 'samples')

function fileFrom(name: string, type = ''): globalThis.File {
  const bytes = readFileSync(join(SAMPLES, name))
  return new File([new Uint8Array(bytes)], name, { type }) as globalThis.File
}

function textFile(contents: string, name: string): globalThis.File {
  return new File([contents], name) as globalThis.File
}

describe('a real Markdown file', () => {
  const load = () => parseFile(fileFrom('silent-revolution.md'))

  test('takes its title from the filename', async () => {
    expect((await load()).title).toBe('silent revolution')
  })

  test('keeps the prose', async () => {
    const paragraphs = spokenParagraphs((await load()).blocks)
    expect(paragraphs.join(' ')).toContain('reading was something you did out loud')
  })

  test('strips the heading marks', async () => {
    const paragraphs = spokenParagraphs((await load()).blocks)
    expect(paragraphs[0]).toBe('The Silent Revolution')
  })

  test('leaves the code block out of what gets read', async () => {
    const paragraphs = spokenParagraphs((await load()).blocks)
    expect(paragraphs.join(' ')).not.toContain('const x = 1')
  })

  test('keeps the words of a link but not its address', async () => {
    const text = spokenParagraphs((await load()).blocks).join(' ')
    expect(text).toContain('manuscript evidence')
    expect(text).not.toContain('https://example.com')
  })

  test('splits into sentences without breaking on Dr. or $3.50', async () => {
    const sentences = segmentBlocks((await load()).blocks).map((s) => s.text)
    expect(sentences).toContain(
      'Dr. Smith argues the practice was commoner than Augustine let on.',
    )
    expect(sentences.some((s) => s.includes('$3.50 a day, e.g. roughly'))).toBe(
      true,
    )
  })
})

describe('a real plain text file', () => {
  test('reads through to the last line', async () => {
    const paragraphs = spokenParagraphs((await parseFile(fileFrom('plain.txt'))).blocks)
    expect(paragraphs.join(' ')).toContain('was once the exception')
  })

  test('counts a sensible number of words', async () => {
    const { wordCount } = await parseFile(fileFrom('plain.txt'))
    expect(wordCount).toBeGreaterThan(100)
  })
})

describe('a real Word file', () => {
  test('recovers the text', async () => {
    const paragraphs = spokenParagraphs((await parseFile(fileFrom('report.docx'))).blocks)
    expect(paragraphs.join(' ')).toContain('reading was something you did out loud')
  })

  test('keeps the paragraphs apart', async () => {
    const paragraphs = spokenParagraphs((await parseFile(fileFrom('report.docx'))).blocks)
    expect(paragraphs.length).toBeGreaterThan(1)
  })

  test('is recorded as a Word document', async () => {
    expect((await parseFile(fileFrom('report.docx'))).source).toBe('docx')
  })
})

describe('an unreadable file type', () => {
  test('says plainly that it cannot be read', async () => {
    const file = textFile('x', 'slides.pptx')
    await expect(parseFile(file)).rejects.toThrow(/cannot read slides.pptx/)
  })

  test('names the formats it can read', async () => {
    const file = textFile('x', 'slides.pptx')
    await expect(parseFile(file)).rejects.toThrow(/\.pdf, \.docx, \.md, \.txt/)
  })
})

describe('an empty file', () => {
  test('says there is nothing to read', async () => {
    const file = textFile('   ', 'blank.txt')
    await expect(parseFile(file)).rejects.toThrow(/no text in it/)
  })
})

describe('a real PDF', () => {
  const load = () => parseFile(fileFrom('essay.pdf', 'application/pdf'))

  // In the browser the worker is fetched over HTTP from the URL Vite emits.
  // Node has no such server, so point pdf.js at the file on disk instead.
  // This configures the environment; the code under test is unchanged.
  beforeAll(async () => {
    // Load the module under test first: it sets workerSrc to the browser URL
    // at import time, so the override has to come after it.
    await import('./pdf')
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    ).href
  })

  test('recovers the prose from positioned glyphs', async () => {
    const paragraphs = spokenParagraphs((await load()).blocks)
    expect(paragraphs.join(' ')).toContain(
      'reading was something you did out loud',
    )
  }, 30000)

  test('keeps the words in reading order', async () => {
    const text = spokenParagraphs((await load()).blocks).join(' ')
    expect(text.indexOf('For most of recorded history')).toBeLessThan(
      text.indexOf('was once the exception'),
    )
  }, 30000)

  test('is recorded as a PDF', async () => {
    expect((await load()).source).toBe('pdf')
  }, 30000)
})
