import { useStore } from '../state/store'

const KEYS: [string, string][] = [
  ['Space', 'Play or pause'],
  ['← →', 'Previous or next sentence'],
  ['↑ ↓', 'Speed up or slow down'],
  ['L', 'Show or hide the library'],
  ['V', 'Show or hide voice settings'],
  ['T', 'Switch between light and dark'],
  ['?', 'Show this list'],
]

export function Shortcuts() {
  const open = useStore((s) => s.shortcutsOpen)
  const toggle = useStore((s) => s.toggleShortcuts)
  if (!open) return null

  return (
    <div
      className="shortcuts"
      onClick={toggle}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className="shortcuts-card" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        {KEYS.map(([key, what]) => (
          <div className="kb-row" key={key}>
            <span className="key">{key}</span>
            <span>{what}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
