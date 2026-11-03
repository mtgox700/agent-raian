import { describe, expect, it } from 'vitest'
import { serializeSchema } from './serialize-schema'

describe('serializeSchema', () => {
  it('can never close the script tag it is injected in', () => {
    const out = serializeSchema({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
