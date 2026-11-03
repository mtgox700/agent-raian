/**
 * Reference dataset of the Analyst: synthetic campaigns whose causes are
 * KNOWN. Every scenario states what is wrong with it (or that nothing is),
 * and diagnose() must find exactly that: no more, no less. E3 to E5 are
 * judged against the same truth.
 *
 * Built at the CampaignFacts level (no database): the database-level
 * seeder for volume tests lives in scripts/analyst-seed.ts.
 */

import type { CampaignFacts, Segment, StepFunnel } from '../facts/campaign'
import { rate } from '../facts/campaign'
import type { DiagnosisCode } from '../facts/diagnose'
import { messageFeatures } from '../facts/message'

const NOW = new Date('2026-10-17T12:00:00Z')
const DAY = 86_400_000

export interface Scenario {
  name: string
  /** What is really wrong, in words: the explanation the Analyst should reach. */
  cause: string
  facts: CampaignFacts
  expected: DiagnosisCode[]
}

interface StepSpec { sent: number; replies?: number; bounced?: number; failed?: number; queued?: number; words?: number; questions?: number; links?: number }

function step(i: number, s: StepSpec): StepFunnel {
  const replies = s.replies ?? 0
  return {
    stepId: `step-${i}`, position: i + 1, channel: 'EMAIL',
    queued: s.queued ?? 0, sending: 0, sent: s.sent, delivered: 0,
    bounced: s.bounced ?? 0, failed: s.failed ?? 0, awaitingUser: 0, skipped: 0,
    replies: { positive: Math.ceil(replies / 2), negative: Math.floor(replies / 2), neutral: 0, total: replies },
    replyRate: rate(replies, s.sent),
    bounceRate: rate(s.bounced ?? 0, s.sent + (s.bounced ?? 0)),
  }
}

function body(words: number, questions: number, links: number): string {
  const text = Array.from({ length: Math.max(0, words - questions - links) }, () => 'mot')
  for (let q = 0; q < questions; q++) text.push('question ?')
  for (let l = 0; l < links; l++) text.push('https://exemple.fr')
  return text.join(' ')
}

function segment(value: string, contacted: number, replied: number): Segment {
  return { value, unknown: false, leads: contacted, contacted, replied, replyRate: rate(replied, contacted) }
}

interface Spec {
  status?: string
  ageDays: number
  steps: StepSpec[]
  hold?: string | null
  senderLost?: boolean
  badges?: Array<[string, number, number]>
  enrichment?: Record<string, number>
  mailboxes?: Array<{ label: string; sent: number; bounced: number }>
}

export function buildFacts(spec: Spec): CampaignFacts {
  const funnel = spec.steps.map((s, i) => step(i, s))
  const sent = funnel.reduce((x, f) => x + f.sent, 0)
  const replies = funnel.reduce((x, f) => x + f.replies.total, 0)
  // One lead per first-step send; replies are distinct leads.
  const contacted = funnel[0]?.sent ?? 0
  const queued = funnel.reduce((x, f) => x + f.queued, 0)
  const badges = spec.badges ?? [['FAST_TRACK', Math.round(contacted * 0.4), 0], ['NORMAL', contacted - Math.round(contacted * 0.4), 0]]
  return {
    campaign: { id: 'c', name: 'Campagne', status: spec.status ?? 'ACTIVE', ownerUserId: 'u', createdAt: new Date(NOW.getTime() - (spec.ageDays + 1) * DAY).toISOString(), senderLost: spec.senderLost ?? false },
    firstSentAt: new Date(NOW.getTime() - spec.ageDays * DAY).toISOString(),
    lastSentAt: NOW.toISOString(),
    ageDays: spec.ageDays,
    leads: { total: contacted + queued, contacted, replied: replies, anonymised: 0, doNotContact: replies },
    replyRate: rate(replies, contacted),
    positiveRate: rate(Math.ceil(replies / 2), contacted),
    meetings: Math.floor(replies / 3),
    converted: 0,
    funnel,
    replyDelayHours: replies >= 20 ? { median: 26, p90: 70, n: replies } : null,
    sendStatus: {
      queued, hold: (spec.hold ?? null) as CampaignFacts['sendStatus']['hold'], resumesAt: null, sender: 'ayoub@acme.fr',
      sentLast24h: 0, dailyLimit: 50, quota: { current: sent, limit: null },
    } as CampaignFacts['sendStatus'],
    mailboxes: (spec.mailboxes ?? [{ label: 'ayoub@acme.fr', sent, bounced: funnel.reduce((x, f) => x + f.bounced, 0) }])
      .map((m) => ({ mailboxId: m.label, label: m.label, status: 'CONNECTED', sent: m.sent, bounced: m.bounced, bounceRate: rate(m.bounced, m.sent + m.bounced), pausedUntil: null, dailyCap: 50 })),
    targeting: {
      title: [], industry: [], companySize: [], country: [],
      scoreBadge: badges.map(([value, c, r]) => segment(value, c, r)),
    },
    enrichment: spec.enrichment ?? { valid: contacted },
    messages: messageFeatures(spec.steps.map((s, i) => ({
      position: i + 1, dayOffset: i * 4, channel: 'EMAIL', subject: 'Question pour {{company}}', body: body(s.words ?? 70, s.questions ?? 1, s.links ?? 0),
    }))),
    rhythm: [{ weekday: 2, hour: 9, sent }],
  }
}

