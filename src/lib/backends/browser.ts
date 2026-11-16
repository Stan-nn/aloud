import { KokoroBackend, type AudioPlayer, type KokoroModel } from './kokoro'
import type { SpeechBackend } from '../speech'
import type { ModelStore } from './modelStore'

/**
 * Where the app meets the browser.
 *
 * Everything here talks to APIs that only exist in a real browser tab, so it
 * is deliberately thin: the decisions worth testing live in the backends this
 * wires together.
 */

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export type ModelBuild = {
  dtype: 'fp32' | 'q8'
  device: 'webgpu' | 'wasm'
  /** Roughly what the reader is about to download, for saying so up front. */
  megabytes: number
}

/** Full precision needs WebGPU; on WASM it is too slow to listen to. */
export const FULL_BUILD: ModelBuild = {
  dtype: 'fp32',
  device: 'webgpu',
  megabytes: 310,
}

export const COMPACT_BUILD: ModelBuild = {
  dtype: 'q8',
  device: 'wasm',
  megabytes: 88,
}

export async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } })
    .gpu
  if (!gpu) return false
  try {
    return (await gpu.requestAdapter()) !== null
  } catch {
    return false
  }
}

/**
 * Which build this machine should download. The full-precision model is the
 * one worth having, but without WebGPU it would generate far slower than it
 * plays, so a machine without it gets the compact build instead.
 */
export async function chooseBuild(): Promise<ModelBuild> {
  return (await hasWebGPU()) ? FULL_BUILD : COMPACT_BUILD
}

export type DownloadProgress = {
  /** 0 to 1 across every file the model needs. */
  fraction: number
  megabytesDone: number
  megabytesTotal: number
}

type ProgressReport = {
  status?: string
  file?: string
  loaded?: number
  total?: number
}

/**
 * transformers.js reports progress per file. Totalling the files as they are
 * announced gives one figure that only moves forwards.
 */
export function createProgressAggregator(
  onProgress: (progress: DownloadProgress) => void,
): (report: ProgressReport) => void {
  const files = new Map<string, { loaded: number; total: number }>()
  const MB = 1024 * 1024

  return (report) => {
    if (!report.file || !report.total) return
    files.set(report.file, {
      loaded: report.loaded ?? 0,
      total: report.total,
    })

    let loaded = 0
    let total = 0
    for (const file of files.values()) {
      loaded += file.loaded
      total += file.total
    }

    onProgress({
      fraction: total > 0 ? Math.min(1, loaded / total) : 0,
      megabytesDone: Math.round(loaded / MB),
      megabytesTotal: Math.round(total / MB),
    })
  }
}

export async function loadKokoroModel(
  build: ModelBuild,
  store: ModelStore,
  onProgress: (progress: DownloadProgress) => void,
): Promise<KokoroModel> {
  const [{ KokoroTTS }, { env }] = await Promise.all([
    import('kokoro-js'),
    import('@huggingface/transformers'),
  ])

  // transformers.js points the ONNX runtime at a CDN, where the 22 MB wasm
  // would only ever sit in the HTTP cache. Left alone, the runtime loads the
  // copy Vite already bundles with the app.
  env.backends.onnx.wasm!.wasmPaths = undefined
  await store.prepare(env)

  // transformers.js reports progress for files it reads from its cache too,
  // which would announce a download that isn't happening.
  const cached = await store.has(build)
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    dtype: build.dtype,
    device: build.device,
    progress_callback: cached ? undefined : createProgressAggregator(onProgress),
  })

  // kokoro-js types the voice as a union of its 28 names. The id reaching here
  // has already been checked against that same catalogue, so this narrows the
  // string rather than widening the model's contract.
  type KokoroVoiceName = Parameters<typeof tts.generate>[1] extends
    | { voice?: infer V }
    | undefined
    ? V
    : never

  return {
    generate: (text, options) =>
      tts.generate(text, {
        voice: options.voice as KokoroVoiceName,
        speed: options.speed,
      }),
  }
}

/**
 * Plays one generated clip at a time through a single audio element, which
 * gives correct pause and resume for free.
 */
export function createAudioPlayer(): AudioPlayer {
  const audio = new Audio()
  let url: string | null = null
  let started = false

  const release = () => {
    if (url) URL.revokeObjectURL(url)
    url = null
  }

  return {
    play(blob, handlers) {
      release()
      started = false
      url = URL.createObjectURL(blob)
      audio.src = url

      // `playing` also fires on resume, but a sentence only starts once.
      audio.onplaying = () => {
        if (started) return
        started = true
        handlers.onStart()
      }
      audio.onended = () => handlers.onEnd()
      audio.onerror = () => handlers.onError()

      void audio.play().catch(() => handlers.onError())
    },
    pause() {
      audio.pause()
    },
    resume() {
      void audio.play().catch(() => {})
    },
    stop() {
      audio.pause()
      audio.onplaying = null
      audio.onended = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      release()
    },
  }
}

export type BrowserBackendOptions = {
  /** Waited on, so nothing loads before the machine's build is known. */
  build: () => Promise<ModelBuild>
  store: ModelStore
  onProgress: (progress: DownloadProgress) => void
}

export function createBrowserBackend(
  options: BrowserBackendOptions,
): SpeechBackend {
  return new KokoroBackend({
    loadModel: async () =>
      loadKokoroModel(await options.build(), options.store, options.onProgress),
    player: createAudioPlayer(),
  })
}
