// The headline each brand speaks with. Phantera: the « Instrument » signature.
// Spar-x keeps its own identity (founder decision, 2026-10-25): its tagline
// above, and the editorial headline with the italic serif emphasis it had.
import { brand, isSparx } from '@/lib/brand'

export const BRAND_EYEBROW = isSparx ? brand.tagline : 'Prospection B2B par agents IA'

export const BRAND_LEAD = isSparx
  ? 'Cinq agents IA trouvent, enrichissent, scorent et contactent vos clients B2B idéaux pendant que vous vous concentrez sur la vente.'
  : 'Des agents IA trouvent les comptes qui ressemblent à vos clients, écrivent un message que vous signeriez, et arrêtent la séquence dès qu’on vous répond. Par email et sur LinkedIn.'

export function BrandHeadline() {
  if (isSparx) {
    return (
      <>
        Votre équipe commerciale IA, autonome.
        <br />
        <em className="italic text-cyan">Prospecte 24h/24. Sans embaucher.</em>
      </>
    )
  }
  return (
    <>
      Les autres envoient.
      <br />
      <span className="text-cyan">{`${brand.name} écoute.`}</span>
    </>
  )
}
