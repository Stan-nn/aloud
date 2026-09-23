import { useStore } from '../state/store'
import type { AppVoice } from '../lib/voices'
import { CloseIcon, DownloadIcon, PlayIcon, TickIcon } from './Icons'

function VoiceRow({ voice }: { voice: AppVoice }) {
  const selected = useStore((s) => s.settings.voiceId === voice.id)
  const setVoice = useStore((s) => s.setVoice)

  return (
    <button
      className={selected ? 'vrow sel' : 'vrow'}
      onClick={() => setVoice(voice.id)}
      aria-pressed={selected}
    >
      <span className="vname">{voice.name}</span>
      {voice.grade && <span className="grade">{voice.grade}</span>}
      <span className="vloc">{voice.lang.toUpperCase()}</span>
      {selected && <TickIcon className="vtick" />}
    </button>
  )
}

function DownloadState() {
  const modelState = useStore((s) => s.modelState)
  const progress = useStore((s) => s.modelProgress)

  if (modelState === 'absent') return null

  if (modelState === 'downloading') {
    const pct = Math.round((progress?.fraction ?? 0) * 100)
    return (
      <div className="download" role="status">
        <div className="download-top">
          <span>Downloading voice model</span>
          <span className="download-pct">{pct}%</span>
        </div>
        <div className="track">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="download-note">
          {progress
            ? `${progress.megabytesDone} of ${progress.megabytesTotal} MB. `
            : 'Starting. '}
          This happens once; afterwards the voice works offline.
        </p>
      </div>
    )
  }

  return (
    <div className="download download--done" role="status">
      <TickIcon className="vtick" />
      <span>Voice model ready. It now runs entirely on this machine.</span>
    </div>
  )
}

export function VoicePanel() {
  const voices = useStore((s) => s.voices)
  const settings = useStore((s) => s.settings)
  const modelBuild = useStore((s) => s.modelBuild)
  const modelState = useStore((s) => s.modelState)
  const setRate = useStore((s) => s.setRate)
  const previewVoice = useStore((s) => s.previewVoice)
  const togglePanel = useStore((s) => s.togglePanel)


  return (
    <aside className="panel" aria-label="Voice and speed">
      <div className="p-head">
        <h2>Voice &amp; speed</h2>
        <button className="ibtn" onClick={togglePanel} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <DownloadState />

      <div>
        <div className="p-lab p-lab--with-note">
          <span>Kokoro</span>
          {modelState !== 'ready' && (
            <span className="p-note">
              <DownloadIcon /> {modelBuild.megabytes} MB, once
            </span>
          )}
        </div>
        <p className="group-note">
          Generated on this machine. The model downloads the first time you
          press play; nothing you read is ever sent anywhere.
        </p>
        <div className="vlist">
          {voices.map((voice) => (
            <VoiceRow key={voice.id} voice={voice} />
          ))}
        </div>
      </div>

      <div className="slider">
        <div className="s-top">
          <b>Speed</b>
          <i>{settings.rate.toFixed(1)}×</i>
        </div>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={settings.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="Speaking speed"
        />
        <div className="ticks">
          <span>0.5×</span>
          <span>1×</span>
          <span>1.5×</span>
          <span>2×</span>
        </div>
      </div>

      <div className="preview">
        <div className="pv-lab">Preview</div>
        <div className="pv-txt">
          “The quick brown fox jumps over the lazy dog.”
        </div>
        <button className="pv-go" onClick={previewVoice}>
          <PlayIcon />
          Hear it
        </button>
      </div>
    </aside>
  )
}
