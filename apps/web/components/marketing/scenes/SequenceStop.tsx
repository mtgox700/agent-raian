/**
 * « L'arrêt net », the second scene: a first message, then a sequence that
 * stops the moment the prospect answers. It is the brand promise made
 * visible, and the third stroke of the logo, the one that stops short.
 *
 * Server Component, END state in the HTML. <ScenePlayer> sets `data-play`
 * when the scene scrolls into view (once), and the CSS replays it.
 * Demonstration data, labelled as such. The highlighted fields are the
 * variables the product really fills per lead (first name, company, title:
 * lib/sequences/send-step.ts), never a per-lead fact.
 */

import { ScenePlayer } from './ScenePlayer'

type StepState = 'sent' | 'replied' | 'stopped'

const STEPS: ReadonlyArray<{ day: string; channel: string; state: StepState }> = [
  { day: 'J0',   channel: 'Email',    state: 'sent' },
  { day: 'J+3',  channel: 'LinkedIn', state: 'replied' },
  { day: 'J+7',  channel: 'Email',    state: 'stopped' },
  { day: 'J+12', channel: 'Email',    state: 'stopped' },
]

const STATE_LABEL: Record<StepState, string> = {
  sent: 'envoyé',
  replied: 'réponse',
  stopped: 'annulé',
}

function Field({ children }: { children: React.ReactNode }) {
  return <span className="ss-field relative rounded-[3px] px-0.5 text-white">{children}</span>
}

export function SequenceStop() {
  return (
    <figure className="sequence-stop scene relative rounded-[10px] border border-border bg-obsidian">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 font-mono text-xs text-muted [&>span]:whitespace-nowrap">
        <span>Séquence : 4 étapes</span>
        <span>Données de démonstration</span>
      </div>

      <div className="px-4 pt-4">
        <p className="font-mono text-xs text-muted">À : Claire Martin, directrice commerciale, Cabinet Meyer</p>
        <p className="ss-line mt-3 text-sm font-medium text-white" style={{ ['--l' as string]: 0 }}>
          Objet : une question pour <Field>Cabinet Meyer</Field>
        </p>
        <p className="ss-line mt-2 text-sm leading-relaxed text-muted" style={{ ['--l' as string]: 1 }}>
          Bonjour <Field>Claire</Field>, en tant que <Field>directrice commerciale</Field>, comment
        </p>
        <p className="ss-line text-sm leading-relaxed text-muted" style={{ ['--l' as string]: 2 }}>
          trouvez-vous les prochains clients de <Field>Cabinet Meyer</Field> ?
        </p>
      </div>

      <div className="relative mx-4 mt-6">
        <span className="ss-rail-base absolute left-[12.5%] right-[12.5%] top-[5px] border-t border-dashed border-border" aria-hidden="true" />
        <span className="ss-rail absolute left-[12.5%] top-[5px] h-px w-1/4 bg-cyan" aria-hidden="true" />
      <ol className="relative grid grid-cols-4" aria-label="Étapes de la séquence">
        {STEPS.map((step, i) => (
          <li key={step.day} className="relative flex flex-col items-center text-center" data-state={step.state} style={{ ['--s' as string]: i }}>
            <span
              className={
                'ss-dot relative z-[1] h-[11px] w-[11px] rounded-full border ' +
                (step.state === 'sent'
                  ? 'border-cyan bg-cyan'
                  : step.state === 'replied'
                    ? 'border-gold bg-gold'
                    : 'border-border bg-obsidian')
              }
              aria-hidden="true"
            />
            <span className="mt-2 font-mono text-xs text-white">{step.day}</span>
            <span className="relative text-xs text-muted">
              {step.channel}
              {step.state === 'stopped' && (
                <span className="ss-strike absolute inset-x-[-2px] top-1/2 h-px bg-muted" aria-hidden="true" />
              )}
            </span>
            <span
              className={
                'ss-state mt-1 font-mono text-[11px] ' +
                (step.state === 'replied' ? 'text-gold' : step.state === 'sent' ? 'text-cyan' : 'text-muted')
              }
            >
              {STATE_LABEL[step.state]}
            </span>
          </li>
        ))}
      </ol>
      </div>

      <div className="ss-reply mx-4 mt-5 rounded-md border border-gold/30 bg-gold/[0.06] px-3 py-2.5">
        <p className="font-mono text-[11px] text-gold">Réponse de Claire, J+3</p>
        <p className="mt-1 text-sm text-white">« Oui, parlons-en jeudi. »</p>
      </div>

      <figcaption id="sequence-stop-caption" className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4 mt-4 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
        <span>Une séquence écrite pour la campagne ; chaque lead la reçoit avec son prénom, son entreprise et son poste. Claire a répondu : ses étapes suivantes sont annulées et vous êtes prévenu.</span>
        <ScenePlayer label="Rejouer la séquence" sceneMs={3900} />
      </figcaption>
    </figure>
  )
}
