import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SpeechEngine } from './speech'
import type { SpeakRequest, SpeechBackend, SpeechRequest } from './speech'
import type { AppVoice } from './voices'

/**
 * A stand-in for a real speech backend. It records what it was asked to say
 * and lets a test drive the callbacks a backend fires asynchronously, so the
 * queue logic can be tested without making a sound.
 */
class FakeBackend implements SpeechBackend {
  spoken: SpeakRequest[] = []
  prefetched: SpeechRequest[][] = []
  cancelled = 0
  paused = 0
  resumed = 0

  speak(request: SpeakRequest) {
    this.spoken.push(request)
  }
  cancel() {
    this.cancelled++
  }
  pause() {
    this.paused++
  }
  resume() {
    this.resumed++
  }
  prefetch(requests: SpeechRequest[]) {
    this.prefetched.push(requests)
  }

  get current(): SpeakRequest {
    const request = this.spoken[this.spoken.length - 1]
    if (!request) throw new Error('nothing was spoken')
    return request
  }
  get texts(): string[] {
    return this.spoken.map((request) => request.text)
  }
  /** Run a sentence to completion, the way a backend would. */
  finish(request: SpeakRequest = this.current) {
    request.onStart()
    request.onEnd()
  }
}

const SENTENCES = ['One.', 'Two.', 'Three.']

let synth: FakeBackend
let engine: SpeechEngine

function build(
  options: { restartSentenceOnResume?: boolean; lookahead?: number } = {},
) {
  synth = new FakeBackend()
  engine = new SpeechEngine({ backend: synth, ...options })
  engine.load(SENTENCES)
  return engine
}

beforeEach(() => build())

describe('playing', () => {
  test('speaks the first sentence', () => {
    engine.play()
    expect(synth.texts).toEqual(['One.'])
  })

  test('reports the sentence when the browser starts speaking it', () => {
    const heard = vi.fn()
    engine.on('sentence', heard)
    engine.play()
    synth.current.onStart()
    expect(heard).toHaveBeenCalledWith(0)
  })

  test('moves to the next sentence when one finishes', () => {
    engine.play()
    synth.finish()
    expect(synth.texts).toEqual(['One.', 'Two.'])
  })

  test('works through every sentence in order', () => {
    engine.play()
    synth.finish()
    synth.finish()
    expect(synth.texts).toEqual(['One.', 'Two.', 'Three.'])
  })

  test('reports the document finished after the last sentence', () => {
    const done = vi.fn()
    engine.on('done', done)
    engine.play()
    synth.finish()
    synth.finish()
    synth.finish()
    expect(done).toHaveBeenCalledOnce()
  })

  test('does not speak past the last sentence', () => {
    engine.play()
    synth.finish()
    synth.finish()
    synth.finish()
    expect(synth.texts).toHaveLength(3)
  })

  test('starts from the sentence it is given', () => {
    engine.play(2)
    expect(synth.texts).toEqual(['Three.'])
  })

  test('speaks nothing when the document is empty', () => {
    engine.load([])
    engine.play()
    expect(synth.spoken).toHaveLength(0)
  })
})

describe('moving around', () => {
  test('jumping speaks the chosen sentence', () => {
    engine.play()
    engine.jumpTo(2)
    expect(synth.texts).toEqual(['One.', 'Three.'])
  })

  test('jumping cancels whatever is being spoken', () => {
    engine.play()
    engine.jumpTo(2)
    expect(synth.cancelled).toBe(1)
  })

  test('a cancelled sentence cannot advance the queue', () => {
    engine.play()
    const abandoned = synth.current
    engine.jumpTo(2)
    abandoned.onEnd() // the browser fires this on cancel
    expect(synth.texts).toEqual(['One.', 'Three.'])
  })

  test('jumping while paused does not start speaking', () => {
    engine.play()
    engine.pause()
    engine.jumpTo(2)
    expect(synth.texts).toEqual(['One.'])
  })

  test('jumping while paused still moves the position', () => {
    engine.play()
    engine.pause()
    engine.jumpTo(2)
    expect(engine.index).toBe(2)
  })

  test('jumping before playback begins only moves the position', () => {
    engine.jumpTo(1)
    expect(synth.spoken).toHaveLength(0)
    expect(engine.index).toBe(1)
  })

  test('next moves on by one sentence', () => {
    engine.play()
    engine.next()
    expect(synth.texts).toEqual(['One.', 'Two.'])
  })

  test('previous goes back by one sentence', () => {
    engine.play(2)
    engine.previous()
    expect(synth.texts).toEqual(['Three.', 'Two.'])
  })

  test('previous at the start stays at the start', () => {
    engine.play()
    engine.previous()
    expect(engine.index).toBe(0)
  })

  test('next at the end finishes the document', () => {
    const done = vi.fn()
    engine.on('done', done)
    engine.play(2)
    engine.next()
    expect(done).toHaveBeenCalledOnce()
  })
})

