import { normalizeWhitespace } from './clean'

/**
 * A PDF has no lines and no paragraphs — only glyphs with coordinates. These
 * helpers put the prose back together: pieces sharing a baseline become a
 * line, and an unusually large step between baselines becomes a paragraph
 * break.
 */

export type PlacedText = {
  str: string
  /** Distance from the left edge. */
  x: number
  /** Distance from the bottom edge — PDF counts upward, so larger is higher. */
  y: number
  /** How wide the piece is, where pdf.js reports it. */
  width?: number
}

type Row = { y: number; text: string }

/** Baselines within this many units of each other belong to the same line. */
const SAME_LINE_TOLERANCE = 3

/**
 * pdf.js frequently splits one word into several pieces, and a comma is often
 * a piece of its own. Anything closer than this to the end of the piece before
 * it is part of the same word, not a new one.
 */
const WORD_GAP = 0.8

function joinPieces(pieces: PlacedText[]): string {
  let text = ''
  let previous: PlacedText | null = null

  for (const piece of pieces) {
    if (previous !== null) {
      const end =
        previous.width === undefined ? null : previous.x + previous.width
      // Where pdf.js gives no width there is nothing to measure, so fall back
      // to a space: a missing space is harder to listen past than an extra one.
      const touching = end !== null && piece.x - end < WORD_GAP
      if (!touching) text += ' '
    }
    text += piece.str
    previous = piece
  }

  return text
}

function toRows(items: PlacedText[]): Row[] {
  const withText = items.filter((item) => item.str.trim().length > 0)
  if (withText.length === 0) return []

  // Cluster by baseline first. Ordering by y alone would let a piece sitting
  // a fraction higher on the same line jump ahead of the piece to its left.
  const clusters: PlacedText[][] = []
  for (const item of [...withText].sort((a, b) => b.y - a.y)) {
    const cluster = clusters[clusters.length - 1]
    const baseline = cluster?.[0]?.y
    if (baseline !== undefined && Math.abs(baseline - item.y) <= SAME_LINE_TOLERANCE) {
      cluster!.push(item)
    } else {
      clusters.push([item])
    }
  }

  return clusters.map((cluster) => ({
    y: cluster[0]!.y,
    text: normalizeWhitespace(joinPieces([...cluster].sort((a, b) => a.x - b.x))),
  }))
}

export function groupIntoLines(items: PlacedText[]): string[] {
  return toRows(items).map((row) => row.text)
}

/**
 * A paragraph break in a PDF is just a bigger gap between baselines. Compare
 * each step against the median step on the page, so the test adapts to the
 * document's own leading rather than to an assumed font size.
 */
const PARAGRAPH_GAP_RATIO = 1.4

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

export function pageToLines(items: PlacedText[]): string[] {
  const rows = toRows(items)
  if (rows.length < 2) return rows.map((row) => row.text)

  const steps = rows.slice(1).map((row, i) => rows[i]!.y - row.y)
  const typical = median(steps)

  const lines: string[] = [rows[0]!.text]
  rows.slice(1).forEach((row, i) => {
    if (typical > 0 && steps[i]! > typical * PARAGRAPH_GAP_RATIO) lines.push('')
    lines.push(row.text)
  })

  return lines
}

// ---------------------------------------------------------------------------
// Binding to pdf.js
// ---------------------------------------------------------------------------

import * as pdfjs from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { paragraphsToBlocks, type Block } from '../blocks'
import {
  dropRunningHeaders,
  isRunningLine,
  joinHyphenatedLines,
  linesToParagraphs,
  runningKeys,
} from './clean'
import { EmptyDocumentError } from './errors'
import type { ParsedImage } from './index'
import {
  buildBlocks,
  structureRatio,
  styledLines,
  type FigureMark,
  type PageContent,
  type StyledPiece,
} from './pdfLayout'
import {
  figureBoxes,
  imageBoxes,
  renderRegions,
  type Box,
  type RegionRenderer,
} from './pdfFigures'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Below this share of structured lines, a PDF is read as plain paragraphs, as before. */
const MIN_STRUCTURE = 0.1

const BOLD_FONT = /_[6-9]00wght|Bold|Semibold|Black|Heavy/i
const ITALIC_FONT = /Italic|Oblique/i

