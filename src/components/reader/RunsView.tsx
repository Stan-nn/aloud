import { Fragment, type ReactNode } from 'react'
import type { Run } from '../../lib/blocks'

/** The part of a block's runs between two offsets of its display text. */
export function RunsView({ runs, start, end }: { runs: Run[]; start: number; end: number }) {
  const out: ReactNode[] = []
  let position = 0

  runs.forEach((run, i) => {
    const runStart = position
    const runEnd = position + run.text.length
    position = runEnd
    const from = Math.max(start, runStart)
    const to = Math.min(end, runEnd)
    if (from >= to) return

    let node: ReactNode = run.text.slice(from - runStart, to - runStart)
    if (run.code) node = <code className="chip">{node}</code>
    if (run.italic) node = <em>{node}</em>
    if (run.bold) node = <strong>{node}</strong>
    out.push(<Fragment key={i}>{node}</Fragment>)
  })

  return <>{out}</>
}
