import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ReaderPane } from '../ReaderPane'
import { useStore } from '../../state/store'
import { segmentBlocks } from '../../lib/segment'
import type { Block } from '../../lib/blocks'

const blocks: Block[] = [
  { kind: 'heading', level: 2, runs: [{ text: '1. Summary' }] },
  { kind: 'meta', runs: [{ text: 'Status', bold: true }, { text: ': Draft' }] },
  {
    kind: 'paragraph',
    runs: [
      { text: 'Each ' },
      { text: 'threadEntry', code: true },
      { text: ' owns one. Next.' },
    ],
  },
  {
    kind: 'callout',
    icon: '⚠️',
    children: [{ kind: 'paragraph', runs: [{ text: 'Careful.' }] }],
  },
  { kind: 'list-item', runs: [{ text: 'First.' }] },
  { kind: 'list-item', runs: [{ text: 'Second.' }] },
  { kind: 'code', language: 'tsx', text: 'const x = 1\n  y()' },
  { kind: 'figure', imageId: 'missing', width: 100, height: 50 },
  { kind: 'caption', runs: [{ text: 'Figure 1 — A drawer.' }] },
]

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  useStore.setState({
    doc: { id: 'd', title: 'Doc', source: 'pdf', addedAt: 1, wordCount: 10, blocks },
    blocks,
    sentences: segmentBlocks(blocks),
    index: 0,
    playback: 'ready',
  })
  await act(async () => root.render(<ReaderPane />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the structured reader', () => {
  test('shows a level-2 heading below the document title', () => {
    expect(container.querySelector('h3.doc-h3')?.textContent).toBe('1. Summary')
  })

  test('shows a metadata label in bold', () => {
    expect(container.querySelector('.meta strong')?.textContent).toBe('Status')
  })

  test('shows inline code as a chip inside its sentence', () => {
    const chip = container.querySelector('code.chip')
    expect(chip?.textContent).toBe('threadEntry')
    expect(chip?.closest('.sent')?.textContent).toBe('Each threadEntry owns one.')
  })

  test('boxes a callout with its icon', () => {
    const callout = container.querySelector('aside.callout')
    expect(callout?.querySelector('.callout-icon')?.textContent).toBe('⚠️')
    expect(callout?.textContent).toContain('Careful.')
  })

  test('groups list items into one list', () => {
    expect(container.querySelectorAll('ul.list > li')).toHaveLength(2)
  })

  test('shows a code block with its indentation', () => {
    expect(container.querySelector('pre code')?.textContent).toBe('const x = 1\n  y()')
  })

  test('renders nothing for a figure whose image is missing', () => {
    expect(container.querySelector('figure')).toBeNull()
    expect(container.querySelector('.caption')?.textContent).toBe('Figure 1 — A drawer.')
  })

  test('marks the block holding the current sentence', () => {
    expect(container.querySelector('.blk--current')?.textContent).toBe('1. Summary')
  })

  test('jumps to a sentence when its chip is clicked', async () => {
    const sentence = container.querySelector('code.chip')!.closest('.sent') as HTMLElement
    await act(async () => sentence.click())
    const target = useStore
      .getState()
      .sentences.find((s) => s.text === 'Each thread Entry owns one.')
    expect(useStore.getState().index).toBe(target!.id)
  })
})
