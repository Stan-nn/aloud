import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../state/store'
import { BlockList, sentencesByBlock, type ReaderContext } from './reader/BlockView'

/** Scrolling must not depend on an API the host may not provide. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const SOURCE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  docx: 'WORD',
  md: 'MARKDOWN',
  txt: 'TEXT',
  paste: 'PASTED',
}

export function ReaderPane() {
  const doc = useStore((s) => s.doc)
  const blocks = useStore((s) => s.blocks)
  const sentences = useStore((s) => s.sentences)
  const index = useStore((s) => s.index)
  const playback = useStore((s) => s.playback)
  const jumpTo = useStore((s) => s.jumpTo)

  const byBlock = useMemo(() => sentencesByBlock(sentences), [sentences])
  const active = useRef<HTMLSpanElement>(null)
  const pane = useRef<HTMLDivElement>(null)

  // Keep the sentence being spoken about a third of the way down, so there is
  // always context above it and a run of what is coming below. Measured from
  // bounding boxes, since a sentence inside a callout or list sits in a
  // positioned ancestor and its offsetTop is not relative to the pane.
  useEffect(() => {
    const element = active.current
    const container = pane.current
    if (!element || !container || typeof container.scrollTo !== 'function') {
      return
    }

    const box = element.getBoundingClientRect()
    const frame = container.getBoundingClientRect()
    const target =
      container.scrollTop +
      (box.top - frame.top) -
      container.clientHeight / 3 +
      box.height / 2
    container.scrollTo({
      top: target,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [index])

  if (!doc) return null

  const label = SOURCE_LABEL[doc.source] ?? doc.source.toUpperCase()
  const ctx: ReaderContext = {
    byBlock,
    index,
    activePath: sentences[index]?.blockPath.join('.') ?? null,
    speaking: playback === 'speaking',
    activeRef: active,
    jumpTo,
  }

  return (
    <div className="reader" ref={pane}>
      {/* Keyed by document so nothing — figures, scroll — carries over from the last one. */}
      <div className="col" key={doc.id}>
        <h1 className="doc-h">{doc.title}</h1>
        <p className="doc-sub">
          {label} · {doc.wordCount.toLocaleString()} WORDS ·{' '}
          {sentences.length.toLocaleString()} SENTENCES
        </p>
        <BlockList blocks={blocks} prefix={[]} ctx={ctx} />
      </div>
    </div>
  )
}
