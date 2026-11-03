// The headline each brand speaks with. Phantera: the « Instrument » signature.
// Spar-x keeps its own identity (founder decision, 2026-10-25): its tagline
// above, and the editorial headline with the italic serif emphasis it had.
// Texts: packages/content/content/<brand>/<locale>/landing.json (hero).
import { isSparx } from '@/lib/brand'
import { landing } from '@/lib/marketing/content'

export const BRAND_EYEBROW = landing.hero.eyebrow

export const BRAND_LEAD = landing.hero.lead

export function BrandHeadline() {
  const { first, highlight } = landing.hero.headline
  // Presentation only: Spar-x sets its emphasis in italic serif.
  if (isSparx) {
    return (
      <>
        {first}
        <br />
        <em className="italic text-cyan">{highlight}</em>
      </>
    )
  }
  return (
    <>
      {first}
      <br />
      <span className="text-cyan">{highlight}</span>
    </>
  )
}