describe('pausing', () => {
  test('pause asks the browser to hold', () => {
    engine.play()
    engine.pause()
    expect(synth.paused).toBe(1)
  })

  test('pause reports the paused state', () => {
    engine.play()
    engine.pause()
    expect(engine.state).toBe('paused')
  })

  test('resume asks the browser to carry on', () => {
    engine.play()
    engine.pause()
    engine.resume()
    expect(synth.resumed).toBe(1)
  })

  test('resume reports speaking again', () => {
    engine.play()
    engine.pause()
    engine.resume()
    expect(engine.state).toBe('speaking')
  })

  test('pausing when nothing is playing does nothing', () => {
    engine.pause()
    expect(synth.paused).toBe(0)
  })

  test('where resume is unreliable, the sentence is spoken again instead', () => {
    build({ restartSentenceOnResume: true })
    engine.play()
    engine.pause()
    engine.resume()
    expect(synth.texts).toEqual(['One.', 'One.'])
    expect(synth.resumed).toBe(0)
  })
})

describe('stopping', () => {
  test('stop cancels the browser queue', () => {
    engine.play()
    engine.stop()
    expect(synth.cancelled).toBe(1)
  })

  test('stop returns the engine to a ready state', () => {
    engine.play()
    engine.stop()
    expect(engine.state).toBe('ready')
  })

  test('stop keeps the position, so play resumes from there', () => {
    engine.play(1)
    engine.stop()
    engine.play()
    expect(synth.texts).toEqual(['Two.', 'Two.'])
  })
})

describe('voice settings', () => {
  test('applies the rate to each sentence', () => {
    engine.setRate(1.5)
    engine.play()
    expect(synth.current.rate).toBe(1.5)
  })

  test('applies the pitch to each sentence', () => {
    engine.setPitch(0.8)
    engine.play()
    expect(synth.current.pitch).toBe(0.8)
  })

  test('applies the voice to each sentence', () => {
    const voice = { id: 'system:Daniel', name: 'Daniel' } as AppVoice
    engine.setVoice(voice)
    engine.play()
    expect(synth.current.voice).toBe(voice)
  })

  test('changing speed mid-sentence restarts it at the new speed', () => {
    engine.play()
    engine.setRate(2)
    expect(synth.texts).toEqual(['One.', 'One.'])
    expect(synth.current.rate).toBe(2)
  })

  test('changing speed while paused does not start playback', () => {
    engine.play()
    engine.pause()
    engine.setRate(2)
    expect(synth.texts).toEqual(['One.'])
  })
})

describe('reporting trouble', () => {
  test('passes on a failure from the browser', () => {
    const failed = vi.fn()
    engine.on('error', failed)
    engine.play()
    synth.current.onError()
    expect(failed).toHaveBeenCalledOnce()
  })

  test('stops speaking after a failure', () => {
    engine.play()
    synth.current.onError()
    expect(engine.state).toBe('ready')
  })
})

describe('listeners', () => {
  test('a listener can be removed', () => {
    const heard = vi.fn()
    const off = engine.on('sentence', heard)
    off()
    engine.play()
    synth.current.onStart()
    expect(heard).not.toHaveBeenCalled()
  })

  test('announces each state change', () => {
    const states: string[] = []
    engine.on('state', (s) => states.push(s))
    engine.play()
    engine.pause()
    engine.resume()
    engine.stop()
    expect(states).toEqual(['speaking', 'paused', 'speaking', 'ready'])
  })
})

describe('preparing sentences ahead', () => {
  test('asks the backend to prepare what comes next', () => {
    engine.play()
    expect(synth.prefetched.at(-1)?.map((r) => r.text)).toEqual([
      'Two.',
      'Three.',
    ])
  })

  test('prepares with the settings the sentences will be spoken at', () => {
    engine.setRate(1.6)
    engine.play()
    expect(synth.prefetched.at(-1)?.[0]?.rate).toBe(1.6)
  })

  test('does not prepare past the end of the document', () => {
    engine.play(2)
    expect(synth.prefetched).toEqual([])
  })

  test('prepares fewer sentences near the end', () => {
    engine.play(1)
    expect(synth.prefetched.at(-1)?.map((r) => r.text)).toEqual(['Three.'])
  })

  test('honours a lookahead of one', () => {
    build({ lookahead: 1 })
    engine.play()
    expect(synth.prefetched.at(-1)?.map((r) => r.text)).toEqual(['Two.'])
  })

  test('does not prepare anything when lookahead is off', () => {
    build({ lookahead: 0 })
    engine.play()
    expect(synth.prefetched).toEqual([])
  })

  test('works with a backend that cannot prepare anything', () => {
    const minimal: SpeechBackend = {
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
    }
    const plain = new SpeechEngine({ backend: minimal })
    plain.load(SENTENCES)
    expect(() => plain.play()).not.toThrow()
  })
})
