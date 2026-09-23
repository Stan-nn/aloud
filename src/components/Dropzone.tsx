import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { SUPPORTED_EXTENSIONS } from '../lib/parse'
import { AlertIcon, CloseIcon, LockIcon, UploadIcon } from './Icons'

function Notice() {
  const message = useStore((s) => s.message)
  const dismiss = useStore((s) => s.dismissMessage)
  if (!message) return null

  return (
    <div className="notice" role="status">
      <AlertIcon />
      <span>{message.text}</span>
      <button onClick={dismiss} aria-label="Dismiss">
        <CloseIcon style={{ width: 13, height: 13 }} />
      </button>
    </div>
  )
}

export function Dropzone() {
  const addFile = useStore((s) => s.addFile)
  const addPastedText = useStore((s) => s.addPastedText)
  const busy = useStore((s) => s.busy)

  const [over, setOver] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  if (busy) {
    return (
      <div className="empty">
        <div className="busy">
          <div className="spinner" />
          <span>{busy}…</span>
        </div>
      </div>
    )
  }

  if (pasting) {
    return (
      <div className="empty">
        <div className="dz">
          <h2>Paste your text</h2>
          <p>Anything you paste here will be read aloud.</p>
          <textarea
            className="paste-area"
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste here…"
            aria-label="Text to read aloud"
          />
          <div>
            <button
              className="dz-btn"
              disabled={!text.trim()}
              onClick={() => void addPastedText(text)}
            >
              Read this
            </button>
          </div>
          <p className="dz-or">
            <button onClick={() => setPasting(false)}>or open a file instead</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="empty">
      <div>
        <Notice />
        <div
          className="dz"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void addFile(file)
          }}
        >
          <div className="dz-ico">
            <UploadIcon />
          </div>
          <h2>Drop a document here</h2>
          <p>It will be read aloud in a voice already installed on this machine.</p>

          <input
            ref={input}
            type="file"
            className="visually-hidden"
            accept={SUPPORTED_EXTENSIONS.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void addFile(file)
              e.target.value = ''
            }}
          />
          <button className="dz-btn" onClick={() => input.current?.click()}>
            Choose a file
          </button>

          <p className="dz-or">
            or <button onClick={() => setPasting(true)}>paste text instead</button>
          </p>

          <div className="fmts">
            {SUPPORTED_EXTENSIONS.map((ext) => (
              <span className="fmt" key={ext}>
                {ext.slice(1).toUpperCase()}
              </span>
            ))}
          </div>

          <div className="privacy">
            <LockIcon />
            Your file never leaves this machine
          </div>
        </div>
      </div>
    </div>
  )
}
