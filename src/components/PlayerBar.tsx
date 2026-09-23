import { useMemo } from 'react'
import { useStore } from '../state/store'
import { formatClock, speakingSeconds } from '../lib/estimate'
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from './Icons'

const BARS = 68

/**
 * The scrubber is drawn as a waveform because this is a player, not a form
 * field — and it doubles as the seek control. Heights come from a fixed
 * function rather than random numbers so the shape does not jitter on every
 * render.
 */
const HEIGHTS = Array.from({ length: BARS }, (_, i) => {
  const noise = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
  const envelope = 0.45 + 0.55 * Math.abs(Math.sin(i / 9.5))
  return Math.round((4 + noise * 18) * envelope)
})

export function PlayerBar() {
  const sentences = useStore((s) => s.sentences)
  const index = useStore((s) => s.index)
  const playback = useStore((s) => s.playback)
  const settings = useStore((s) => s.settings)
  const voices = useStore((s) => s.voices)
  const doc = useStore((s) => s.doc)

  const toggle = useStore((s) => s.toggle)
  const next = useStore((s) => s.next)
  const previous = useStore((s) => s.previous)
  const jumpTo = useStore((s) => s.jumpTo)
  const togglePanel = useStore((s) => s.togglePanel)

  const voice = voices.find((v) => v.id === settings.voiceId) ?? null
  const voiceName = voice?.name ?? 'No voice'

  // Time is estimated from words, which tracks a document's real length far
  // better than counting sentences.
  const { elapsed, total } = useMemo(() => {
    const words = sentences.map((s) => s.text.trim().split(/\s+/).length)
    const spoken = words.slice(0, index).reduce((a, b) => a + b, 0)
    const all = words.reduce((a, b) => a + b, 0)
    return {
      elapsed: speakingSeconds(spoken, settings.rate),
      total: speakingSeconds(all, settings.rate),
    }
  }, [sentences, index, settings.rate])

  const head = sentences.length
    ? Math.round((index / sentences.length) * BARS)
    : 0

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    if (sentences.length === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientX - box.left) / box.width
    jumpTo(Math.floor(fraction * sentences.length))
  }

  const speaking = playback === 'speaking'

  return (
    <div className="player">
      <div className="transport">
        <button
          className="tbtn"
          onClick={previous}
          disabled={!doc || index === 0}
          aria-label="Previous sentence"
        >
          <PrevIcon />
        </button>
        <button
          className="playbtn"
          onClick={toggle}
          disabled={!doc}
          aria-label={speaking ? 'Pause' : 'Play'}
        >
          {speaking ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="tbtn"
          onClick={next}
          disabled={!doc || index >= sentences.length - 1}
          aria-label="Next sentence"
        >
          <NextIcon />
        </button>
      </div>

      <div className="progress">
        <div
          className="wave"
          onClick={seek}
          role="slider"
          tabIndex={-1}
          aria-label="Position in document"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, sentences.length - 1)}
          aria-valuenow={index}
        >
          {HEIGHTS.map((height, i) => (
            <b
              key={i}
              className={i < head ? 'done' : i === head ? 'head' : ''}
              style={{ height }}
            />
          ))}
        </div>
        <div className="p-meta">
          <span>{formatClock(elapsed)}</span>
          <span className="grow">
            {sentences.length > 0
              ? `Sentence ${index + 1} of ${sentences.length}`
              : 'Nothing loaded'}
          </span>
          <span>{formatClock(total)}</span>
        </div>
      </div>

      <button className="voicebtn" onClick={togglePanel}>
        <span className="vn">{voiceName}</span>
        {voice?.engine === 'kokoro' && <span className="vtag">Kokoro</span>}
        <i className="dot" />
        <span className="vr">{settings.rate.toFixed(1)}×</span>
      </button>
    </div>
  )
}
