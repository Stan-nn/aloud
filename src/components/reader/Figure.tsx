import { useEffect, useState } from 'react'
import type { FigureBlock } from '../../lib/blocks'
import { getImage } from '../../lib/db'

/** An object URL for a stored figure, released when the figure leaves the page. */
function useImageUrl(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    // A figure reused for another image must not keep showing the old one.
    setUrl(null)
    if (typeof URL.createObjectURL !== 'function') return
    let live = true
    let made: string | null = null
    getImage(id)
      .then((image) => {
        if (!live || !image) return
        made = URL.createObjectURL(new Blob([image.bytes], { type: image.type }))
        setUrl(made)
      })
      .catch(() => {
        // An unreadable image is shown as no image; the caption still reads.
      })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])

  return url
}

/** A figure is shown, never spoken; its caption carries what it says. */
export function Figure({ block }: { block: FigureBlock }) {
  const url = useImageUrl(block.imageId)
  if (!url) return null
  return (
    <figure className="fig">
      <img src={url} alt="" loading="lazy" width={block.width} height={block.height} />
    </figure>
  )
}
