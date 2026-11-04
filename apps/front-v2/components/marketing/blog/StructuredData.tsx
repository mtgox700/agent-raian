import { serializeSchema } from '@/lib/marketing/blog-schema'

/** schema.org JSON-LD, escaped so a string can never close the script tag. */
export function StructuredData({ schema }: { schema: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeSchema(schema) }} />
}
