import { serializeSchema } from '@/lib/seo/serialize-schema'

interface StructuredDataProps {
  schema: object
}

export function StructuredData({ schema }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeSchema(schema) }}
    />
  )
}
