/**
 * « Le relevé », the third scene: one real campaign alert (E4, live in
 * production, deterministic: no LLM).
 *
 * The wording is the product's own (lib/insights/detect-opportunities.ts,
 * lib/insights/actions.ts): a segment that does not answer, its evidence,
 * the one-click action, its confirmation and its measured effect. The
 * numbers are demonstration data (3/250 = 1,2 %).
 *
 * Server Component, END state in the HTML; <ScenePlayer> replays it once on
 * screen: the evidence lines appear, the action is confirmed, the effect
 * is written.
 */

import { ScenePlayer } from './ScenePlayer'

const EVIDENCE = [
  '1,2 % de réponse (3/250) contre 6,8 % pour le reste de la campagne',
  'écart démontré par le test, même campagne des deux côtés',
  '64 premiers messages de ce segment attendent encore',
]

export function AnalystAlert() {
  return (
    <figure className="analyst-alert scene relative rounded-[10px] border border-border bg-obsidian">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 font-mono text-xs text-muted [&>span]:whitespace-nowrap">
        <span>Alertes de campagne : 1 nouvelle</span>
        <span>Données de démonstration</span>
      </div>

      <div className="p-4">
        <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4">
          <p className="font-mono text-[11px] text-gold">Alerte</p>
          <p className="mt-1.5 text-sm font-semibold leading-snug text-white">
            Le secteur « Immobilier » ne répond pas à « ESN Lyon »
          </p>
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-muted">
            {EVIDENCE.map((line, i) => (
              <li key={line} className="aa-line flex gap-2" style={{ ['--l' as string]: i }}>
                <span className="mt-[7px] h-px w-2.5 shrink-0 bg-muted/60" aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <p className="aa-next mt-3 text-xs leading-relaxed text-white/85">
            <span className="font-semibold text-white">À faire : </span>
            retirer ces premiers messages de la file pour garder le quota et la réputation de la boîte pour les segments qui répondent.
          </p>

          <div className="aa-action mt-4 rounded-md border border-border bg-void/60 p-3">
            <p className="text-xs leading-relaxed text-muted">
              Les premiers messages encore en attente pour ce segment ne partiront pas. Les leads déjà contactés ne sont pas touchés.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="aa-press inline-flex h-8 items-center rounded-md bg-cyan px-3 text-xs font-semibold text-void">
                Retirer ce segment de la file
              </span>
              <span className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs text-muted">Annuler</span>
            </div>
          </div>

          <p className="aa-effect mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-white">
            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan" aria-hidden="true" />
            <span>
              64 premiers messages retirés de la file : ils ne partiront pas.{' '}
              <span className="text-cyan">Remettre ces messages en file</span>
            </span>
          </p>
        </div>
      </div>

      <figcaption id="analyst-alert-caption" className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
        <span>Une alerte n&apos;agit jamais seule : vous confirmez, l&apos;action est journalisée, et elle s&apos;annule en un clic.</span>
        <ScenePlayer label="Rejouer l'alerte" sceneMs={3400} />
      </figcaption>
    </figure>
  )
}