export const SCENARIOS: Scenario[] = [
  {
    name: 'saine et mûre',
    cause: 'Rien : 4,8 % de réponse sur 250 contacts, rebonds faibles, ciblage juste.',
    facts: buildFacts({ ageDays: 21, steps: [{ sent: 250, replies: 9, bounced: 3 }, { sent: 220, replies: 3, bounced: 1 }] }),
    expected: [],
  },
  {
    name: 'saine, grosse campagne',
    cause: 'Rien : 2 % de réponse sur 1 200 contacts, au-dessus de tous les seuils d’alerte.',
    facts: buildFacts({ ageDays: 45, steps: [{ sent: 1200, replies: 18, bounced: 20 }, { sent: 1100, replies: 6, bounced: 4 }, { sent: 1000, replies: 2 }] }),
    expected: [],
  },
  {
    name: 'bloquée par une boîte déconnectée',
    cause: 'La boîte d’envoi a été déconnectée : 140 messages attendent.',
    facts: buildFacts({ ageDays: 12, steps: [{ sent: 60, replies: 2, queued: 140 }], hold: 'MAILBOX_DISCONNECTED' }),
    expected: ['campagne_immobile'],
  },
  {
    name: 'expéditeur retiré',
    cause: 'L’expéditeur choisi a été retiré ; la campagne attend un nouveau choix.',
    facts: buildFacts({ ageDays: 15, steps: [{ sent: 80, replies: 3, queued: 40 }], senderLost: true }),
    expected: ['campagne_immobile'],
  },
  {
    name: 'ciblage raté',
    cause: '70 % des contacts sont notés NURTURE ou SKIP : la campagne vise à côté.',
    facts: buildFacts({ ageDays: 20, steps: [{ sent: 200, replies: 2 }], badges: [['FAST_TRACK', 20, 1], ['NORMAL', 40, 1], ['NURTURE', 90, 0], ['SKIP', 50, 0]] }),
    expected: ['score_faible'],
  },
  {
    name: 'scores faibles mais leads surtout non notés',
    cause: 'Rien de démontrable : 70 % des leads ne sont pas notés, la part de scores faibles ne veut rien dire.',
    facts: buildFacts({ ageDays: 20, steps: [{ sent: 200, replies: 6 }], badges: [['UNSCORED', 140, 4], ['NORMAL', 10, 2], ['NURTURE', 30, 0], ['SKIP', 20, 0]] }),
    expected: [],
  },
  {
    name: 'quota du plan atteint',
    cause: 'Le quota d’envois du plan est épuisé : rien ne part avant le mois prochain ou un changement de plan.',
    facts: buildFacts({ ageDays: 16, steps: [{ sent: 100, replies: 3, queued: 60 }], hold: 'QUOTA' }),
    expected: ['campagne_immobile'],
  },
  {
    name: 'plafond quotidien atteint',
    cause: 'Rien d’anormal : la boîte a atteint son plafond du jour, les envois reprennent demain.',
    facts: buildFacts({ ageDays: 16, steps: [{ sent: 300, replies: 9, queued: 40 }], hold: 'MAILBOX_CAP' }),
    expected: ['envoi_ralenti'],
  },
  {
    name: 'silence d’une campagne trop jeune',
    cause: '150 leads contactés il y a 2 jours, aucune réponse encore : trop tôt, pas un échec.',
    facts: buildFacts({ ageDays: 2, steps: [{ sent: 150 }] }),
    expected: ['trop_jeune'],
  },
  {
    name: 'message long sans question',
    cause: '180 mots, aucune question, deux liens : 0 réponse sur 150 envois.',
    facts: buildFacts({ ageDays: 18, steps: [{ sent: 150, words: 180, questions: 0, links: 2 }] }),
    expected: ['personne_ne_repond'],
  },
  {
    name: 'liste mal enrichie',
    cause: '9 % de rebonds : seules 55 % des adresses étaient vérifiées.',
    facts: buildFacts({ ageDays: 10, steps: [{ sent: 182, replies: 5, bounced: 18 }], enrichment: { valid: 110, accept_all: 60, unknown: 30 } }),
    expected: ['rebonds_anormaux'],
  },
  {
    name: 'fournisseur qui refuse',
    cause: '25 % des envois échouent chez le fournisseur : authentification ou limites.',
    facts: buildFacts({ ageDays: 9, steps: [{ sent: 60, replies: 2, failed: 20 }] }),
    expected: ['echecs_envoi'],
  },
  {
    name: 'trop jeune pour conclure',
    cause: 'Lancée il y a 3 jours, 25 contacts : aucun taux n’est encore interprétable.',
    facts: buildFacts({ ageDays: 3, steps: [{ sent: 25 }] }),
    expected: ['trop_jeune'],
  },
  {
    name: 'en pause avec une file',
    cause: 'Mise en pause par l’utilisateur avec 30 messages en attente : un choix, pas une panne.',
    facts: buildFacts({ status: 'PAUSED', ageDays: 14, steps: [{ sent: 120, replies: 4, queued: 30 }], hold: 'CAMPAIGN_PAUSED' }),
    expected: ['en_pause'],
  },
]
