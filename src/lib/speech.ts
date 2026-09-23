import type { AppVoice } from './voices'

/**
 * The speech queue.
 *
 * Chrome silently drops a single utterance after roughly fifteen seconds, so
 * a whole document cannot be handed over at once. The fix and the feature turn
 * out to be the same thing: speak one sentence per utterance and queue the
 * next when it ends. That also gives us the highlight, click-to-jump,
 * next/previous, and a position accurate enough to resume from.
 *
 * The engine knows nothing about how a sentence becomes sound. A backend
 * either hands the text to the browser or generates audio from a model, and
 * the queue is identical either way — which is also what lets it be tested
 * without making a sound.
 */

export type SpeechRequest = {
  text: string
  voice: AppVoice | null
  rate: number
  pitch: number
}

export type SpeakRequest = SpeechRequest & {
  onStart: () => void
  onEnd: () => void
  onError: () => void
}

export interface SpeechBackend {
  speak(request: SpeakRequest): void
  cancel(): void
  pause(): void
  resume(): void
  /**
   * Optional. A backend that has to generate audio can start on the coming
   * sentences while the current one plays, so playback does not stall at every
   * full stop. A backend the browser speaks directly ignores this.
   */
  prefetch?(requests: SpeechRequest[]): void
}

export type EngineState = 'ready' | 'speaking' | 'paused'

type Events = {
  sentence: number
  state: EngineState
  done: void
  error: void
}

type Listener<K extends keyof Events> = (payload: Events[K]) => void

export type EngineOptions = {
  backend: SpeechBackend
  /**
   * Safari's resume() is unreliable in the middle of an utterance. Where that
   * is the case, speak the current sentence again instead of resuming it.
   */
  restartSentenceOnResume?: boolean
  /** How many sentences ahead a generating backend is asked to prepare. */
  lookahead?: number
}

const DEFAULT_LOOKAHEAD = 2

export class SpeechEngine {
  private readonly backend: SpeechBackend
  private readonly restartOnResume: boolean
  private readonly lookahead: number

  private sentences: string[] = []
  private position = 0
  private currentState: EngineState = 'ready'

  private voice: AppVoice | null = null
  private rate = 1
  private pitch = 1

  /**
   * Cancelling an utterance makes some browsers fire its end callback anyway.
   * Every request is stamped with the generation it belongs to, and a callback
   * from an older generation is ignored — otherwise a cancel would advance the
   * queue behind our back.
   */
  private generation = 0

  private listeners: {
    [K in keyof Events]: Set<Listener<K>>
  } = { sentence: new Set(), state: new Set(), done: new Set(), error: new Set() }

  constructor(options: EngineOptions) {
    this.backend = options.backend
    this.restartOnResume = options.restartSentenceOnResume ?? false
    this.lookahead = options.lookahead ?? DEFAULT_LOOKAHEAD
  }

  // ---------------------------------------------------------------- events

  on<K extends keyof Events>(event: K, listener: Listener<K>): () => void {
    this.listeners[event].add(listener as never)
    return () => {
      this.listeners[event].delete(listener as never)
    }
  }

  private emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of this.listeners[event]) {
      ;(listener as Listener<K>)(payload)
    }
  }

  private setState(state: EngineState): void {
    if (this.currentState === state) return
    this.currentState = state
    this.emit('state', state)
  }

  // ----------------------------------------------------------------- state

  get state(): EngineState {
    return this.currentState
  }

  get index(): number {
    return this.position
  }

  get length(): number {
    return this.sentences.length
  }

  load(sentences: string[]): void {
    this.abandonCurrent()
    this.sentences = sentences
    this.position = 0
    this.setState('ready')
  }

  // -------------------------------------------------------------- playback

  play(fromIndex = this.position): void {
    if (this.sentences.length === 0) return
    this.position = this.clamp(fromIndex)
    this.speakCurrent()
  }

  pause(): void {
    if (this.currentState !== 'speaking') return
    this.backend.pause()
    this.setState('paused')
  }

  resume(): void {
    if (this.currentState !== 'paused') return
    if (this.restartOnResume) {
      this.speakCurrent()
      return
    }
    this.backend.resume()
    this.setState('speaking')
  }

  toggle(): void {
    if (this.currentState === 'speaking') this.pause()
    else if (this.currentState === 'paused') this.resume()
    else this.play()
  }

  stop(): void {
    this.abandonCurrent()
    this.setState('ready')
  }

  jumpTo(index: number): void {
    const wasSpeaking = this.currentState === 'speaking'
    this.abandonCurrent()
    this.position = this.clamp(index)

    if (wasSpeaking) this.speakCurrent()
    else this.emit('sentence', this.position)
  }

  next(): void {
    if (this.position >= this.sentences.length - 1) {
      this.finish()
      return
    }
    this.jumpTo(this.position + 1)
  }

  previous(): void {
    this.jumpTo(this.position - 1)
  }

  // -------------------------------------------------------------- settings

  setVoice(voice: AppVoice | null): void {
    this.voice = voice
    this.respeakIfSpeaking()
  }

  setRate(rate: number): void {
    this.rate = rate
    this.respeakIfSpeaking()
  }

  setPitch(pitch: number): void {
    this.pitch = pitch
    this.respeakIfSpeaking()
  }

  /**
   * A voice or speed change cannot be applied to a sentence already in flight,
   * so the current one is spoken again under the new setting. Paused playback
   * keeps its position and stays paused.
   */
  private respeakIfSpeaking(): void {
    if (this.currentState === 'speaking') this.speakCurrent()
  }

  // --------------------------------------------------------------- private

  private clamp(index: number): number {
    if (this.sentences.length === 0) return 0
    return Math.max(0, Math.min(index, this.sentences.length - 1))
  }

  /** Drop the sentence in flight and make sure its callbacks are ignored. */
  private abandonCurrent(): void {
    this.generation++
    // Only reach for the backend when it actually has something to drop.
    if (this.currentState !== 'ready') this.backend.cancel()
  }

  private requestFor(index: number): SpeechRequest | null {
    const text = this.sentences[index]
    if (text === undefined) return null
    return { text, voice: this.voice, rate: this.rate, pitch: this.pitch }
  }

  private speakCurrent(): void {
    const request = this.requestFor(this.position)
    if (request === null) return

    this.generation++
    const generation = this.generation
    const fresh = () => generation === this.generation

    this.setState('speaking')
    this.backend.speak({
      ...request,
      onStart: () => {
        if (fresh()) this.emit('sentence', this.position)
      },
      onEnd: () => {
        if (!fresh()) return
        if (this.position >= this.sentences.length - 1) {
          this.finish()
          return
        }
        this.position++
        this.speakCurrent()
      },
      onError: () => {
        if (!fresh()) return
        this.setState('ready')
        this.emit('error', undefined)
      },
    })

    this.prefetchAhead()
  }

  private prefetchAhead(): void {
    if (this.backend.prefetch === undefined || this.lookahead <= 0) return

    const upcoming: SpeechRequest[] = []
    for (let i = 1; i <= this.lookahead; i++) {
      const request = this.requestFor(this.position + i)
      if (request === null) break
      upcoming.push(request)
    }

    if (upcoming.length > 0) this.backend.prefetch(upcoming)
  }

  private finish(): void {
    this.abandonCurrent()
    this.setState('ready')
    this.emit('done', undefined)
  }
}
