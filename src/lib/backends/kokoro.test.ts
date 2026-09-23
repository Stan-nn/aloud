import { beforeEach, describe, expect, test, vi } from 'vitest'
import { KokoroBackend } from './kokoro'
import type { AudioPlayer, KokoroModel } from './kokoro'
import type { SpeakRequest, SpeechRequest } from '../speech'

const VOICE = {
  id: 'kokoro:af_heart',
  engine: 'kokoro' as const,
  name: 'Heart',
  lang: 'en-US',
  onDevice: true,
}

/** jsdom's Blob cannot be read back, so each clip is tagged with its text. */
const clipText = new WeakMap<Blob, string>()

class FakeModel implements KokoroModel {
  calls: { text: string; voice: string; speed: number }[] = []
  failOn: string | null = null

  async generate(text: string, options: { voice: string; speed: number }) {
    this.calls.push({ text, voice: options.voice, speed: options.speed })
    if (this.failOn === text) throw new Error('generation failed')
    return {
      toBlob: () => {
        const blob = new Blob([text], { type: 'audio/wav' })
        clipText.set(blob, text)
        return blob
      },
    }
  }
  get texts() {
    return this.calls.map((c) => c.text)
  }
}

class FakePlayer implements AudioPlayer {
  played: Blob[] = []
  stopped = 0
  paused = 0
  resumed = 0
  private handlers: {
    onStart(): void
    onEnd(): void
    onError(): void
  } | null = null

  play(blob: Blob, handlers: { onStart(): void; onEnd(): void; onError(): void }) {
    this.played.push(blob)
    this.handlers = handlers
    handlers.onStart()
  }
  pause() {
    this.paused++
  }
  resume() {
    this.resumed++
  }
  stop() {
    this.stopped++
    this.handlers = null
  }
  /** What the browser does when the clip reaches its end. */
  finish() {
    this.handlers?.onEnd()
  }
  fail() {
    this.handlers?.onError()
  }
  text(index = this.played.length - 1) {
    return clipText.get(this.played[index]!)
  }
}

let model: FakeModel
let player: FakePlayer
let loads: number
let backend: KokoroBackend

const request = (
  text: string,
  overrides: Partial<SpeakRequest> = {},
): SpeakRequest => ({
  text,
  voice: VOICE,
  rate: 1,
  pitch: 1,
  onStart: vi.fn(),
  onEnd: vi.fn(),
  onError: vi.fn(),
  ...overrides,
})

const plain = (text: string, rate = 1): SpeechRequest => ({
  text,
  voice: VOICE,
  rate,
  pitch: 1,
})

beforeEach(() => {
  model = new FakeModel()
  player = new FakePlayer()
  loads = 0
  backend = new KokoroBackend({
    loadModel: async () => {
      loads++
      return model
    },
    player,
  })
})

