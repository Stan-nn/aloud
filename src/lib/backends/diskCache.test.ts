import { describe, expect, test, vi } from 'vitest'
import { REPO_URL, createDiskCache, installVoiceShim, type Invoke } from './diskCache'

const CONFIG = `${REPO_URL}config.json`
const VOICE = `${REPO_URL}voices/af_heart.bin`

/** A fake of the Rust commands, holding files in memory. */
function fakeDisk(files = new Map<string, Uint8Array>()) {
  const invoke = vi.fn<Invoke>(async (command, args, options) => {
    if (command === 'model_cache_read') {
      const bytes = files.get((args as { key: string }).key)
      if (!bytes) throw new Error('missing')
      return bytes.slice().buffer
    }
    if (command === 'model_cache_write') {
      files.set(options!.headers['x-cache-key']!, args as Uint8Array)
      return null
    }
    if (command === 'model_cache_has') {
      return (args as { keys: string[] }).keys.map((key) => files.has(key))
    }
    throw new Error(`unknown command ${command}`)
  })
  return { files, invoke, cache: createDiskCache(invoke) }
}

const bytes = (...values: number[]) => new Uint8Array(values)

describe('createDiskCache', () => {
  test('a stored file comes back as a response', async () => {
    const { cache } = fakeDisk(new Map([[CONFIG, bytes(1, 2, 3)]]))
    const response = await cache.match(CONFIG)
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(bytes(1, 2, 3))
    expect(response!.headers.get('Content-Length')).toBe('3')
  })

  test('a missing file is a miss, not an error', async () => {
    const { cache } = fakeDisk()
    expect(await cache.match(CONFIG)).toBeUndefined()
  })

  test('a key outside the repo is a miss without asking the disk', async () => {
    const { cache, invoke } = fakeDisk()
    expect(await cache.match('/models/onnx-community/x/config.json')).toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })

  test('put sends the raw bytes with the key in a header', async () => {
    const { cache, invoke, files } = fakeDisk()
    await cache.put(CONFIG, new Response(bytes(7, 8)))
    expect(invoke).toHaveBeenCalledWith('model_cache_write', bytes(7, 8), {
      headers: { 'x-cache-key': CONFIG },
    })
    expect(files.get(CONFIG)).toEqual(bytes(7, 8))
  })

  test('a failed save does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cache = createDiskCache(async () => {
      throw new Error('disk full')
    })
    await expect(cache.put(CONFIG, new Response(bytes(1)))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('has reports each key', async () => {
    const { cache } = fakeDisk(new Map([[CONFIG, bytes(1)]]))
    expect(await cache.has([CONFIG, VOICE])).toEqual([true, false])
  })
})

describe('installVoiceShim', () => {
  function shimmed(disk: ReturnType<typeof fakeDisk>, status = 200) {
    const network = vi.fn<typeof fetch>(
      async () => new Response(bytes(9, 9), { status }),
    )
    const target = { fetch: network }
    installVoiceShim(disk.cache, target)
    return { network, fetch: target.fetch }
  }

  test('a saved voice is served from disk', async () => {
    const disk = fakeDisk(new Map([[VOICE, bytes(4, 5)]]))
    const { network, fetch } = shimmed(disk)
    const response = await fetch(VOICE)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes(4, 5))
    expect(network).not.toHaveBeenCalled()
  })

  test('a new voice is fetched once and saved', async () => {
    const disk = fakeDisk()
    const { network, fetch } = shimmed(disk)
    const response = await fetch(VOICE)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes(9, 9))
    expect(disk.files.get(VOICE)).toEqual(bytes(9, 9))

    await fetch(VOICE)
    expect(network).toHaveBeenCalledTimes(1)
  })

  test('a failed voice download is not saved', async () => {
    const disk = fakeDisk()
    const { fetch } = shimmed(disk, 404)
    await fetch(VOICE)
    expect(disk.files.has(VOICE)).toBe(false)
  })

  test('other requests pass straight through', async () => {
    const disk = fakeDisk()
    const { network, fetch } = shimmed(disk)
    await fetch(CONFIG)
    await fetch(new URL('https://example.com/voices/af_heart.bin'))
    expect(network).toHaveBeenCalledTimes(2)
    expect(disk.invoke).not.toHaveBeenCalled()
  })
})
