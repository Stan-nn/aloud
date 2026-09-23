import { useRef } from 'react'
import { useStore } from '../state/store'
import { SUPPORTED_EXTENSIONS } from '../lib/parse'
import { formatRemaining, speakingSeconds } from '../lib/estimate'
import { CloseIcon, PlusIcon, ProgressRing } from './Icons'

export function LibrarySidebar() {
  const docs = useStore((s) => s.docs)
  const progressByDoc = useStore((s) => s.progressByDoc)
  const current = useStore((s) => s.doc)
  const sentences = useStore((s) => s.sentences)
  const rate = useStore((s) => s.settings.rate)
  const openDoc = useStore((s) => s.openDoc)
  const removeDoc = useStore((s) => s.removeDoc)
  const addFile = useStore((s) => s.addFile)

  const input = useRef<HTMLInputElement>(null)

  return (
    <aside className="rail" aria-label="Library">
      <div className="rail-lab">
        Library · {docs.length} {docs.length === 1 ? 'document' : 'documents'}
      </div>

      {docs.map((doc) => {
        const isCurrent = current?.id === doc.id
        // The sentence count is only known for the open document; for the
        // rest, estimate from words so the ring still means something.
        const total = isCurrent
          ? sentences.length
          : Math.max(1, Math.round(doc.wordCount / 18))
        const position = progressByDoc[doc.id] ?? 0
        const fraction = Math.min(1, position / total)
        const remainingWords = Math.round(doc.wordCount * (1 - fraction))

        return (
          <div className={isCurrent ? 'item sel' : 'item'} key={doc.id}>
            <ProgressRing fraction={fraction} />
            <button
              className="item-txt"
              onClick={() => void openDoc(doc.id)}
              style={{ background: 'none', textAlign: 'left' }}
            >
              <div className="item-name">{doc.title}</div>
              <div className="item-sub">
                {fraction >= 1
                  ? 'FINISHED'
                  : fraction === 0
                    ? `NOT STARTED · ${formatRemaining(speakingSeconds(doc.wordCount, rate)).replace(' left', '')}`
                    : `${Math.round(fraction * 100)}% · ${formatRemaining(
                        speakingSeconds(remainingWords, rate),
                      )}`}
              </div>
            </button>
            <button
              className="item-remove"
              onClick={() => void removeDoc(doc.id)}
              aria-label={`Remove ${doc.title}`}
            >
              <CloseIcon />
            </button>
          </div>
        )
      })}

      <div className="rail-foot">
        <input
          ref={input}
          type="file"
          className="visually-hidden"
          accept={SUPPORTED_EXTENSIONS.join(',')}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void addFile(file)
            e.target.value = ''
          }}
        />
        <button className="addbtn" onClick={() => input.current?.click()}>
          <PlusIcon />
          Add a document
        </button>
      </div>
    </aside>
  )
}
