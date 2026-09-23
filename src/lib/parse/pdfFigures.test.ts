import { describe, expect, test } from 'vitest'
import { cropRect, figureBoxes, imageBoxes, renderScale } from './pdfFigures'

const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  paintImageXObject: 85,
  paintInlineImageXObject: 86,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
}

describe('imageBoxes', () => {
  test('places an image by the transform in force when it is painted', () => {
    const boxes = imageBoxes(
      [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      [[], [469, 0, 0, 337, 72, 599], ['img'], []],
      OPS,
    )
    expect(boxes).toEqual([{ x: 72, y: 599, width: 469, height: 337 }])
  })

  test('undoes a transform on restore', () => {
    const boxes = imageBoxes(
      [OPS.save, OPS.transform, OPS.restore, OPS.transform, OPS.paintImageXObject],
      [[], [2, 0, 0, 2, 0, 0], [], [100, 0, 0, 50, 10, 20], ['img']],
      OPS,
    )
    expect(boxes).toEqual([{ x: 10, y: 20, width: 100, height: 50 }])
  })

  test('composes nested transforms', () => {
    const boxes = imageBoxes(
      [OPS.transform, OPS.transform, OPS.paintImageXObject],
      [[1, 0, 0, 1, 100, 100], [60, 0, 0, 60, 0, 0], ['img']],
      OPS,
    )
    expect(boxes).toEqual([{ x: 100, y: 100, width: 60, height: 60 }])
  })

  test('ignores images too small to be figures', () => {
    const boxes = imageBoxes(
      [OPS.transform, OPS.paintImageXObject],
      [[20, 0, 0, 20, 0, 0], ['icon']],
      OPS,
    )
    expect(boxes).toEqual([])
  })
})

describe('figureBoxes', () => {
  test('leaves out an image that covers most of the page, like a scanned backdrop', () => {
    const page = { width: 612, height: 792 }
    const figure = { x: 72, y: 500, width: 469, height: 200 }
    const backdrop = { x: 0, y: 0, width: 612, height: 792 }
    expect(figureBoxes([figure, backdrop], page)).toEqual([figure])
  })
})

describe('renderScale', () => {
  test('draws an ordinary page at twice its size', () => {
    expect(renderScale(612, 1008)).toBe(2)
  })

  test('stays under the pixel limit browsers put on a canvas', () => {
    const scale = renderScale(5000, 5000)
    expect(5000 * scale * 5000 * scale).toBeLessThanOrEqual(16_000_000)
  })
})

describe('cropRect', () => {
  test('turns a box into canvas pixels through the page viewport, whatever order its corners come back in', () => {
    // A rotated page hands the corners back swapped.
    const viewport = { convertToViewportRectangle: () => [300, 40, 100, 240] }
    expect(cropRect(viewport, { x: 0, y: 0, width: 1, height: 1 })).toEqual({
      left: 100,
      top: 40,
      width: 200,
      height: 200,
    })
  })
})
