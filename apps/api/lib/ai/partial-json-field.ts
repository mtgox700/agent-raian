/**
 * Reads a string field out of a JSON object that is still streaming.
 *
 * The sequence writer streams `{"subject":"…","body":"…"}` token by token;
 * the wizard showed that raw JSON to the user. This returns the text of the
 * field received so far, unescaped, or '' while the field has not started.
 */
export function partialJsonField(raw: string, field: string): string {
  const match = new RegExp(`"${field}"\\s*:\\s*"`).exec(raw)
  if (!match) return ''

  let out = ''
  for (let i = match.index + match[0].length; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') return out
    if (ch !== '\\') { out += ch; continue }

    const next = raw[i + 1]
    if (next === undefined) return out // escape cut by the stream
    i++
    switch (next) {
      case 'n': out += '\n'; break
      case 't': out += '\t'; break
      case 'r': break
      case 'u': {
        const hex = raw.slice(i + 1, i + 5)
        if (hex.length < 4) return out
        out += String.fromCharCode(parseInt(hex, 16))
        i += 4
        break
      }
      default: out += next // \" \\ \/
    }
  }
  return out
}
