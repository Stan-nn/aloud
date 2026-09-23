import { paragraphsToBlocks, type Block } from '../blocks'
import { spokenParagraphs } from '../segment'
import { markdownBlocks, parsePlainText } from './text'
import { EmptyDocumentError, UnsupportedFileError } from './errors'

export type DocSource = 'pdf' | 'docx' | 'md' | 'txt' | 'paste'

export type ParsedImage = {
  id: string
  type: string
  bytes: ArrayBuffer
  width: number
  height: number
}

export type ParsedDoc = {
  title: string
  source: DocSource
  blocks: Block[]
  images: ParsedImage[]
  wordCount: number
}

const EXTENSIONS: Record<string, Exclude<DocSource, 'paste'>> = {
  pdf: 'pdf',
  docx: 'docx',
  md: 'md',
  markdown: 'md',
  txt: 'txt',
  text: 'txt',
}

/** The formats named in the dropzone, for use in messages to the reader. */
export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.md', '.txt'] as const

function extensionOf(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0 || dot === filename.length - 1) return null
  return filename.slice(dot + 1).toLowerCase()
}

export function sourceForFilename(
  filename: string,
): Exclude<DocSource, 'paste'> | null {
  const extension = extensionOf(filename)
  if (extension === null) return null
  return EXTENSIONS[extension] ?? null
}

export function titleForFilename(filename: string): string {
  if (!filename.trim()) return 'Untitled'
  const extension = extensionOf(filename)
  const stem =
    extension === null
      ? filename
      : filename.slice(0, filename.length - extension.length - 1)
  const cleaned = stem.replace(/[_-]+/g, ' ').trim()
  return cleaned || 'Untitled'
}

export function countWords(paragraphs: string[]): number {
  return paragraphs.reduce((total, paragraph) => {
    const trimmed = paragraph.trim()
    return total + (trimmed ? trimmed.split(/\s+/).length : 0)
  }, 0)
}

function finish(
  title: string,
  source: DocSource,
  blocks: Block[],
  images: ParsedImage[] = [],
): ParsedDoc {
  return {
    title,
    source,
    blocks,
    images,
    wordCount: countWords(spokenParagraphs(blocks)),
  }
}

export async function parseFile(file: File): Promise<ParsedDoc> {
  const source = sourceForFilename(file.name)
  if (source === null) {
    throw new UnsupportedFileError(
      `Aloud cannot read ${file.name}. It reads ${SUPPORTED_EXTENSIONS.join(', ')} files.`,
    )
  }

  const title = titleForFilename(file.name)

  // pdf.js and mammoth are large and most sessions need neither, so each is
  // fetched only when a file of that kind is actually opened.
  if (source === 'pdf') {
    const { parsePdf } = await import('./pdf')
    const { blocks, images } = await parsePdf(await file.arrayBuffer())
    return finish(title, source, blocks, images)
  }
  if (source === 'docx') {
    const { parseDocx } = await import('./docx')
    const paragraphs = await parseDocx(await file.arrayBuffer())
    return finish(title, source, paragraphsToBlocks(paragraphs))
  }

  const text = await file.text()
  const blocks =
    source === 'md'
      ? markdownBlocks(text)
      : paragraphsToBlocks(parsePlainText(text))

  if (spokenParagraphs(blocks).length === 0) {
    throw new EmptyDocumentError(`${file.name} has no text in it.`)
  }

  return finish(title, source, blocks)
}

/** Text pasted straight into the app, which has no filename to work from. */
export function parsePastedText(text: string, title = 'Pasted text'): ParsedDoc {
  const paragraphs = parsePlainText(text)
  if (paragraphs.length === 0) {
    throw new EmptyDocumentError('There is nothing to read in that text.')
  }
  return finish(title, 'paste', paragraphsToBlocks(paragraphs))
}
