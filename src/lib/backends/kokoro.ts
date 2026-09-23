import type { SpeakRequest, SpeechBackend, SpeechRequest } from '../speech'
import { kokoroModelId } from '../voices'

/**
 * Speech from the Kokoro model.
 *
 * Unlike the browser's own voices, nothing here speaks on demand: a sentence
 * has to be generated into audio first, and that takes long enough to be heard
 * as a gap. So the backend generates ahead of playback and keeps a small cache
 * of recent clips, which is what makes continuous reading possible.
 *
 * The model and the audio output are both injected, so the queue, the cache,
 * and the cancellation rules can be tested without downloading 310MB or
 * making a sound.
 */

export type GeneratedAudio = { toBlob(): Blob }

export type KokoroModel = {
  generate(
    text: string,
    options: { voice: string; speed: number },
  ): Promise<GeneratedAudio>
}

export type PlaybackHandlers = {
  onStart(): void
  onEnd(): void
  onError(): void
}

export type AudioPlayer = {
  play(blob: Blob, handlers: PlaybackHandlers): void
  pause(): void
  resume(): void
  stop(): void
}

export type KokoroBackendOptions = {
  loadModel: () => Promise<KokoroModel>
  player: AudioPlayer
  /** How many generated clips to keep. Each is a few seconds of wav. */
  cacheLimit?: number
}

const DEFAULT_CACHE_LIMIT = 12

export class KokoroBackend implements SpeechBackend {
  private readonly loadModel: () => Promise<KokoroModel>
  private readonly player: AudioPlayer
  private readonly cacheLimit: number

  private model: Promise<KokoroModel> | null = null
  /** Promises, not blobs, so a sentence already being generated is not started twice. */
  private clips = new Map<string, Promise<Blob>>()

  /**
   * Generation is slow enough that a sentence can be cancelled while its audio
   * is still being made. Each request is stamped, and a clip that arrives for
   * an older stamp is dropped rather than played over the top of what replaced
   * it.
   */
  private generation = 0

  constructor(options: KokoroBackendOptions) {
    this.loadModel = options.loadModel
    this.player = options.player
    this.cacheLimit = options.cacheLimit ?? DEFAULT_CACHE_LIMIT
  }

  speak(request: SpeakRequest): void {
    this.generation++
    const generation = this.generation

    void this.clipFor(request)
      .then((blob) => {
        if (generation !== this.generation) return
        this.player.play(blob, {
          onStart: () => {
            if (generation === this.generation) request.onStart()
          },
          onEnd: () => {
            if (generation === this.generation) request.onEnd()
          },
          onError: () => {
            if (generation === this.generation) request.onError()
          },
        })
      })
      .catch(() => {
        if (generation === this.generation) request.onError()
      })
  }

  prefetch(requests: SpeechRequest[]): void {
    for (const request of requests) {
      // A failure here is not the reader's problem yet; it will surface if and
      // when the sentence is actually reached.
      void this.clipFor(request).catch(() => {})
    }
  }

  cancel(): void {
    this.generation++
    this.player.stop()
  }

  pause(): void {
    this.player.pause()
  }

  resume(): void {
    this.player.resume()
  }

  // --------------------------------------------------------------- private

  private keyFor(request: SpeechRequest): string {
    return `${request.voice?.id ?? ''}|${request.rate}|${request.text}`
  }

  private clipFor(request: SpeechRequest): Promise<Blob> {
    const key = this.keyFor(request)
    const existing = this.clips.get(key)
    if (existing) return existing

    const clip = this.generate(request)
    this.remember(key, clip)
    return clip
  }

  private async generate(request: SpeechRequest): Promise<Blob> {
    const voice = request.voice ? kokoroModelId(request.voice.id) : null
    if (voice === null) {
      throw new Error(`${request.voice?.name ?? 'This voice'} is not a Kokoro voice.`)
    }

    this.model ??= this.loadModel()
    let model: KokoroModel
    try {
      model = await this.model
    } catch (error) {
      // Let the next attempt try again rather than caching the failure.
      this.model = null
      throw error
    }

    const audio = await model.generate(request.text, {
      voice,
      speed: request.rate,
    })
    return audio.toBlob()
  }

  private remember(key: string, clip: Promise<Blob>): void {
    this.clips.set(key, clip)
    // A rejected clip must not be held, or the sentence can never be retried.
    void clip.catch(() => this.clips.delete(key))

    while (this.clips.size > this.cacheLimit) {
      const oldest = this.clips.keys().next().value
      if (oldest === undefined) break
      this.clips.delete(oldest)
    }
  }
}
