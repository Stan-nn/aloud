import { describe, expect, test } from 'vitest'
import { kokoroModelId, kokoroVoices, pickDefaultVoice } from './voices'

describe('kokoroVoices', () => {
  test('offers the full catalogue', () => {
    expect(kokoroVoices()).toHaveLength(28)
  })

  test('namespaces every id', () => {
    expect(kokoroVoices().every((v) => v.id.startsWith('kokoro:'))).toBe(true)
  })

  test('leads with the best-graded voice', () => {
    const [best] = kokoroVoices()
    expect(best).toMatchObject({ id: 'kokoro:af_heart', name: 'Heart', grade: 'A' })
  })

  test('orders by quality so the worst voices are not offered first', () => {
    const grades = kokoroVoices().map((v) => v.grade)
    expect(grades[0]).toBe('A')
    expect(grades.at(-1)).toBe('F+')
  })

  test('maps the American voices to American English', () => {
    const voice = kokoroVoices().find((v) => v.id === 'kokoro:am_michael')
    expect(voice?.lang).toBe('en-US')
  })

  test('maps the British voices to British English', () => {
    const voice = kokoroVoices().find((v) => v.id === 'kokoro:bm_george')
    expect(voice?.lang).toBe('en-GB')
  })

  test('says every Kokoro voice runs on the machine', () => {
    expect(kokoroVoices().every((v) => v.onDevice)).toBe(true)
  })
})

describe('kokoroModelId', () => {
  test('recovers the model voice name from an app voice id', () => {
    expect(kokoroModelId('kokoro:af_heart')).toBe('af_heart')
  })

  test('returns nothing for a voice from another engine', () => {
    expect(kokoroModelId('system:Samantha')).toBeNull()
  })

  test('returns nothing for an unknown Kokoro voice', () => {
    expect(kokoroModelId('kokoro:not_a_voice')).toBeNull()
  })
})

describe('pickDefaultVoice', () => {
  const voices = kokoroVoices()

  test('honours a voice the reader chose before', () => {
    expect(pickDefaultVoice(voices, 'kokoro:bm_george')?.name).toBe('George')
  })

  test('starts on the best-graded voice', () => {
    expect(pickDefaultVoice(voices, undefined)?.id).toBe('kokoro:af_heart')
  })

  test('moves a reader who had chosen an installed system voice onto Kokoro', () => {
    expect(pickDefaultVoice(voices, 'system:Samantha')?.id).toBe('kokoro:af_heart')
  })

  test('returns nothing when there are no voices', () => {
    expect(pickDefaultVoice([], undefined)).toBeNull()
  })
})
