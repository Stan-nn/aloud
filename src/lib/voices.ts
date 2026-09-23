/**
 * The voices Aloud speaks with: Kokoro's, generated on this machine from an
 * ONNX model that is downloaded once. The voices a browser has installed are
 * not offered — they sound obviously synthetic next to these.
 */

export type VoiceEngine = 'kokoro'

export type AppVoice = {
  /** Namespaced, so an id saved by an older version cannot be mistaken for one. */
  id: string
  engine: VoiceEngine
  name: string
  lang: string
  /** Synthesis happens here; no text is sent anywhere to produce speech. */
  onDevice: boolean
  /** Kokoro grades its own voices. Worth showing: they range from A to F+. */
  grade?: string
}

// ---------------------------------------------------------------- kokoro

type KokoroEntry = { id: string; name: string; british: boolean; grade: string }

/**
 * The catalogue is declared here rather than read from the model, because the
 * reader has to be able to browse and choose a voice before anything is
 * downloaded. Names and grades are Kokoro's own.
 */
const KOKORO: KokoroEntry[] = [
  { id: 'af_heart', name: 'Heart', british: false, grade: 'A' },
  { id: 'af_bella', name: 'Bella', british: false, grade: 'A-' },
  { id: 'af_nicole', name: 'Nicole', british: false, grade: 'B-' },
  { id: 'bf_emma', name: 'Emma', british: true, grade: 'B-' },
  { id: 'af_aoede', name: 'Aoede', british: false, grade: 'C+' },
  { id: 'af_kore', name: 'Kore', british: false, grade: 'C+' },
  { id: 'af_sarah', name: 'Sarah', british: false, grade: 'C+' },
  { id: 'am_fenrir', name: 'Fenrir', british: false, grade: 'C+' },
  { id: 'am_michael', name: 'Michael', british: false, grade: 'C+' },
  { id: 'am_puck', name: 'Puck', british: false, grade: 'C+' },
  { id: 'af_alloy', name: 'Alloy', british: false, grade: 'C' },
  { id: 'af_nova', name: 'Nova', british: false, grade: 'C' },
  { id: 'bf_isabella', name: 'Isabella', british: true, grade: 'C' },
  { id: 'bm_george', name: 'George', british: true, grade: 'C' },
  { id: 'bm_fable', name: 'Fable', british: true, grade: 'C' },
  { id: 'af_sky', name: 'Sky', british: false, grade: 'C-' },
  { id: 'bm_lewis', name: 'Lewis', british: true, grade: 'D+' },
  { id: 'af_jessica', name: 'Jessica', british: false, grade: 'D' },
  { id: 'af_river', name: 'River', british: false, grade: 'D' },
  { id: 'am_echo', name: 'Echo', british: false, grade: 'D' },
  { id: 'am_eric', name: 'Eric', british: false, grade: 'D' },
  { id: 'am_liam', name: 'Liam', british: false, grade: 'D' },
  { id: 'am_onyx', name: 'Onyx', british: false, grade: 'D' },
  { id: 'bf_alice', name: 'Alice', british: true, grade: 'D' },
  { id: 'bf_lily', name: 'Lily', british: true, grade: 'D' },
  { id: 'bm_daniel', name: 'Daniel', british: true, grade: 'D' },
  { id: 'am_santa', name: 'Santa', british: false, grade: 'D-' },
  { id: 'am_adam', name: 'Adam', british: false, grade: 'F+' },
]

const KOKORO_PREFIX = 'kokoro:'

export function kokoroVoices(): AppVoice[] {
  return KOKORO.map((entry) => ({
    id: KOKORO_PREFIX + entry.id,
    engine: 'kokoro' as const,
    name: entry.name,
    lang: entry.british ? 'en-GB' : 'en-US',
    onDevice: true,
    grade: entry.grade,
  }))
}

/** The name the model expects, or null when this is not a Kokoro voice. */
export function kokoroModelId(voiceId: string): string | null {
  if (!voiceId.startsWith(KOKORO_PREFIX)) return null
  const name = voiceId.slice(KOKORO_PREFIX.length)
  return KOKORO.some((entry) => entry.id === name) ? name : null
}

// ---------------------------------------------------------------- choosing

/**
 * The voice the reader picked before if it is still offered, otherwise the
 * best-graded one. A voice remembered from the installed voices older
 * versions offered is no longer there, so that reader starts on Kokoro.
 */
export function pickDefaultVoice(
  voices: AppVoice[],
  preferredId: string | undefined | null,
): AppVoice | null {
  return voices.find((voice) => voice.id === preferredId) ?? voices[0] ?? null
}
