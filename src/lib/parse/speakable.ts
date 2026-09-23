/**
 * Turning written shorthand into something worth hearing.
 *
 * Technical writing is full of forms that exist for the eye. A voice reads
 * `parent_id` as "parent underscore id" and a URL one character at a time.
 * These functions convert the worst offenders into the words a person would
 * actually say.
 */

/** A single identifier — not a phrase, a path, or a dotted expression. */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*([_-][A-Za-z0-9]+)*$/

export function spokenIdentifier(code: string): string {
  if (!IDENTIFIER.test(code)) return code

  return code
    .replace(/[_-]+/g, ' ')
    // A capital after a lowercase letter or digit starts a new word.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // In a run of capitals, the last one belongs to the word that follows,
    // so HTTPResponse reads as "HTTP Response" rather than "H T T P Response".
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

// Trailing punctuation belongs to the sentence, not to the address.
const BARE_URL = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,;:!?]/gi

export function spokenUrlsIn(text: string): string {
  return text.replace(BARE_URL, (url) => {
    const withoutScheme = url.replace(/^https?:\/\//i, '')
    const host = withoutScheme.split('/')[0] ?? withoutScheme
    return host.replace(/^www\./i, '')
  })
}
