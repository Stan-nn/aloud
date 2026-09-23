import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeAll, describe, expect, test } from 'vitest'
import type { RegionRenderer } from './pdfFigures'

/**
 * Figures are drawn only once a document is known to be read with its
 * structure. These PDFs are written by hand: one page of plain prose with a
 * picture on it, and a "scan" that is nothing but a picture.
 */

let parsePdf: typeof import('./pdf').parsePdf

beforeAll(async () => {
  ;({ parsePdf } = await import('./pdf'))
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  ).href
})

/** A one-page PDF with the given content stream; pdf.js rebuilds the xref itself. */
function pdfWith(content: string): ArrayBuffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  objects.forEach((object, i) => {
    body += `${i + 1} 0 obj\n${object}\nendobj\n`
  })
  body += 'trailer\n<< /Root 1 0 R /Size 6 >>\n%%EOF\n'
  return new TextEncoder().encode(body).buffer as ArrayBuffer
}

const picture = 'q 200 0 0 150 72 500 cm BI /W 2 /H 2 /CS /G /BPC 8 ID \x00\xff\xff\x00 EI Q'

const prose = Array.from(
  { length: 20 },
  (_, i) => `BT /F1 12 Tf 72 ${460 - i * 18} Td (Plain body line number ${i} runs on here.) Tj ET`,
).join('\n')

function counting(): { render: RegionRenderer; calls: () => number } {
  let calls = 0
  return {
    render: async (_page, boxes) => {
      calls++
      return boxes.map(() => ({ type: 'image/webp', bytes: new ArrayBuffer(1) }))
    },
    calls: () => calls,
  }
}

describe('drawing figures', () => {
  test('does not draw anything for a PDF read as plain paragraphs', async () => {
    const spy = counting()
    const result = await parsePdf(pdfWith(`${picture}\n${prose}`), spy.render)
    expect(result.blocks.every((b) => b.kind === 'paragraph')).toBe(true)
    expect(spy.calls()).toBe(0)
  })

  test('does not draw a scan before saying it has no text', async () => {
    const spy = counting()
    await expect(parsePdf(pdfWith(picture), spy.render)).rejects.toThrow(/no text to read/)
    expect(spy.calls()).toBe(0)
  })
})
