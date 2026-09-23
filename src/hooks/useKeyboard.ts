import { useEffect } from 'react'
import { useStore } from '../state/store'

/** True when the reader is typing, so a shortcut must not steal the key. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

const MIN_RATE = 0.5
const MAX_RATE = 2
const RATE_STEP = 0.1

export function useKeyboard(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey) return

      const state = useStore.getState()
      const clampRate = (rate: number) =>
        Math.round(Math.min(MAX_RATE, Math.max(MIN_RATE, rate)) * 10) / 10

      switch (event.key) {
        case ' ':
          event.preventDefault()
          state.toggle()
          break
        case 'ArrowLeft':
          event.preventDefault()
          state.previous()
          break
        case 'ArrowRight':
          event.preventDefault()
          state.next()
          break
        case 'ArrowUp':
          event.preventDefault()
          state.setRate(clampRate(state.settings.rate + RATE_STEP))
          break
        case 'ArrowDown':
          event.preventDefault()
          state.setRate(clampRate(state.settings.rate - RATE_STEP))
          break
        case 'l':
        case 'L':
          state.toggleLibrary()
          break
        case 'v':
        case 'V':
          state.togglePanel()
          break
        case 't':
        case 'T': {
          const next = state.settings.theme === 'dark' ? 'light' : 'dark'
          state.setTheme(next)
          break
        }
        case '?':
          state.toggleShortcuts()
          break
        case 'Escape':
          if (state.shortcutsOpen) state.toggleShortcuts()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
