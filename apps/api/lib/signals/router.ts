/**
 * Phantera: Signal router (intent-based outbound).
 *
 * Maps a buying signal to a recommended outreach playbook, priority, angle, and
 * EU-compliance flag. This is the foundation of the AI SDR: a signal event in ->
 * a routed, prioritized action out. Pure and fully unit-testable.
 *
 * EU-safety follows docs/VEILLE_DATA_SIGNALS_INFRA.md:
 *   company-level signals (funding, hiring, technographic, company web-visit)
 *   are EU-safe on legitimate interest; job-change (LinkedIn-derived PII) needs
 *   a DPA + LIA; person-level web de-anon is not EU-legal (US only).
 */

export type SignalType =
  | 'FUNDING'
  | 'HIRING'
  | 'JOB_CHANGE'
  | 'TECHNOGRAPHIC'
  | 'WEBSITE_VISIT_COMPANY'
  | 'WEBSITE_VISIT_PERSON'

export interface SignalEvent {
  type: SignalType
  leadId?: string
  company?: string
  /** Free-form signal context used for personalization (round size, role, tech…). */
  payload?: Record<string, unknown>
  /** Country of the target, used for EU vs US compliance gating. */
  country?: string
}

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

const PRIORITY_RANK: Record<Priority, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 }

export type EuStatus = 'SAFE' | 'NEEDS_DPA' | 'NOT_EU_LEGAL'

export interface SignalRoute {
  type: SignalType
  playbook: string
  priority: Priority
  /** Suggested first-touch angle for the copywriter. */
  angle: string
  euStatus: EuStatus
  /** Whether the SDR may act autonomously on this in the EU (gates risky ones). */
  euActionable: boolean
}

interface RouteSpec {
  playbook: string
  priority: Priority
  angle: string
  euStatus: EuStatus
}

const ROUTES: Record<SignalType, RouteSpec> = {
  FUNDING: {
    playbook: 'funding-congrats',
    priority: 'HIGH',
    angle: 'Congratulate on the round, tie outreach to the growth use-case it unlocks.',
    euStatus: 'SAFE',
  },
  HIRING: {
    playbook: 'hiring-pain',
    priority: 'HIGH',
    angle: 'Reference the open role / stack gap; reach out within ~2-3 weeks while the need is acute.',
    euStatus: 'SAFE',
  },
  TECHNOGRAPHIC: {
    playbook: 'tech-displacement',
    priority: 'MEDIUM',
    angle: 'Displacement or complementary pitch based on the detected tech stack.',
    euStatus: 'SAFE',
  },
  WEBSITE_VISIT_COMPANY: {
    playbook: 'intent-realtime',
    priority: 'HIGH',
    angle: 'Same-day outreach on shown interest (account visited the site).',
    euStatus: 'SAFE',
  },
  JOB_CHANGE: {
    playbook: 'champion-reintro',
    priority: 'CRITICAL',
    angle: 'Warm "congrats on the new role" re-intro leveraging the prior relationship.',
    euStatus: 'NEEDS_DPA',
  },
  WEBSITE_VISIT_PERSON: {
    playbook: 'person-deanon',
    priority: 'HIGH',
    angle: 'Person-level identification : US traffic only.',
    euStatus: 'NOT_EU_LEGAL',
  },
}

function isEu(country?: string): boolean {
  if (!country) return true // default to the stricter regime when unknown
  const c = country.trim().toLowerCase()
  const nonEu = ['us', 'usa', 'united states', 'ca', 'canada', 'uk', 'united kingdom']
  return !nonEu.includes(c)
}

/** Route a single signal to its playbook + priority + compliance verdict. */
export function routeSignal(signal: SignalEvent): SignalRoute {
  const spec = ROUTES[signal.type]
  const eu = isEu(signal.country)
  // In the EU: SAFE always actionable; NEEDS_DPA actionable (with documented LIA
  // downstream); NOT_EU_LEGAL blocked. Outside the EU everything is actionable.
  const euActionable = !eu || spec.euStatus !== 'NOT_EU_LEGAL'
  return {
    type: signal.type,
    playbook: spec.playbook,
    priority: spec.priority,
    angle: spec.angle,
    euStatus: spec.euStatus,
    euActionable,
  }
}

/** Route + sort a batch of signals for the SDR queue (highest priority first). */
export function prioritizeSignals(signals: SignalEvent[]): SignalRoute[] {
  return signals
    .map(routeSignal)
    .filter((r) => r.euActionable)
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
}
