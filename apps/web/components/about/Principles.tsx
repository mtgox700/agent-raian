// Server Component. Why the product is built the way it is: the brand's three
// signatures, each proved by something the product actually does.
// Every proof below is checkable in the code (lib/leads/badges.ts,
// lib/agents/copywriter.ts, lib/sequences, lib/insights, lib/email).

const principles = [
  {
    line: 'Prospectez comme vous aimeriez être prospecté.',
    proofs: [
      'Une séquence écrite pour votre cible, notée et réécrite si elle n’atteint pas 75 sur 100, en trois essais au plus ; chaque lead la reçoit avec son prénom, son entreprise et son poste.',
      'Seuls les leads notés 50 et plus reçoivent un message automatiquement. Les autres attendent, ou sortent de la liste.',
      'Un lien de désinscription dans chaque email, et un prospect désinscrit n’est plus jamais recontacté.',
    ],
  },
  {
    line: 'Les autres envoient. Phantera écoute.',
    proofs: [
      'La séquence s’arrête dès que le prospect répond, et sa réponse est classée : intéressé, rendez-vous, refus.',
      'Les réponses automatiques (absences, accusés de réception) ne comptent pas comme des réponses.',
      'Une alerte vous prévient quand une campagne cale, avec ses preuves et une action que vous confirmez.',
    ],
  },
  {
    line: 'Votre nom vaut plus qu’un taux d’ouverture.',
    proofs: [
      'Connectez votre boîte : vos emails partent de votre adresse, au plafond quotidien que vous choisissez.',
      'Une montée en charge progressive est proposée aux boîtes neuves, et une boîte se met en pause si son fournisseur refuse le volume.',
      'Les chiffres affichés sont ceux de vos envois, sans retouche ni moyenne de marché.',
    ],
  },
]

export function Principles() {
  return (
    <section className="border-b border-border py-24 md:py-32" aria-labelledby="principles-title">
      <div className="mx-auto max-w-[1200px] px-5 md:px-8">
        <h2 id="principles-title" className="font-mono text-sm text-muted">Trois principes, et ce qui les prouve</h2>
        <ol className="mt-10 border-t border-border">
          {principles.map((p, i) => (
            <li key={p.line} className="grid gap-6 border-b border-border py-10 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-5">
                <span className="font-mono text-xs text-cyan tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <p className="mt-3 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-white">
                  {p.line}
                </p>
              </div>
              <ul className="space-y-4 md:col-span-7 md:pt-7">
                {p.proofs.map((proof) => (
                  <li key={proof} className="flex gap-3 leading-relaxed text-muted">
                    <span className="mt-[11px] h-px w-3 shrink-0 bg-cyan" aria-hidden="true" />
                    {proof}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
