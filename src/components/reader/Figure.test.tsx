import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Figure } from './Figure'
import { resetLibrary, saveDoc } from '../../lib/db'

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  await resetLibrary()
  // jsdom has no object URLs; these stand in for the browser's.
  let made = 0
  URL.createObjectURL = vi.fn(() => `blob:figure-${++made}`)
  URL.revokeObjectURL = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const block = (imageId: string) => ({ kind: 'figure' as const, imageId, width: 10, height: 5 })

describe('Figure', () => {
  test('shows a stored image', async () => {
    await saveDoc(
      { id: 'd', title: 'D', source: 'pdf', addedAt: 1, wordCount: 1, blocks: [] },
      [{ id: 'a', type: 'image/webp', bytes: new ArrayBuffer(1), width: 10, height: 5 }],
    )
    await act(async () => root.render(<Figure block={block('a')} />))
    await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())
  })

  test('drops the old picture when it is reused for an image that is missing', async () => {
    await saveDoc(
      { id: 'd', title: 'D', source: 'pdf', addedAt: 1, wordCount: 1, blocks: [] },
      [{ id: 'a', type: 'image/webp', bytes: new ArrayBuffer(1), width: 10, height: 5 }],
    )
    await act(async () => root.render(<Figure block={block('a')} />))
    await vi.waitFor(() => expect(container.querySelector('img')).not.toBeNull())

    await act(async () => root.render(<Figure block={block('missing')} />))
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(container.querySelector('img')).toBeNull()
  })
})
