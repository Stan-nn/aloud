import { describe, expect, test } from 'vitest'
import { formatClock, formatRemaining, speakingSeconds } from './estimate'

describe('speakingSeconds', () => {
  test('reads a minute of words in a minute', () => {
    expect(speakingSeconds(160, 1)).toBe(60)
  })

  test('takes half the time at double speed', () => {
    expect(speakingSeconds(160, 2)).toBe(30)
  })

  test('takes longer at half speed', () => {
    expect(speakingSeconds(160, 0.5)).toBe(120)
  })

  test('takes no time at all over nothing', () => {
    expect(speakingSeconds(0, 1)).toBe(0)
  })
})

describe('formatClock', () => {
  test('shows minutes and seconds', () => {
    expect(formatClock(252)).toBe('4:12')
  })

  test('pads the seconds', () => {
    expect(formatClock(9)).toBe('0:09')
  })

  test('adds an hours field past an hour', () => {
    expect(formatClock(3672)).toBe('1:01:12')
  })

  test('shows zero as a clock, not an empty string', () => {
    expect(formatClock(0)).toBe('0:00')
  })

  test('never shows a negative time', () => {
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('formatRemaining', () => {
  test('counts whole minutes', () => {
    expect(formatRemaining(840)).toBe('14 min left')
  })

  test('says minute in the singular', () => {
    expect(formatRemaining(60)).toBe('1 min left')
  })

  test('does not round a short remainder down to nothing', () => {
    expect(formatRemaining(20)).toBe('under a minute left')
  })

  test('says so when there is nothing left', () => {
    expect(formatRemaining(0)).toBe('finished')
  })
})
