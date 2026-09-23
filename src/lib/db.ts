import { openDB, deleteDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import { paragraphsToBlocks, type Block } from './blocks'
import type { DocSource, ParsedImage } from './parse'

/**
 * Everything Aloud remembers lives here, in this browser, on this machine.
 * Documents go in whole because re-parsing a PDF on every open is slow and
 * pointless; the position in each one is kept separately so it can be written
 * on every sentence without rewriting the document.
 */

export type StoredDoc = {
  id: string
  title: string
  source: DocSource
  addedAt: number
  wordCount: number
  /** Present on every document saved since structure was kept. */
  blocks?: Block[]
  /** Documents saved before blocks existed. Read, never written. */
  paragraphs?: string[]
}

export type StoredImage = ParsedImage & { docId: string }

/** What the library sidebar needs — the document body would be dead weight. */
export type DocSummary = Omit<StoredDoc, 'blocks' | 'paragraphs'>

/** A document's blocks, wrapping an old paragraphs-only record on the fly. */
export function docBlocks(doc: StoredDoc): Block[] {
  return doc.blocks ?? paragraphsToBlocks(doc.paragraphs ?? [])
}

export type Theme = 'light' | 'dark' | 'system'

export type Settings = {
  /** An AppVoice id, which names the engine as well as the voice. */
  voiceId: string | null
  rate: number
  pitch: number
  theme: Theme
  /** Set once the reader has accepted the Kokoro model download. */
  kokoroAccepted: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  voiceId: null,
  rate: 1,
  pitch: 1,
  theme: 'system',
  kokoroAccepted: false,
}

interface AloudSchema extends DBSchema {
  documents: {
    key: string
    value: StoredDoc
    indexes: { addedAt: number }
  }
  progress: {
    key: string
    value: { docId: string; sentenceIndex: number; updatedAt: number }
  }
  settings: {
    key: string
    value: unknown
  }
  images: {
    key: string
    value: StoredImage
    indexes: { docId: string }
  }
}

const DB_NAME = 'aloud'
const DB_VERSION = 2

let connection: Promise<IDBPDatabase<AloudSchema>> | null = null
let blockedListener: (() => void) | null = null

/**
 * Called when this tab needs a newer database but another tab still has the
 * old one open. The upgrade waits until that tab closes or reloads.
 */
export function onUpgradeBlocked(listener: () => void): void {
  blockedListener = listener
}

function db(): Promise<IDBPDatabase<AloudSchema>> {
  if (connection) return connection
  connection = openDB<AloudSchema>(DB_NAME, DB_VERSION, {
    blocked() {
      blockedListener?.()
    },
    // A newer tab wants to upgrade: step aside rather than hold it up.
    blocking(_current, _blocked, event) {
      ;(event.target as IDBDatabase).close()
      connection = null
    },
    terminated() {
      connection = null
    },
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const documents = database.createObjectStore('documents', {
          keyPath: 'id',
        })
        documents.createIndex('addedAt', 'addedAt')
        database.createObjectStore('progress', { keyPath: 'docId' })
        database.createObjectStore('settings')
      }
      if (oldVersion < 2) {
        // Figures cropped out of PDFs, kept apart so the library list and
        // the document record stay small.
        database
          .createObjectStore('images', { keyPath: 'id' })
          .createIndex('docId', 'docId')
      }
    },
  })
  // A failed open must not be remembered for the rest of the session.
  connection.catch(() => {
    connection = null
  })
  return connection
}

/** Used by the tests to reopen the database, e.g. to exercise an upgrade. */
export async function closeLibrary(): Promise<void> {
  if (connection) (await connection).close()
  connection = null
}

/** Used by the tests to start from an empty library. */
export async function resetLibrary(): Promise<void> {
  await closeLibrary()
  await deleteDB(DB_NAME)
}

// ------------------------------------------------------------------ documents

export async function saveDoc(
  doc: StoredDoc,
  images: ParsedImage[] = [],
): Promise<void> {
  const tx = (await db()).transaction(['documents', 'images'], 'readwrite')
  await Promise.all([
    tx.objectStore('documents').put(doc),
    ...images.map((image) =>
      tx.objectStore('images').put({ ...image, docId: doc.id }),
    ),
    tx.done,
  ])
}

export async function loadDoc(id: string): Promise<StoredDoc | undefined> {
  return (await db()).get('documents', id)
}

export async function listDocs(): Promise<DocSummary[]> {
  const all = await (await db()).getAllFromIndex('documents', 'addedAt')
  return all
    .reverse()
    .map(({ blocks: _blocks, paragraphs: _paragraphs, ...summary }) => summary)
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return (await db()).get('images', id)
}

export async function deleteDoc(id: string): Promise<void> {
  const tx = (await db()).transaction(
    ['documents', 'progress', 'images'],
    'readwrite',
  )
  const images = tx.objectStore('images')
  const imageKeys = await images.index('docId').getAllKeys(id)
  await Promise.all([
    tx.objectStore('documents').delete(id),
    tx.objectStore('progress').delete(id),
    ...imageKeys.map((key) => images.delete(key)),
    tx.done,
  ])
}

// ------------------------------------------------------------------- progress

export async function saveProgress(
  docId: string,
  sentenceIndex: number,
): Promise<void> {
  await (await db()).put('progress', {
    docId,
    sentenceIndex,
    updatedAt: Date.now(),
  })
}

export async function getProgress(docId: string): Promise<number> {
  const record = await (await db()).get('progress', docId)
  return record?.sentenceIndex ?? 0
}

// ------------------------------------------------------------------- settings

export async function getSettings(): Promise<Settings> {
  const database = await db()
  const stored = (await database.get('settings', 'settings')) as
    | Partial<Settings>
    | undefined
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const database = await db()
  const current = await getSettings()
  await database.put('settings', { ...current, ...patch }, 'settings')
}