describe('speaking', () => {
  test('generates audio for the sentence', async () => {
    backend.speak(request('Hello there.'))
    await vi.waitFor(() => expect(model.texts).toEqual(['Hello there.']))
  })

  test('generates with the chosen voice', async () => {
    backend.speak(request('Hello.'))
    await vi.waitFor(() => expect(model.calls[0]?.voice).toBe('af_heart'))
  })

  test('plays what it generated', async () => {
    backend.speak(request('Hello.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    expect(player.text()).toBe('Hello.')
  })

  test('reports when playback begins', async () => {
    const r = request('Hello.')
    backend.speak(r)
    await vi.waitFor(() => expect(r.onStart).toHaveBeenCalledOnce())
  })

  test('reports when playback ends', async () => {
    const r = request('Hello.')
    backend.speak(r)
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    player.finish()
    expect(r.onEnd).toHaveBeenCalledOnce()
  })

  test('loads the model only once across sentences', async () => {
    backend.speak(request('One.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    backend.speak(request('Two.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(2))
    expect(loads).toBe(1)
  })
})

describe('speed', () => {
  test('passes the reading speed to the model', async () => {
    backend.speak(request('Hello.', { rate: 1.5 }))
    await vi.waitFor(() => expect(model.calls[0]?.speed).toBe(1.5))
  })

  test('regenerates when the speed changes, rather than reusing the clip', async () => {
    backend.speak(request('Hello.', { rate: 1 }))
    await vi.waitFor(() => expect(model.texts).toHaveLength(1))
    backend.speak(request('Hello.', { rate: 2 }))
    await vi.waitFor(() => expect(model.texts).toHaveLength(2))
  })
})

describe('preparing ahead', () => {
  test('generates the coming sentences', async () => {
    backend.prefetch([plain('Two.'), plain('Three.')])
    await vi.waitFor(() => expect(model.texts).toEqual(['Two.', 'Three.']))
  })

  test('does not play anything it prepared', async () => {
    backend.prefetch([plain('Two.')])
    await vi.waitFor(() => expect(model.texts).toEqual(['Two.']))
    expect(player.played).toHaveLength(0)
  })

  test('plays a prepared sentence without generating it again', async () => {
    backend.prefetch([plain('Two.')])
    await vi.waitFor(() => expect(model.texts).toEqual(['Two.']))
    backend.speak(request('Two.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    expect(model.texts).toEqual(['Two.'])
  })

  test('does not generate the same sentence twice at once', async () => {
    backend.prefetch([plain('Two.'), plain('Two.')])
    await vi.waitFor(() => expect(model.texts).toHaveLength(1))
  })

  test('ignores a failure while preparing', async () => {
    model.failOn = 'Two.'
    expect(() => backend.prefetch([plain('Two.')])).not.toThrow()
    await vi.waitFor(() => expect(model.texts).toEqual(['Two.']))
  })
})

describe('interruption', () => {
  test('cancel stops playback', async () => {
    backend.speak(request('Hello.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    backend.cancel()
    expect(player.stopped).toBe(1)
  })

  test('a sentence cancelled before its audio was ready is never played', async () => {
    backend.speak(request('Hello.'))
    backend.cancel()
    await vi.waitFor(() => expect(model.texts).toEqual(['Hello.']))
    expect(player.played).toHaveLength(0)
  })

  test('a cancelled sentence does not report that it ended', async () => {
    const r = request('Hello.')
    backend.speak(r)
    backend.cancel()
    await vi.waitFor(() => expect(model.texts).toHaveLength(1))
    expect(r.onEnd).not.toHaveBeenCalled()
  })

  test('pause holds playback', () => {
    backend.pause()
    expect(player.paused).toBe(1)
  })

  test('resume carries on', () => {
    backend.resume()
    expect(player.resumed).toBe(1)
  })
})

describe('trouble', () => {
  test('reports a generation failure', async () => {
    model.failOn = 'Bad.'
    const r = request('Bad.')
    backend.speak(r)
    await vi.waitFor(() => expect(r.onError).toHaveBeenCalledOnce())
  })

  test('does not try to play audio that failed to generate', async () => {
    model.failOn = 'Bad.'
    backend.speak(request('Bad.'))
    await vi.waitFor(() => expect(model.texts).toEqual(['Bad.']))
    expect(player.played).toHaveLength(0)
  })

  test('reports a playback failure', async () => {
    const r = request('Hello.')
    backend.speak(r)
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
    player.fail()
    expect(r.onError).toHaveBeenCalledOnce()
  })

  test('can speak again after a failure', async () => {
    model.failOn = 'Bad.'
    backend.speak(request('Bad.'))
    await vi.waitFor(() => expect(model.texts).toEqual(['Bad.']))
    backend.speak(request('Good.'))
    await vi.waitFor(() => expect(player.played).toHaveLength(1))
  })

  test('reports a model that will not load', async () => {
    const broken = new KokoroBackend({
      loadModel: async () => {
        throw new Error('no WebGPU')
      },
      player,
    })
    const r = request('Hello.')
    broken.speak(r)
    await vi.waitFor(() => expect(r.onError).toHaveBeenCalledOnce())
  })

  test('refuses a voice that is not in the Kokoro catalogue', async () => {
    const r = request('Hello.', {
      voice: { ...VOICE, id: 'system:Samantha' },
    })
    backend.speak(r)
    await vi.waitFor(() => expect(r.onError).toHaveBeenCalledOnce())
    expect(model.texts).toEqual([])
  })
})
