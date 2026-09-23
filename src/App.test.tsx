import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App from './App'
import { useStore } from './state/store'

/** A mounting check, and the voice panel as the reader sees it. */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.documentElement.removeAttribute('data-theme')
})

async function mount() {
  await act(async () => {
    root.render(<App />)
  })
}

describe('the app on first run', () => {
  test('mounts without crashing', async () => {
    await mount()
    expect(container.querySelector('.app')).not.toBeNull()
  })

  test('opens on the dropzone', async () => {
    await mount()
    expect(container.textContent).toContain('Drop a document here')
  })

  test('names the formats it reads', async () => {
    await mount()
    const formats = [...container.querySelectorAll('.fmt')].map(
      (el) => el.textContent,
    )
    expect(formats).toEqual(['PDF', 'DOCX', 'MD', 'TXT'])
  })

  test('promises the file stays on the machine', async () => {
    await mount()
    expect(container.textContent).toContain('never leaves this machine')
  })

  test('hides the player until there is something to play', async () => {
    await mount()
    expect(container.querySelector('.player')).toBeNull()
  })

  test('starts on a Kokoro voice without asking about installed ones', async () => {
    await mount()
    expect(useStore.getState().settings.voiceId).toBe('kokoro:af_heart')
    expect(container.textContent).not.toContain('voices installed')
  })

  test('leaves the theme to the system until asked otherwise', async () => {
    await mount()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('reading a document', () => {
  test('shows the text, the player and the title', async () => {
    await mount()
    await act(async () => {
      await useStore.getState().addPastedText(
        'The bell rang. Everyone stood up.\n\nThen the room was quiet.',
      )
    })

    expect(container.querySelector('.player')).not.toBeNull()
    expect(container.textContent).toContain('Everyone stood up.')
    expect(container.querySelector('.doc-h')?.textContent).toBe('Pasted text')
  })

  test('marks the first sentence as the one to be read', async () => {
    await mount()
    await act(async () => {
      await useStore.getState().addPastedText('The bell rang. Everyone stood up.')
    })

    expect(container.querySelector('.sent.active')?.textContent).toBe(
      'The bell rang.',
    )
  })

  test('counts every sentence in the document', async () => {
    await mount()
    await act(async () => {
      await useStore.getState().addPastedText('One. Two. Three.')
    })

    expect(container.textContent).toContain('Sentence 1 of 3')
  })

  test('switching the theme stamps the document', async () => {
    await mount()
    await act(async () => useStore.getState().setTheme('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})

describe('choosing a voice', () => {
  async function openPanel() {
    await mount()
    await act(async () => {
      await useStore.getState().addPastedText('One. Two.')
    })
    await act(async () => useStore.getState().togglePanel())
  }

  test('offers only the Kokoro voices', async () => {
    await openPanel()
    expect(container.textContent).toContain('Heart')
    expect(container.querySelectorAll('.vrow')).toHaveLength(28)
    expect(container.textContent).not.toMatch(/installed/i)
  })

  test('shows each Kokoro voice with the grade Kokoro gave it', async () => {
    await openPanel()
    const grades = [...container.querySelectorAll('.grade')].map(
      (el) => el.textContent,
    )
    expect(grades[0]).toBe('A')
  })

  test('says what the download will cost before it is chosen', async () => {
    await openPanel()
    expect(container.textContent).toMatch(/\d+ MB, once/)
  })

  test('promises the text is not sent anywhere', async () => {
    await openPanel()
    expect(container.textContent).toContain('is ever sent anywhere')
  })

  test('downloads nothing on startup', async () => {
    await mount()
    expect(useStore.getState().modelState).toBe('absent')
  })

  test('picking a Kokoro voice does not by itself start a download', async () => {
    await openPanel()
    await act(async () => useStore.getState().setVoice('kokoro:af_heart'))
    expect(useStore.getState().modelState).toBe('absent')
  })

  test('remembers that the download was accepted', async () => {
    await openPanel()
    await act(async () => useStore.getState().setVoice('kokoro:af_heart'))
    expect(useStore.getState().settings.kokoroAccepted).toBe(true)
  })

  test('shows download progress once it is under way', async () => {
    await openPanel()
    await act(async () => useStore.getState().setVoice('kokoro:af_heart'))
    await act(async () =>
      useStore.setState({
        modelState: 'downloading',
        modelProgress: { fraction: 0.4, megabytesDone: 124, megabytesTotal: 310 },
      }),
    )
    expect(container.textContent).toContain('40%')
    expect(container.textContent).toContain('124 of 310 MB')
  })

  test('offers no pitch control, which Kokoro does not have', async () => {
    await openPanel()
    expect(container.querySelector('input[aria-label="Voice pitch"]')).toBeNull()
  })

  test('marks the player when a Kokoro voice is in use', async () => {
    await openPanel()
    await act(async () => useStore.getState().setVoice('kokoro:af_heart'))
    expect(container.querySelector('.vtag')?.textContent).toBe('Kokoro')
  })
})
