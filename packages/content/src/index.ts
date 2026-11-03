/**
 * @phantera/content: the texts of each body (brand), per locale.
 *
 * Today the source is the JSON files in content/<brand>/<locale>/<doc>.json,
 * bundled at build time (static pages stay static). A headless CMS plugs in
 * by implementing ContentSource (see README); the documents and their
 * schemas stay the same.
 */

import { documents, type Document, type DocumentName } from './schemas'
import { files } from './registry.generated'

export * from './schemas'

export type Locale = 'fr' | 'en'

export interface ContentSource {
  get<N extends DocumentName>(brand: string, locale: Locale, doc: N): Document<N> | null
}


/** Bundled JSON files, validated against their schema on first read. */
export const fileSource: ContentSource = {
  get(brand, locale, doc) {
    const raw = files[`${brand}/${locale}/${doc}`]
    return raw === undefined ? null : (documents[doc].parse(raw) as Document<typeof doc>)
  },
}

let source: ContentSource = fileSource

/** Swap the source (a CMS adapter, a test double). */
export function setContentSource(next: ContentSource): void {
  source = next
}

/** A document for a brand and locale; falls back to French, then fails loudly. */
export function getContent<N extends DocumentName>(brand: string, locale: Locale, doc: N): Document<N> {
  const found = source.get(brand, locale, doc) ?? (locale !== 'fr' ? source.get(brand, 'fr', doc) : null)
  if (!found) throw new Error(`Missing content: ${brand}/${locale}/${doc}`)
  return found
}

/** Every brand/locale/document present in the bundled files (for completeness tests). */
export const bundledKeys = Object.keys(files)
