import type { env as TransformersEnv } from '@huggingface/transformers'
import { COMPACT_BUILD, FULL_BUILD, type ModelBuild } from './browser'
import {
  REPO_URL,
  createDiskCache,
  installVoiceShim,
  isTauri,
  type DiskCache,
  type Invoke,
} from './diskCache'

/**
 * Where the downloaded model is kept, and whether it is there yet.
 *
 * The desktop app keeps it as files on disk; the web build leaves it in the
 * browser's Cache API, where transformers.js puts it by default, and asks for
 * that storage not to be evicted. Either way, knowing what is already cached
 * is what lets a second launch skip the download and say so.
 */

export type ModelStore = {
  /** Point transformers.js at this store. Called before the model loads. */
  prepare(env: typeof TransformersEnv): Promise<void>
  /** Whether every file a build needs is already stored. */
  has(build: ModelBuild): Promise<boolean>
}

/** transformers.js's own Cache API store. */
const BROWSER_CACHE = 'transformers-cache'

export function modelFiles(build: ModelBuild): string[] {
  const model = build.dtype === 'fp32' ? 'model.onnx' : 'model_quantized.onnx'
  return [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    `onnx/${model}`,
  ].map((file) => REPO_URL + file)
}

export function createDiskModelStore(disk: DiskCache): ModelStore {
  let prepared = false
  return {
    async prepare(env) {
      env.useCustomCache = true
      env.customCache = disk
      // Otherwise the model is stored twice, once in the webview.
      env.useBrowserCache = false
      if (!prepared) installVoiceShim(disk)
      prepared = true
    },
    async has(build) {
      return (await disk.has(modelFiles(build))).every(Boolean)
    },
  }
}

export function createBrowserModelStore(): ModelStore {
  let persisted = false
  return {
    async prepare() {
      if (persisted) return
      persisted = true
      // Best-effort storage can be cleared whenever the browser is short of
      // space. Some browsers grant this silently, some ask, some refuse.
      try {
        await navigator.storage?.persist?.()
      } catch {
        // Refused: the model still caches, just without the guarantee.
      }
    },
    async has(build) {
      if (typeof caches === 'undefined') return false
      try {
        const cache = await caches.open(BROWSER_CACHE)
        const hits = await Promise.all(
          modelFiles(build).map((url) => cache.match(url)),
        )
        return hits.every(Boolean)
      } catch {
        return false
      }
    },
  }
}

export function createModelStore(): ModelStore {
  if (!isTauri()) return createBrowserModelStore()

  // Only the desktop app has, or needs, the Tauri API.
  const invoke: Invoke = async (command, args, options) => {
    const core = await import('@tauri-apps/api/core')
    return core.invoke(command, args, options)
  }
  return createDiskModelStore(createDiskCache(invoke))
}

/**
 * Which build to load. A build that is already stored wins over whatever this
 * machine would pick today, so a change in what detection reports never
 * means downloading the other one as well.
 */
export async function resolveBuild(
  store: ModelStore,
  detect: () => Promise<ModelBuild>,
): Promise<ModelBuild> {
  if (await store.has(FULL_BUILD)) return FULL_BUILD
  if (await store.has(COMPACT_BUILD)) return COMPACT_BUILD
  return detect()
}
