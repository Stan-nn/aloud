import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openDB } from 'idb'
import {
  DEFAULT_SETTINGS,
  closeLibrary,
  deleteDoc,
  docBlocks,
  getImage,
  onUpgradeBlocked,
  getProgress,
  getSettings,
  listDocs,
  loadDoc,
  resetLibrary,
  saveDoc,
  saveProgress,
  saveSettings,
} from './db'
import type { StoredDoc } from './db'

const doc = (id: string, title: string, addedAt: number): StoredDoc => ({
  id,
  title,
  source: 'txt',
  addedAt,
  wordCount: 3,
  blocks: [{ kind: 'paragraph', runs: [{ text: 'One two three.' }] }],
})

beforeEach(async () => {
  await resetLibrary()
})

describe('documents', () => {
  test('a saved document can be read back', async () => {
    await saveDoc(doc('a', 'First', 1))
    expect((await loadDoc('a'))?.title).toBe('First')
  })

  test('a document keeps its text', async () => {
    await saveDoc(doc('a', 'First', 1))
    expect((await loadDoc('a'))?.blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'One two three.' }] },
    ])
  })

  test('asking for a document that was never saved gives nothing', async () => {
    expect(await loadDoc('missing')).toBeUndefined()
  })

  test('the library lists the most recently added first', async () => {
    await saveDoc(doc('a', 'Older', 1000))
    await saveDoc(doc('b', 'Newer', 2000))
    expect((await listDocs()).map((d) => d.title)).toEqual(['Newer', 'Older'])
  })

  test('the library summary leaves out the document text', async () => {
    await saveDoc(doc('a', 'First', 1))
    const [summary] = await listDocs()
    expect(summary).not.toHaveProperty('paragraphs')
    expect(summary).not.toHaveProperty('blocks')
  })

  test('saving the same id again replaces the document', async () => {
    await saveDoc(doc('a', 'First', 1))
    await saveDoc(doc('a', 'Renamed', 1))
    expect(await listDocs()).toHaveLength(1)
    expect((await loadDoc('a'))?.title).toBe('Renamed')
  })

  test('a deleted document is gone', async () => {
    await saveDoc(doc('a', 'First', 1))
    await deleteDoc('a')
    expect(await loadDoc('a')).toBeUndefined()
  })

  test('deleting a document also forgets where you were in it', async () => {
    await saveDoc(doc('a', 'First', 1))
    await saveProgress('a', 12)
    await deleteDoc('a')
    expect(await getProgress('a')).toBe(0)
  })

  test('an empty library lists nothing', async () => {
    expect(await listDocs()).toEqual([])
  })
})

describe('progress', () => {
  test('remembers the sentence you reached', async () => {
    await saveProgress('a', 42)
    expect(await getProgress('a')).toBe(42)
  })

  test('starts a document you have never opened at the beginning', async () => {
    expect(await getProgress('unseen')).toBe(0)
  })

  test('keeps only the latest position', async () => {
    await saveProgress('a', 10)
    await saveProgress('a', 11)
    expect(await getProgress('a')).toBe(11)
  })

  test('keeps each document"s position separate', async () => {
    await saveProgress('a', 10)
    await saveProgress('b', 20)
    expect(await getProgress('a')).toBe(10)
  })
})

describe('settings', () => {
  test('starts from sensible defaults', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  test('remembers a changed setting', async () => {
    await saveSettings({ rate: 1.5 })
    expect((await getSettings()).rate).toBe(1.5)
  })

  test('changing one setting leaves the others alone', async () => {
    await saveSettings({ rate: 1.5 })
    await saveSettings({ theme: 'dark' })
    const settings = await getSettings()
    expect(settings.rate).toBe(1.5)
    expect(settings.theme).toBe('dark')
  })

  test('fills in any setting that was never stored', async () => {
    await saveSettings({ rate: 1.5 })
    expect((await getSettings()).pitch).toBe(DEFAULT_SETTINGS.pitch)
  })
})

describe('voice settings', () => {
  test('starts with no voice chosen, so the best available is picked', async () => {
    expect((await getSettings()).voiceId).toBeNull()
  })

  test('remembers the chosen voice across engines', async () => {
    await saveSettings({ voiceId: 'kokoro:af_heart' })
    expect((await getSettings()).voiceId).toBe('kokoro:af_heart')
  })

  test('has not accepted the model download to begin with', async () => {
    expect((await getSettings()).kokoroAccepted).toBe(false)
  })

  test('remembers that the download was accepted', async () => {
    await saveSettings({ kokoroAccepted: true })
    expect((await getSettings()).kokoroAccepted).toBe(true)
  })
})

describe('images', () => {
  const image = (id: string) => ({
    id,
    type: 'image/webp',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    width: 10,
    height: 5,
  })

  test('are saved with their document and read back by id', async () => {
    await saveDoc(doc('a', 'First', 1), [image('i1')])
    const stored = await getImage('i1')
    expect(stored?.docId).toBe('a')
    expect(new Uint8Array(stored!.bytes)).toEqual(new Uint8Array([1, 2, 3]))
  })

  test('are deleted with their document', async () => {
    await saveDoc(doc('a', 'First', 1), [image('i1'), image('i2')])
    await saveDoc(doc('b', 'Second', 2), [image('i3')])
    await deleteDoc('a')
    expect(await getImage('i1')).toBeUndefined()
    expect(await getImage('i2')).toBeUndefined()
    expect(await getImage('i3')).toBeDefined()
  })
})

describe('documents saved before blocks existed', () => {
  test('survive the upgrade and read as paragraph blocks', async () => {
    await closeLibrary()
    const v1 = await openDB('aloud', 1, {
      upgrade(database) {
        database
          .createObjectStore('documents', { keyPath: 'id' })
          .createIndex('addedAt', 'addedAt')
        database.createObjectStore('progress', { keyPath: 'docId' })
        database.createObjectStore('settings')
      },
    })
    await v1.put('documents', {
      id: 'old',
      title: 'Old',
      source: 'txt',
      addedAt: 1,
      wordCount: 4,
      paragraphs: ['One two.', 'Three four.'],
    })
    v1.close()

    const loaded = await loadDoc('old')
    expect(loaded?.paragraphs).toEqual(['One two.', 'Three four.'])
    expect(docBlocks(loaded!)).toEqual([
      { kind: 'paragraph', runs: [{ text: 'One two.' }] },
      { kind: 'paragraph', runs: [{ text: 'Three four.' }] },
    ])
  })
})

describe('upgrading while another tab still has the old database open', () => {
  test('says so, then carries on once that tab lets go', async () => {
    await closeLibrary()
    const oldTab = await openDB('aloud', 1, {
      upgrade(database) {
        database
          .createObjectStore('documents', { keyPath: 'id' })
          .createIndex('addedAt', 'addedAt')
        database.createObjectStore('progress', { keyPath: 'docId' })
        database.createObjectStore('settings')
      },
    })

    let blocked = false
    onUpgradeBlocked(() => {
      blocked = true
    })
    const pending = listDocs()
    await vi.waitFor(() => expect(blocked).toBe(true))

    oldTab.close()
    expect(await pending).toEqual([])
  })
})
