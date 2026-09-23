import 'fake-indexeddb/auto'
// jsdom's File has no text(); Node's does, and matches what a browser hands over.
import { File } from 'node:buffer'
import { beforeEach, describe, expect, test } from 'vitest'
import { useStore } from './store'
import { resetLibrary, saveDoc, saveProgress } from '../lib/db'

beforeEach(async () => {
  await resetLibrary()
  useStore.getState().closeDoc()
})

describe('opening documents', () => {
  test('a Markdown file opens with its structure', async () => {
    const file = new File(
      ['## 1. Summary\n\nThe `parent_id` is kept.'],
      'spec.md',
    ) as unknown as globalThis.File
    await useStore.getState().addFile(file)
    const { blocks, sentences } = useStore.getState()
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph'])
    expect(sentences.map((s) => s.text)).toEqual([
      '1 Summary',
      'The parent id is kept.',
    ])
  })

  test('a document saved before blocks existed opens where you left it', async () => {
    await saveDoc({
      id: 'old',
      title: 'Old',
      source: 'txt',
      addedAt: 1,
      wordCount: 4,
      paragraphs: ['One. Two.', 'Three.'],
    })
    await saveProgress('old', 2)
    await useStore.getState().openDoc('old')
    const { blocks, sentences, index } = useStore.getState()
    expect(blocks).toHaveLength(2)
    expect(sentences.map((s) => s.text)).toEqual(['One.', 'Two.', 'Three.'])
    expect(index).toBe(2)
  })
})
