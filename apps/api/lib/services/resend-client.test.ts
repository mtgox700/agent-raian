import { describe, expect, it } from 'vitest'
import { renderEmailTemplate, textToHtml } from './resend-client'

const vars = {
  firstName: "N'Golo",
  lastName:  'Durand',
  company:   "L'Atelier & Fils",
  title:     'CEO',
  industry:  'Conseil',
}

describe('renderEmailTemplate', () => {
  it('keeps apostrophes and ampersands readable in a subject line', () => {
    expect(renderEmailTemplate('Une question pour {{company}}', vars)).toBe("Une question pour L'Atelier & Fils")
  })

  it('does not interpret $ sequences from lead data', () => {
    expect(renderEmailTemplate('{{company}}', { ...vars, company: "A$&B $'" })).toBe("A$&B $'")
  })

  it('falls back and drops unknown variables', () => {
    expect(renderEmailTemplate('{{company}} {{unknown}}', { ...vars, company: '' })).toBe('votre entreprise ')
  })
})

describe('textToHtml', () => {
  it('escapes the text once, including lead data and the preheader', () => {
    const body = renderEmailTemplate('Bonjour {{firstName}},\n\n<script>x</script> chez {{company}}', vars)
    const html = textToHtml(body, 'Aperçu <b>')
    expect(html).toContain('Bonjour N&#39;Golo,')
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt; chez L&#39;Atelier &amp; Fils')
    expect(html).toContain('Aperçu &lt;b&gt;')
    expect(html).not.toContain('&amp;#39;')
  })

  it('splits paragraphs written with Windows line endings', () => {
    const html = textToHtml('Un\r\n\r\nDeux\r\nTrois')
    expect(html.match(/<p /g)).toHaveLength(2)
    expect(html).toContain('Deux<br>Trois')
  })
})