function placed(items: TextItem[]): PlacedText[] {
  return items.map((item) => ({
    str: item.str,
    x: item.transform[4] as number,
    y: item.transform[5] as number,
    width: item.width,
  }))
}

/**
 * The embedded font's real name, e.g. "BAAAAA+Inter_700wght", which is where
 * the weight is written. pdf.js only resolves it once the page's operator
 * list has been loaded.
 */
function fontName(page: PDFPageProxy, id: string): string {
  try {
    return (page.commonObjs.get(id) as { name?: string } | undefined)?.name ?? ''
  } catch {
    return ''
  }
}

function styled(
  page: PDFPageProxy,
  items: TextItem[],
  styles: Record<string, { fontFamily: string }>,
): StyledPiece[] {
  return items.map((item) => {
    const name = fontName(page, item.fontName)
    return {
      str: item.str,
      x: item.transform[4] as number,
      y: item.transform[5] as number,
      width: item.width,
      height: item.height,
      bold: BOLD_FONT.test(name),
      italic: ITALIC_FONT.test(name),
      mono: styles[item.fontName]?.fontFamily === 'monospace',
    }
  })
}

async function figuresOn(
  page: PDFPageProxy,
  boxes: Box[],
  render: RegionRenderer,
  images: ParsedImage[],
): Promise<FigureMark[]> {
  if (boxes.length === 0) return []
  let rendered: Awaited<ReturnType<RegionRenderer>>
  try {
    rendered = await render(page, boxes)
  } catch {
    return [] // A figure that cannot be drawn is left out; the text still reads.
  }

  const marks: FigureMark[] = []
  boxes.forEach((box, i) => {
    const image = rendered[i]
    if (!image) return
    const id = crypto.randomUUID()
    const width = Math.round(box.width)
    const height = Math.round(box.height)
    images.push({ id, type: image.type, bytes: image.bytes, width, height })
    marks.push({ y: box.y + box.height, imageId: id, width, height })
  })
  return marks
}

/** Let the page paint between expensive steps on a long document. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export async function parsePdf(
  data: ArrayBuffer,
  render: RegionRenderer = renderRegions,
): Promise<{ blocks: Block[]; images: ParsedImage[] }> {
  // pdf.js wants a typed array; a bare ArrayBuffer is rejected.
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise

  try {
    // First read every page's text and where its figures sit. Nothing is
    // drawn yet: most PDFs are read as plain paragraphs, and a scan is
    // turned away, and neither needs a single pixel.
    const lines: PageContent['lines'][] = []
    const boxes: Box[][] = []
    const plainPages: string[][] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const operators = await page.getOperatorList()
      const items = content.items.filter(
        (item): item is TextItem => 'str' in item,
      )
      plainPages.push(pageToLines(placed(items)))
      lines.push(styledLines(styled(page, items, content.styles)))
      const { width, height } = page.getViewport({ scale: 1 })
      boxes.push(
        figureBoxes(imageBoxes(operators.fnArray, operators.argsArray, pdfjs.OPS), {
          width,
          height,
        }),
      )
      page.cleanup()
    }

    const running = runningKeys(lines.map((page) => page.map((l) => l.text)))
    const cleaned = lines.map((page) =>
      page.filter((line, i) => !isRunningLine(line.text, i, page.length, running)),
    )

    if (cleaned.every((page) => page.length === 0)) {
      throw new EmptyDocumentError(
        'This PDF has no text to read — it looks like a scan of a printed page. Reading scans would need OCR, which Aloud does not do.',
      )
    }

    const pages: PageContent[] = cleaned.map((page) => ({ lines: page, figures: [] }))
    if (structureRatio(pages) < MIN_STRUCTURE) {
      const paragraphs = dropRunningHeaders(plainPages).flatMap((page) =>
        linesToParagraphs(joinHyphenatedLines(page)),
      )
      return { blocks: paragraphsToBlocks(paragraphs), images: [] }
    }

    // Only now, for a document that will be shown with its structure, draw
    // the pages that have figures on them.
    const images: ParsedImage[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      if (boxes[n - 1]!.length === 0) continue
      const page = await pdf.getPage(n)
      pages[n - 1]!.figures = await figuresOn(page, boxes[n - 1]!, render, images)
      page.cleanup()
      await breathe()
    }

    return { blocks: buildBlocks(pages), images }
  } finally {
    await pdf.destroy()
  }
}
