/**
 * « Le tri », the opening scene of the home page.
 *
 * The market is a field of accounts. The scorer reads it from left to right:
 * most accounts fade, a few light up and line up as the leads Phantera keeps.
 *
 * Server Component: the HTML is the END state (readable without JavaScript and
 * in reduced motion). <ScenePlayer> adds `data-play` after the LCP, which
 * replays the scene from the start through CSS animations whose fill mode is
 * `backwards`. Everything animated is transform, opacity or clip-path.
 *
 * The rows are demonstration data and say so. Scores and badges follow the
 * real rule (lib/leads/badges.ts): >= 80 Fast Track, 50-79 Normal, only
 * those two are sent automatically.
 */

import { ScenePlayer } from './ScenePlayer'

const COLS = 18
const ROWS = 11
/** Duration of the scan line crossing the field, in ms (kept in sync with CSS). */
const SWEEP_MS = 2400
const SWEEP_START_MS = 300

/** Accounts the scorer keeps: [column, row]. */
const KEPT: ReadonlyArray<readonly [number, number]> = [
  [2, 7], [4, 2], [6, 9], [8, 4], [10, 1], [11, 8], [13, 5], [15, 2], [16, 9],
]

interface KeptLead {
  role: string
  company: string
  score: number
  badge: 'Fast Track' | 'Normal'
}

const LEADS: KeptLead[] = [
  { role: 'Directrice commerciale', company: 'Cabinet RH, 14 personnes',  score: 92, badge: 'Fast Track' },
  { role: 'Fondateur',              company: 'ESN, 38 personnes',         score: 88, badge: 'Fast Track' },
  { role: 'Head of Sales',          company: 'Agence web, 9 personnes',   score: 74, badge: 'Normal' },
]

const TOTAL = COLS * ROWS

function delayFor(col: number): number {
  return Math.round(SWEEP_START_MS + ((col + 0.5) / COLS) * SWEEP_MS)
}

export function MarketSort() {
  return (
    <figure
      className="market-sort scene relative rounded-[10px] border border-border bg-obsidian"
     
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 font-mono text-xs text-muted [&>span]:whitespace-nowrap">
        <span>Marché lu : {TOTAL} comptes</span>
        <span className="inline-flex items-center gap-2">
          <span className="ms-live h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden="true" />
          Données de démonstration
        </span>
      </div>

      {/* The field: the dots are two CSS backgrounds (no DOM per account).
          Below, the read field; above it, the unread field, clipped away as
          the scan line passes. Only the kept accounts are elements. */}
      <div className="relative mx-4 mt-4 aspect-[18/11]" aria-hidden="true">
        <div className="ms-field absolute inset-0 opacity-[0.22]" />
        <div className="ms-unread ms-field absolute inset-0 opacity-60" />
        <div className="ms-scan absolute inset-y-[-6px] left-0 w-px bg-cyan" />
        {KEPT.map(([col, row]) => (
          <span
            key={`${col}-${row}`}
            className="ms-kept absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan"
            style={{
              left: `${((col + 0.5) / COLS) * 100}%`,
              top: `${((row + 0.5) / ROWS) * 100}%`,
              ['--d' as string]: `${delayFor(col)}ms`,
            }}
          />
        ))}
      </div>

      <div className="mx-4 mt-4 flex items-baseline justify-between border-t border-border pt-3 font-mono text-xs">
        <span className="text-muted">Retenus, les trois meilleurs ci-dessous</span>
        <span className="ms-count text-white tabular-nums">{KEPT.length} sur {TOTAL}</span>
      </div>

      <ol className="px-4 pb-4 pt-2">
        {LEADS.map((lead, i) => (
          <li
            key={lead.role}
            className="ms-row flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
            style={{ ['--i' as string]: i }}
          >
            <span className="font-mono text-sm text-cyan tabular-nums">{lead.score}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white">{lead.role}</span>
              <span className="block truncate text-xs text-muted">{lead.company}</span>
            </span>
            <span
              className={
                lead.badge === 'Fast Track'
                  ? 'rounded-[4px] border border-gold/40 px-1.5 py-0.5 font-mono text-[11px] text-gold'
                  : 'rounded-[4px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted'
              }
            >
              {lead.badge}
            </span>
          </li>
        ))}
      </ol>

      <figcaption id="market-sort-caption" className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4 border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
        <span>Chaque lead est noté de 0 à 100 selon sa proximité avec votre client idéal. Seuls ceux notés 50 et plus reçoivent un message, les 80 et plus en premier.</span>
        <ScenePlayer label="Rejouer le tri" sceneMs={3800} />
      </figcaption>
    </figure>
  )
}
