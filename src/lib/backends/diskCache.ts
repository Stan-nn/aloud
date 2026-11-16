/**
 * The model's files, kept on disk by the desktop app.
 *
 * Inside Tauri the webview's own storage is the wrong place for 330 MB: the
 * dev server and the installed app are different origins, so each would
 * download separately, and the webview may evict it. The Rust side keeps the
 * files in the app's data folder instead (see `src-tauri/src/model_cache.rs`)
 * and this is the webview's view of that store, shaped like the part of the
 * Cache API that transformers.js uses.
 */

export const REPO_URL =
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/'

const VOICES_URL = `${REPO_URL}voices/`

export type Invoke = (
  command: string,
  args?: Record<string, unknown> | Uint8Array,
  options?: { headers: Record<string, string> },
) => Promise<unknown>

export type DiskCache = {
  match(key: string): Promise<Response | undefined>
  put(key: string, response: Response): Promise<void>
  has(keys: string[]): Promise<boolean[]>
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function createDiskCache(invoke: Invoke): DiskCache {
  return {
    async match(key) {
      // transformers.js also asks under a local `/models/...` path first; the
      // store would refuse it, so don't make the round trip.
      if (!key.startsWith(REPO_URL)) return undefined
      try {
        const bytes = (await invoke('model_cache_read', { key })) as ArrayBuffer
        return new Response(bytes, {
          headers: { 'Content-Length': String(bytes.byteLength) },
        })
      } catch {
        return undefined
      }
    },

    async put(key, response) {
      try {
        const bytes = new Uint8Array(await response.arrayBuffer())
        await invoke('model_cache_write', bytes, {
          headers: { 'x-cache-key': key },
        })
      } catch (error) {
        // Not being able to save is not a reason to stop speaking; it only
        // means the next launch downloads again.
        console.warn(`Unable to save ${key} to the model cache`, error)
      }
    },

    async has(keys) {
      try {
        return (await invoke('model_cache_has', { keys })) as boolean[]
      } catch {
        return keys.map(() => false)
      }
    },
  }
}

/**
 * kokoro-js fetches each voice from a fixed URL and keeps it in a Cache API
 * store of its own, with no way to point either elsewhere. Wrapping `fetch`
 * for those URLs alone gives voices the same home on disk as the model.
 */
export function installVoiceShim(
  cache: DiskCache,
  target: { fetch: typeof fetch } = window,
): void {
  const original = target.fetch.bind(target)

  target.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (!url.startsWith(VOICES_URL)) return original(input, init)

    const saved = await cache.match(url)
    if (saved) return saved

    const response = await original(input, init)
    if (response.status === 200) await cache.put(url, response.clone())
    return response
  }
}
