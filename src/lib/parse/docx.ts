import mammoth from 'mammoth'
import { parsePlainText } from './text'
import { EmptyDocumentError, UnreadableFileError } from './errors'

export async function parseDocx(bytes: ArrayBuffer): Promise<string[]> {
  let raw: string
  try {
    // mammoth ships two builds that read different keys for the same bytes —
    // the browser one takes `arrayBuffer`, the Node one `buffer` — and both
    // hand it to the same unzip call. Passing both keeps this working under
    // either, which is what lets the test suite cover the Word path.
    const result = await mammoth.extractRawText({
      arrayBuffer: bytes,
      buffer: new Uint8Array(bytes),
    } as Parameters<typeof mammoth.extractRawText>[0])
    raw = result.value
  } catch {
    throw new UnreadableFileError(
      'This Word file could not be opened. It may be damaged, or saved in the older .doc format, which Aloud cannot read.',
    )
  }

  const paragraphs = parsePlainText(raw)
  if (paragraphs.length === 0) {
    throw new EmptyDocumentError('This Word file has no text in it.')
  }

  return paragraphs
}
