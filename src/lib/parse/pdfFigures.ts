import type { PDFPageProxy } from 'pdfjs-dist'

/** An area of a page in PDF units; y is the bottom edge, counted upward. */
export type Box = { x: number; y: number; width: number; height: number }

type Matrix = [number, number, number, number, number, number]

type Ops = {
  save: number
  restore: number
  transform: number
  paintImageXObject: number
  paintInlineImageXObject: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
}

/** Anything smaller is a logo or an icon rather than a figure. */
const MIN_FIGURE = 48

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/**
 * Where each image lands on the page. An image is painted into the unit
 * square, so its box is that square carried through the transform in force
 * at the moment it is painted.
 */
export function imageBoxes(fnArray: number[], argsArray: unknown[], ops: Ops): Box[] {
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const stack: Matrix[] = []
  const boxes: Box[] = []

  fnArray.forEach((fn, i) => {
    const args = argsArray[i] as unknown[] | null
    if (fn === ops.save) stack.push(ctm)
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm
    else if (fn === ops.transform) ctm = multiply(ctm, args as Matrix)
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm)
      if (Array.isArray(args?.[0])) ctm = multiply(ctm, args![0] as Matrix)
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
      const xs = [ctm[4], ctm[0] + ctm[4], ctm[2] + ctm[4], ctm[0] + ctm[2] + ctm[4]]
      const ys = [ctm[5], ctm[1] + ctm[5], ctm[3] + ctm[5], ctm[1] + ctm[3] + ctm[5]]
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const box = { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
      if (box.width >= MIN_FIGURE && box.height >= MIN_FIGURE) boxes.push(box)
    }
  })

  return boxes
}

/** An image covering this much of the page is a scan or a backdrop, not a figure. */
const MAX_PAGE_SHARE = 0.75

export function figureBoxes(boxes: Box[], page: { width: number; height: number }): Box[] {
  const area = page.width * page.height
  return boxes.filter((box) => box.width * box.height <= MAX_PAGE_SHARE * area)
}

/** Browsers refuse canvases much past this many pixels (Safari: about 16.7M). */
const MAX_PIXELS = 16_000_000
const SCALE = 2

/** Twice the page's size, or less if that would make too large a canvas. */
export function renderScale(width: number, height: number): number {
  return Math.min(SCALE, Math.sqrt(MAX_PIXELS / (width * height)))
}

type Viewport = { convertToViewportRectangle: (rect: number[]) => number[] }

/**
 * A box in PDF units as a rectangle of canvas pixels. The page viewport does
 * the conversion, so a crop box offset or a rotated page lands in the right
 * place; the corners can come back in either order.
 */
export function cropRect(viewport: Viewport, box: Box) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
    box.x,
    box.y,
    box.x + box.width,
    box.y + box.height,
  ]) as [number, number, number, number]
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

export type RegionRenderer = (
  page: PDFPageProxy,
  boxes: Box[],
) => Promise<Array<{ type: string; bytes: ArrayBuffer } | null>>

/**
 * Render the page once and cut each figure out of it. Runs on the main
 * thread because pdf.js draws through the DOM canvas factory. Where there is
 * no canvas (jsdom, or a locked-down browser) it returns nothing, and the
 * document is read without its figures.
 */
export const renderRegions: RegionRenderer = async (page, boxes) => {
  if (typeof document === 'undefined') return boxes.map(() => null)
  const natural = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: renderScale(natural.width, natural.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) return boxes.map(() => null)

  try {
    await page.render({ canvasContext: context, viewport }).promise
    const out: Array<{ type: string; bytes: ArrayBuffer } | null> = []
    for (const box of boxes) {
      const rect = cropRect(viewport, box)
      const crop = document.createElement('canvas')
      crop.width = Math.max(1, Math.round(rect.width))
      crop.height = Math.max(1, Math.round(rect.height))
      const target = crop.getContext('2d')
      if (!target) {
        out.push(null)
        continue
      }
      target.drawImage(canvas, rect.left, rect.top, crop.width, crop.height, 0, 0, crop.width, crop.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        crop.toBlob(resolve, 'image/webp', 0.85),
      )
      crop.width = crop.height = 0
      out.push(blob ? { type: blob.type, bytes: await blob.arrayBuffer() } : null)
    }
    return out
  } finally {
    // Release the page-sized bitmap now rather than whenever it is collected.
    canvas.width = canvas.height = 0
  }
}
