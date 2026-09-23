import { create } from 'zustand'
import { SpeechEngine, type EngineState } from '../lib/speech'
import { segmentBlocks, type Sentence } from '../lib/segment'
import type { Block } from '../lib/blocks'
import * as db from '../lib/db'
import type { DocSummary, Settings, StoredDoc, Theme } from '../lib/db'
import { kokoroVoices, pickDefaultVoice, type AppVoice } from '../lib/voices'
import {
  chooseBuild,
  createBrowserBackend,
  FULL_BUILD,
  type DownloadProgress,
  type ModelBuild,
} from '../lib/backends/browser'
import { parseFile, parsePastedText, type ParsedDoc } from '../lib/parse'

export type Message = { text: string; tone: 'error' | 'info' }

type State = {
  ready: boolean
  busy: string | null
  docs: DocSummary[]
  progressByDoc: Record<string, number>
  doc: StoredDoc | null
  blocks: Block[]
  sentences: Sentence[]
  index: number
  playback: EngineState
  settings: Settings
  voices: AppVoice[]
  /** Which Kokoro build this machine will download, once known. */
  modelBuild: ModelBuild
  modelState: 'absent' | 'downloading' | 'ready'
  modelProgress: DownloadProgress | null
  libraryOpen: boolean
  panelOpen: boolean
  shortcutsOpen: boolean
  message: Message | null

  init: () => Promise<void>
  addFile: (file: File) => Promise<void>
  addPastedText: (text: string) => Promise<void>
  openDoc: (id: string) => Promise<void>
  removeDoc: (id: string) => Promise<void>
  closeDoc: () => void

  toggle: () => void
  next: () => void
  previous: () => void
  jumpTo: (index: number) => void

  setRate: (rate: number) => void
  setVoice: (voiceId: string) => void
  setTheme: (theme: Theme) => void
  previewVoice: () => void

  toggleLibrary: () => void
  togglePanel: () => void
  toggleShortcuts: () => void
  dismissMessage: () => void
}

/**
 * Built on first use rather than at import, because the backend reads the
 * chosen model build out of the store — which does not exist yet while this
 * module is still being evaluated.
 */
let built: SpeechEngine | null | undefined

function engine(): SpeechEngine | null {
  if (built === undefined) built = createEngine()
  return built
}

