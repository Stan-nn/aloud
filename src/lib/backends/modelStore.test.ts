import { afterEach, describe, expect, test, vi } from 'vitest'
import { COMPACT_BUILD, FULL_BUILD, type ModelBuild } from './browser'
import { REPO_URL, type DiskCache } from './diskCache'
import {
  createBrowserModelStore,
  createDiskModelStore,
  modelFiles,
  resolveBuild,
  type ModelStore,
} from './modelStore'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('modelFiles', () => {
  test('the full build needs the full-precision model', () => {
    expect(modelFiles(FULL_BUILD)).toEqual([
      `${REPO_URL}config.json`,
      `${REPO_URL}tokenizer.json`,
      `${REPO_URL}tokenizer_config.json`,
      `${REPO_URL}onnx/model.onnx`,
    ])
  })

  test('the compact build needs the quantized model', () => {
    expect(modelFiles(COMPACT_BUILD)).toContain(
      `${REPO_URL}onnx/model_quantized.onnx`,
    )
  })
})

describe('resolveBuild', () => {
  const storeHolding = (...builds: ModelBuild[]): ModelStore => ({
    prepare: async () => {},
    has: async (build) => builds.includes(build),
  })

  test('a stored full build is kept', async () => {
    const detect = vi.fn(async () => COMPACT_BUILD)
    expect(await resolveBuild(storeHolding(FULL_BUILD), detect)).toBe(FULL_BUILD)
    expect(detect).not.toHaveBeenCalled()
  })

  test('a stored compact build is kept even where WebGPU would allow full', async () => {
    const detect = vi.fn(async () => FULL_BUILD)
    expect(await resolveBuild(storeHolding(COMPACT_BUILD), detect)).toBe(
      COMPACT_BUILD,
    )
    expect(detect).not.toHaveBeenCalled()
  })

  test('with nothing stored, the machine decides', async () => {
    const detect = vi.fn(async () => COMPACT_BUILD)
    expect(await resolveBuild(storeHolding(), detect)).toBe(COMPACT_BUILD)
    expect(detect).toHaveBeenCalledTimes(1)
  })
})

describe('createBrowserModelStore', () => {
  function fakeCaches(urls: string[]) {
    const stored = new Set(urls)
    return {
      open: async () => ({
        match: async (url: string) => (stored.has(url) ? new Response('') : undefined),
      }),
    }
  }

  test('a build is stored only when every file is', async () => {
    vi.stubGlobal('caches', fakeCaches(modelFiles(COMPACT_BUILD)))
    const store = createBrowserModelStore()
    expect(await store.has(COMPACT_BUILD)).toBe(true)
    expect(await store.has(FULL_BUILD)).toBe(false)
  })

  test('without the Cache API nothing is stored', async () => {
    vi.stubGlobal('caches', undefined)
    expect(await createBrowserModelStore().has(FULL_BUILD)).toBe(false)
  })

  test('asks once for storage that will not be evicted', async () => {
    const persist = vi.fn(async () => true)
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } })
    const store = createBrowserModelStore()
    const env = {} as Parameters<ModelStore['prepare']>[0]
    await store.prepare(env)
    await store.prepare(env)
    expect(persist).toHaveBeenCalledTimes(1)
  })
})

describe('createDiskModelStore', () => {
  const disk = (stored: string[]): DiskCache => ({
    match: async () => undefined,
    put: async () => {},
    has: async (keys) => keys.map((key) => stored.includes(key)),
  })

  test('points transformers.js at the disk instead of the webview', async () => {
    const originalFetch = window.fetch
    const cache = disk([])
    const env = { useBrowserCache: true } as Parameters<ModelStore['prepare']>[0]
    await createDiskModelStore(cache).prepare(env)
    expect(env).toMatchObject({
      useCustomCache: true,
      customCache: cache,
      useBrowserCache: false,
    })
    // Voices are routed to disk too.
    expect(window.fetch).not.toBe(originalFetch)
    window.fetch = originalFetch
  })

  test('a build is stored only when every file is', async () => {
    const store = createDiskModelStore(disk(modelFiles(FULL_BUILD)))
    expect(await store.has(FULL_BUILD)).toBe(true)
    expect(await store.has(COMPACT_BUILD)).toBe(false)
  })
})
