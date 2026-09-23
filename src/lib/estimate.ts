/**
 * How long a document will take to hear. Synthesised speech at rate 1 runs at
 * roughly this pace; it is an estimate, and it is honest about being one — the
 * point is to tell you whether a document is a five-minute or a fifty-minute
 * listen before you commit to it.
 */
const WORDS_PER_MINUTE = 160

export function speakingSeconds(wordCount: number, rate: number): number {
  if (wordCount <= 0 || rate <= 0) return 0
  return (wordCount / (WORDS_PER_MINUTE * rate)) * 60
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`
}

export function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total === 0) return 'finished'

  const minutes = Math.round(total / 60)
  if (minutes < 1) return 'under a minute left'
  return `${minutes} min left`
}
