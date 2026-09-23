import { normalizeRuns, type Run } from '../blocks'

/**
 * Markdown's inline syntax, turned into styled runs rather than stripped.
 * At each position the earliest match of any pattern wins; bold, italic and
 * link text are tokenized again inside, and code is taken literally.
 */

type Style = Omit<Run, 'text'>
type Kind = 'code' | 'image' | 'link' | 'bold' | 'italic'

const PATTERNS: { re: RegExp; kind: Kind }[] = [
  { re: /`([^`\n]+)`/g, kind: 'code' },
  { re: /!\[[^\]]*\]\([^)]*\)/g, kind: 'image' },
  { re: /\[([^\]]*)\]\([^)]*\)/g, kind: 'link' },
  { re: /\*\*(?=\S)([\s\S]*?\S)\*\*/g, kind: 'bold' },
  { re: /(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, kind: 'italic' },
  { re: /(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, kind: 'italic' },
]

const HTML_TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?\/?>/g

function tokenize(text: string, style: Style): Run[] {
  const runs: Run[] = []
  let position = 0

  while (position < text.length) {
    let best: { index: number; length: number; inner: string; kind: Kind } | null =
      null
    for (const { re, kind } of PATTERNS) {
      re.lastIndex = position
      const match = re.exec(text)
      if (match && (best === null || match.index < best.index)) {
        best = {
          index: match.index,
          length: match[0].length,
          inner: match[1] ?? '',
          kind,
        }
      }
    }
    if (best === null) break

    if (best.index > position) {
      runs.push({ ...style, text: text.slice(position, best.index) })
    }
    if (best.kind === 'code') runs.push({ ...style, code: true, text: best.inner })
    else if (best.kind === 'bold') runs.push(...tokenize(best.inner, { ...style, bold: true }))
    else if (best.kind === 'italic') runs.push(...tokenize(best.inner, { ...style, italic: true }))
    else if (best.kind === 'link') runs.push(...tokenize(best.inner, style))
    position = best.index + best.length
  }

  if (position < text.length) runs.push({ ...style, text: text.slice(position) })
  return runs
}

export function inlineRuns(text: string): Run[] {
  return normalizeRuns(tokenize(text.replace(HTML_TAG, ' '), {}))
}