function createEngine(): SpeechEngine | null {
  // Kokoro's clips play through an audio element; without one there is
  // nothing to speak with.
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null
  }

  const backend = createBrowserBackend({
    // Settled before the model is first needed; the default is only a
    // placeholder for the moment before detection finishes.
    get build() {
      return useStore.getState().modelBuild
    },
    onProgress: (progress) => {
      useStore.setState({ modelProgress: progress, modelState: 'downloading' })
    },
  })

  return new SpeechEngine({ backend })
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong reading that file.'
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export const useStore = create<State>((set, get) => {
  /** Load a parsed document into the reader and remember it. */
  async function present(doc: StoredDoc, startAt: number) {
    const blocks = db.docBlocks(doc)
    const sentences = segmentBlocks(blocks)
    const index = startAt >= sentences.length ? 0 : startAt

    engine()?.load(sentences.map((s) => s.text))
    engine()?.jumpTo(index)

    set({
      doc,
      blocks,
      sentences,
      index,
      playback: 'ready',
      busy: null,
      panelOpen: false,
    })
  }

  async function store(parsed: ParsedDoc): Promise<StoredDoc> {
    const doc: StoredDoc = {
      id: crypto.randomUUID(),
      title: parsed.title,
      source: parsed.source,
      addedAt: Date.now(),
      wordCount: parsed.wordCount,
      blocks: parsed.blocks,
    }
    await db.saveDoc(doc, parsed.images)
    return doc
  }

  async function refreshLibrary() {
    const docs = await db.listDocs()
    const positions = await Promise.all(docs.map((d) => db.getProgress(d.id)))
    const progressByDoc: Record<string, number> = {}
    docs.forEach((d, i) => (progressByDoc[d.id] = positions[i]!))
    set({ docs, progressByDoc })
  }

  return {
    ready: false,
    busy: null,
    docs: [],
    progressByDoc: {},
    doc: null,
    blocks: [],
    sentences: [],
    index: 0,
    playback: 'ready',
    settings: db.DEFAULT_SETTINGS,
    voices: [],
    modelBuild: FULL_BUILD,
    modelState: 'absent',
    modelProgress: null,
    libraryOpen: false,
    panelOpen: false,
    shortcutsOpen: false,
    message: null,

    async init() {
      db.onUpgradeBlocked(() =>
        set({
          message: {
            tone: 'info',
            text: 'Aloud has been updated. Close its other tabs so your library can open.',
          },
        }),
      )
      const settings = await db.getSettings()
      applyTheme(settings.theme)

      engine()?.setRate(settings.rate)

      engine()?.on('sentence', (index) => {
        set((s) =>
          s.modelState === 'downloading'
            ? { index, modelState: 'ready', modelProgress: null }
            : { index },
        )
        const doc = get().doc
        if (doc) void db.saveProgress(doc.id, index)
      })

      engine()?.on('state', (playback) => set({ playback }))

      engine()?.on('done', () => {
        const { doc, sentences } = get()
        if (doc) {
          void db.saveProgress(doc.id, sentences.length)
          set((s) => ({
            progressByDoc: {
              ...s.progressByDoc,
              [doc.id]: sentences.length,
            },
          }))
        }
      })

      engine()?.on('error', () => {
        set({
          message: {
            tone: 'error',
            text: 'Speech stopped unexpectedly. Press play to pick up where it left off.',
          },
        })
      })

      const voices = kokoroVoices()
      const voice = pickDefaultVoice(voices, settings.voiceId)
      engine()?.setVoice(voice)

      // Knowing whether this machine has WebGPU decides which build a reader
      // would be asked to download, so the panel can say the size up front.
      void chooseBuild().then((modelBuild) => set({ modelBuild }))

      set({
        settings: { ...settings, voiceId: voice?.id ?? null },
        voices,
        ready: true,
      })

      await refreshLibrary()
    },

    async addFile(file) {
      set({ busy: `Reading ${file.name}`, message: null })
      try {
        const doc = await store(await parseFile(file))
        await refreshLibrary()
        await present(doc, 0)
      } catch (error) {
        set({
          busy: null,
          message: { tone: 'error', text: messageFor(error) },
        })
      }
    },

    async addPastedText(text) {
      set({ busy: 'Preparing your text', message: null })
      try {
        const doc = await store(parsePastedText(text))
        await refreshLibrary()
        await present(doc, 0)
      } catch (error) {
        set({
          busy: null,
          message: { tone: 'error', text: messageFor(error) },
        })
      }
    },

    async openDoc(id) {
      const doc = await db.loadDoc(id)
      if (!doc) return
      const startAt = await db.getProgress(id)
      await present(doc, startAt)
    },

    async removeDoc(id) {
      await db.deleteDoc(id)
      if (get().doc?.id === id) get().closeDoc()
      await refreshLibrary()
    },

    closeDoc() {
      engine()?.stop()
      engine()?.load([])
      set({ doc: null, blocks: [], sentences: [], index: 0, playback: 'ready' })
    },

    toggle() {
      engine()?.toggle()
    },

    next() {
      const running = engine()
      running?.next()
      if (running) set({ index: running.index })
    },

    previous() {
      const running = engine()
      running?.previous()
      if (running) set({ index: running.index })
    },

    jumpTo(index) {
      engine()?.jumpTo(index)
      set({ index })
      const doc = get().doc
      if (doc) void db.saveProgress(doc.id, index)
    },

    setRate(rate) {
      engine()?.setRate(rate)
      set((s) => ({ settings: { ...s.settings, rate } }))
      void db.saveSettings({ rate })
    },

    setVoice(voiceId) {
      const voice = get().voices.find((v) => v.id === voiceId) ?? null
      engine()?.setVoice(voice)

      // The model is fetched when a sentence is actually spoken, not when a
      // voice is picked, so download state is left to the progress reports
      // rather than guessed at here.
      const kokoro = voice?.engine === 'kokoro'
      set((s) => ({
        settings: {
          ...s.settings,
          voiceId,
          kokoroAccepted: s.settings.kokoroAccepted || kokoro,
        },
      }))
      void db.saveSettings({ voiceId, ...(kokoro ? { kokoroAccepted: true } : {}) })
    },

    setTheme(theme) {
      applyTheme(theme)
      set((s) => ({ settings: { ...s.settings, theme } }))
      void db.saveSettings({ theme })
    },

    previewVoice() {
      const { settings, voices } = get()
      const voice = voices.find((v) => v.id === settings.voiceId) ?? null
      const backendEngine = engine()
      if (!backendEngine) return

      // Preview borrows the engine, so it downloads the model exactly as
      // playback would.
      backendEngine.load(['The quick brown fox jumps over the lazy dog.'])
      backendEngine.setVoice(voice)
      backendEngine.play(0)

      // Put the document back once the sample has been queued.
      const { doc, sentences, index } = get()
      const restore = backendEngine.on('done', () => {
        restore()
        if (!doc) return
        backendEngine.load(sentences.map((s) => s.text))
        backendEngine.jumpTo(index)
      })
    },

    toggleLibrary: () => set((s) => ({ libraryOpen: !s.libraryOpen })),
    togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
    toggleShortcuts: () => set((s) => ({ shortcutsOpen: !s.shortcutsOpen })),
    dismissMessage: () => set({ message: null }),
  }
})
