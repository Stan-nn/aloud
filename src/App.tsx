import { useEffect } from 'react'
import { useStore } from './state/store'
import { useKeyboard } from './hooks/useKeyboard'
import { LibrarySidebar } from './components/LibrarySidebar'
import { Dropzone } from './components/Dropzone'
import { ReaderPane } from './components/ReaderPane'
import { PlayerBar } from './components/PlayerBar'
import { VoicePanel } from './components/VoicePanel'
import { Shortcuts } from './components/Shortcuts'
import {
  AlertIcon,
  CloseIcon,
  MenuIcon,
  MoonIcon,
  SpeakerIcon,
  SunIcon,
} from './components/Icons'

function ReadingNotice() {
  const message = useStore((s) => s.message)
  const dismiss = useStore((s) => s.dismissMessage)
  const doc = useStore((s) => s.doc)
  if (!message || !doc) return null

  return (
    <div style={{ padding: '16px 32px 0' }}>
      <div className="notice" role="status">
        <AlertIcon />
        <span>{message.text}</span>
        <button onClick={dismiss} aria-label="Dismiss">
          <CloseIcon style={{ width: 13, height: 13 }} />
        </button>
      </div>
    </div>
  )
}

export default function App() {
  const init = useStore((s) => s.init)
  const doc = useStore((s) => s.doc)
  const busy = useStore((s) => s.busy)
  const theme = useStore((s) => s.settings.theme)
  const libraryOpen = useStore((s) => s.libraryOpen)
  const panelOpen = useStore((s) => s.panelOpen)
  const toggleLibrary = useStore((s) => s.toggleLibrary)
  const togglePanel = useStore((s) => s.togglePanel)
  const setTheme = useStore((s) => s.setTheme)

  useKeyboard()

  useEffect(() => {
    void init()
  }, [init])

  const showReader = doc !== null && !busy
  const dark = theme === 'dark'

  return (
    <div className={showReader ? 'app' : 'app app--noplayer'}>
      <header className="topbar">
        <button
          className={libraryOpen ? 'ibtn on' : 'ibtn'}
          onClick={toggleLibrary}
          aria-label="Library"
          aria-pressed={libraryOpen}
        >
          <MenuIcon />
        </button>

        <div className="tb-title">{doc ? doc.title : 'Aloud'}</div>
        {doc && (
          <>
            <i className="dot" />
            <div className="tb-meta">
              {doc.source.toUpperCase()} · {doc.wordCount.toLocaleString()} words
            </div>
          </>
        )}

        <div className="tb-right">
          {doc && (
            <button
              className={panelOpen ? 'ibtn on' : 'ibtn'}
              onClick={togglePanel}
              aria-label="Voice and speed"
              aria-pressed={panelOpen}
            >
              <SpeakerIcon />
            </button>
          )}
          <button
            className="ibtn"
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Switch to light' : 'Switch to dark'}
          >
            {dark ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      <div
        className="mid"
        data-rail={libraryOpen}
        data-panel={panelOpen && showReader}
      >
        {libraryOpen && <LibrarySidebar />}
        {showReader ? (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <ReadingNotice />
            <ReaderPane />
          </div>
        ) : (
          <Dropzone />
        )}
        {panelOpen && showReader && <VoicePanel />}
      </div>

      {showReader && <PlayerBar />}
      <Shortcuts />
    </div>
  )
}
