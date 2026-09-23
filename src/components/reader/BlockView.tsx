import type { ReactNode, RefObject } from 'react'
import { displayText, type Block, type LeafBlock, type Run } from '../../lib/blocks'
import type { Sentence } from '../../lib/segment'
import { RunsView } from './RunsView'
import { Figure } from './Figure'

export type ReaderContext = {
  byBlock: Map<string, Sentence[]>
  index: number
  activePath: string | null
  speaking: boolean
  activeRef: RefObject<HTMLSpanElement>
  jumpTo: (index: number) => void
}

export function sentencesByBlock(sentences: Sentence[]): Map<string, Sentence[]> {
  const map = new Map<string, Sentence[]>()
  for (const sentence of sentences) {
    const key = sentence.blockPath.join('.')
    const list = map.get(key)
    if (list) list.push(sentence)
    else map.set(key, [sentence])
  }
  return map
}

function SentenceSpan({
  sentence,
  ctx,
  children,
}: {
  sentence: Sentence
  ctx: ReaderContext
  children: ReactNode
}) {
  const active = sentence.id === ctx.index
  const state = active ? ' active' : sentence.id < ctx.index ? ' spoken' : ''
  return (
    <span
      className={`sent${state}`}
      ref={active ? ctx.activeRef : undefined}
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      onClick={() => ctx.jumpTo(sentence.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ctx.jumpTo(sentence.id)
      }}
    >
      {children}
    </span>
  )
}

/** A block's text with each of its sentences made clickable. */
function TextContent({
  runs,
  sentences,
  ctx,
}: {
  runs: Run[]
  sentences: Sentence[]
  ctx: ReaderContext
}) {
  const length = displayText(runs).length
  const nodes: ReactNode[] = []
  let position = 0
  for (const sentence of sentences) {
    if (sentence.start > position) {
      nodes.push(
        <RunsView key={`gap-${position}`} runs={runs} start={position} end={sentence.start} />,
      )
    }
    nodes.push(
      <SentenceSpan key={sentence.id} sentence={sentence} ctx={ctx}>
        <RunsView runs={runs} start={sentence.start} end={sentence.end} />
      </SentenceSpan>,
    )
    position = sentence.end
  }
  if (position < length) {
    nodes.push(<RunsView key={`gap-${position}`} runs={runs} start={position} end={length} />)
  }
  return <>{nodes}</>
}

// The document title is the page's h1, so the document's own levels sit one below it.
const HEADING_TAG = { 1: 'h2', 2: 'h3', 3: 'h4' } as const

function LeafView({ block, path, ctx }: { block: LeafBlock; path: number[]; ctx: ReaderContext }) {
  const key = path.join('.')
  const sentences = ctx.byBlock.get(key) ?? []
  const className = (base: string) =>
    ctx.activePath === key ? `${base} blk blk--current` : `${base} blk`
  const shared = { 'data-speaking': ctx.speaking }

  switch (block.kind) {
    case 'heading': {
      const Tag = HEADING_TAG[block.level]
      return (
        <Tag className={className(`doc-h${block.level + 1}`)} {...shared}>
          <TextContent runs={block.runs} sentences={sentences} ctx={ctx} />
        </Tag>
      )
    }
    case 'list-item':
      return (
        <li className={className('list-item')} {...shared}>
          <TextContent runs={block.runs} sentences={sentences} ctx={ctx} />
        </li>
      )
    case 'code': {
      const body = <code>{block.text}</code>
      const sentence = sentences[0]
      return (
        <pre className={className('code')} {...shared}>
          {sentence ? (
            <SentenceSpan sentence={sentence} ctx={ctx}>
              {body}
            </SentenceSpan>
          ) : (
            body
          )}
        </pre>
      )
    }
    case 'figure':
      return <Figure block={block} />
    default: {
      const base = block.kind === 'paragraph' ? 'para' : block.kind
      return (
        <p className={className(base)} {...shared}>
          <TextContent runs={block.runs} sentences={sentences} ctx={ctx} />
        </p>
      )
    }
  }
}

/** Blocks in order, with neighbouring list items gathered into one list. */
export function BlockList({
  blocks,
  prefix,
  ctx,
}: {
  blocks: Block[]
  prefix: number[]
  ctx: ReaderContext
}) {
  const out: ReactNode[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!

    if (block.kind === 'list-item') {
      const first = i
      const items: ReactNode[] = []
      while (i < blocks.length && blocks[i]!.kind === 'list-item') {
        items.push(
          <LeafView key={i} block={blocks[i] as LeafBlock} path={[...prefix, i]} ctx={ctx} />,
        )
        i++
      }
      out.push(
        block.ordered !== undefined ? (
          <ol key={`list-${first}`} className="list" start={block.ordered}>
            {items}
          </ol>
        ) : (
          <ul key={`list-${first}`} className="list">
            {items}
          </ul>
        ),
      )
      continue
    }

    if (block.kind === 'callout') {
      out.push(
        <aside key={i} className="callout">
          {block.icon && (
            <span className="callout-icon" aria-hidden="true">
              {block.icon}
            </span>
          )}
          <div className="callout-body">
            <BlockList blocks={block.children} prefix={[...prefix, i]} ctx={ctx} />
          </div>
        </aside>,
      )
    } else {
      out.push(<LeafView key={i} block={block} path={[...prefix, i]} ctx={ctx} />)
    }
    i++
  }
  return <>{out}</>
}
