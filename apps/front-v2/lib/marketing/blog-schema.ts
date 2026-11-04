/** JSON-LD for a <script> tag: `<` is escaped so a string can never close the tag. */
export function serializeSchema(schema: object): string {
  return JSON.stringify(schema).replace(/</g, String.raw`<`)
}
