/** A document Aloud could open but found nothing readable in. */
export class EmptyDocumentError extends Error {
  readonly kind = 'empty'
  constructor(message: string) {
    super(message)
    this.name = 'EmptyDocumentError'
  }
}

/** A file type Aloud cannot read at all. */
export class UnsupportedFileError extends Error {
  readonly kind = 'unsupported'
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedFileError'
  }
}

/** The file matched a supported type but could not be decoded. */
export class UnreadableFileError extends Error {
  readonly kind = 'unreadable'
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableFileError'
  }
}
