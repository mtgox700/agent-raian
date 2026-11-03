/**
 * Proactive alerts: what deserves the user's attention without being asked.
 * Pure: the facts of a campaign (lib/analyst/facts) and a few signals over
 * time in, alerts out. Every alert says what was seen, with its numbers,
 * and what to do; a change of rate is an alert only when the facts engine's
 * test proves it, never on a threshold alone.
 *
 * One alert per cause and target: its `key` is what makes a second detection
 * an update rather than a new alert (lib/insights/sweep).
 */

import type { CampaignFacts } from '@/lib/analyst/facts/campaign'
import { rate } from '@/lib/analyst/facts/campaign'
import { compareRates } from '@/lib/analyst/facts/compare'
import { diagnose, frenchMoment, THRESHOLDS } from '@/lib/analyst/facts/diagnose'
import type { ActionKind } from './actions'

export type InsightKind =
  | 'campagne_immobile'
  | 'file_bloquee'
  | 'rebonds_en_hausse'
  | 'reponse_en_chute'
  | 'personne_ne_repond'
  | 'boite_en_pause'
  | 'quota_envoi_proche'
  | 'segment_sous_performant'
  | 'campagne_gagnante'

/** 'opportunite': not a problem, a choice worth making (lib/insights/detect-opportunities). */
export type InsightSeverity = 'bloquant' | 'alerte' | 'opportunite'

export interface DetectedInsight {
  key: string
  kind: InsightKind
  severity: InsightSeverity
  campaignId: string | null
  title: string
  evidence: string[]
  next: string
  /** False when another part of the app already notifies this cause. */
  notify: boolean
  /** One-click actions that answer this cause (lib/insights/actions). */
  actions: ActionKind[]
}

/** Signals over time that the campaign's facts do not hold. */
export interface CampaignSignals {
  /** When the oldest message still waiting to leave was queued. */
  oldestPendingAt: Date | null
  /** When the sender was last changed from an alert: a fresh sender is given time to send. */
  senderChangedAt?: Date | null
  /** Emails attempted and bounced over the last BOUNCE_WINDOW_DAYS. */
  recentBounces: { attempted: number; bounced: number }
  /** Reply within 7 days, leads first contacted 7 to 21 days ago, and 21 to 49 days ago. */
  replies: { recent: { replied: number; mature: number }; before: { replied: number; mature: number } }
}

export const STUCK_HOURS = 24
export const BOUNCE_WINDOW_DAYS = 7
export const QUOTA_WARNING_SHARE = 0.8

const HOUR = 3_600_000
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`
const nf = (n: number) => n.toLocaleString('fr-FR')

export function detectCampaign(facts: CampaignFacts, signals: CampaignSignals, now: Date): DetectedInsight[] {
  const id = facts.campaign.id
  const name = facts.campaign.name
  const out: DetectedInsight[] = []
  const at = (kind: InsightKind) => `${kind}:${id}`
  const diagnoses = diagnose(facts)
  // Pausing only means something for a campaign that sends.
  const pause: ActionKind[] = facts.campaign.status === 'ACTIVE' ? ['pause'] : []
  const senderCause = facts.campaign.senderLost || facts.sendStatus.hold === 'MAILBOX_DISCONNECTED' || facts.sendStatus.hold === 'NO_SENDER'

  // A campaign that cannot send, with a known cause: blocking.
  const stalled = diagnoses.find((d) => d.code === 'campagne_immobile')
  if (stalled) {
    out.push({ key: at('campagne_immobile'), kind: 'campagne_immobile', severity: 'bloquant', campaignId: id, title: `« ${name} » ne peut plus envoyer`, evidence: stalled.evidence, next: stalled.next, notify: true,
      // A new sender answers a sender problem, not a used quota.
      actions: senderCause ? ['change_sender'] : [] })
  }

  // Messages waiting for more than a day with nothing sent, no cause found
  // above, and not a pause the user chose.
  const { queued, sentLast24h, hold } = facts.sendStatus
  const waitingHours = signals.oldestPendingAt ? (now.getTime() - signals.oldestPendingAt.getTime()) / HOUR : 0
  // A sender just changed is given a day: silence right after the fix is not a new problem.
  const freshSender = signals.senderChangedAt ? (now.getTime() - signals.senderChangedAt.getTime()) / HOUR < STUCK_HOURS : false
  if (!stalled && !freshSender && facts.campaign.status === 'ACTIVE' && queued > 0 && sentLast24h === 0 && waitingHours >= STUCK_HOURS && hold !== 'CAMPAIGN_PAUSED') {
    out.push({
      key: at('file_bloquee'), kind: 'file_bloquee', severity: 'bloquant', campaignId: id,
      title: `« ${name} » n’a rien envoyé depuis plus de 24 h`,
      evidence: [`${nf(queued)} message${queued > 1 ? 's' : ''} en attente depuis ${Math.floor(waitingHours)} h`, 'aucun envoi sur les dernières 24 h'],
      next: facts.sendStatus.resumesAt ? `Reprise prévue ${frenchMoment(facts.sendStatus.resumesAt)} ; si rien ne part d’ici là, vérifier la boîte d’envoi.` : 'Ouvrir la campagne : l’état des envois indique ce qui retient les messages.',
      notify: true,
      actions: ['change_sender'],
    })
  }

  // The provider slowed the mailbox down: the send path already notifies it.
  if (hold === 'MAILBOX_PAUSED' && facts.sendStatus.resumesAt) {
    out.push({
      key: at('boite_en_pause'), kind: 'boite_en_pause', severity: 'alerte', campaignId: id,
      title: `La boîte d’envoi de « ${name} » est ralentie par son fournisseur`,
      evidence: [`${nf(queued)} message${queued > 1 ? 's' : ''} en attente`, `reprise prévue ${frenchMoment(facts.sendStatus.resumesAt)}`],
      next: 'Rien à faire si c’est ponctuel ; si cela se répète, baisser le plafond quotidien de la boîte.',
      notify: false,
      actions: [],
    })
  }

  // Bounces over the last days, not since the start: an old dirty list must
  // not ring forever.
  const b = signals.recentBounces
  if (b.attempted >= THRESHOLDS.bounceMinAttempts && b.bounced / b.attempted > THRESHOLDS.bounceRate) {
    const r = rate(b.bounced, b.attempted)
    out.push({
      key: at('rebonds_en_hausse'), kind: 'rebonds_en_hausse', severity: 'alerte', campaignId: id,
      title: `Trop de rebonds sur « ${name} » ces ${BOUNCE_WINDOW_DAYS} derniers jours`,
      evidence: [`${nf(b.bounced)} rebonds sur ${nf(b.attempted)} emails (${pct(r.rate)}, IC 95 % ${pct(r.ci.low)} à ${pct(r.ci.high)})`, `au-delà de ${pct(THRESHOLDS.bounceRate)}, la réputation de la boîte se dégrade`],
      next: 'Mettre la campagne en pause et vérifier les adresses avant de reprendre.',
      notify: true,
      actions: pause,
    })
  }

  // A drop proven by the test, the same campaign on both sides.
  const { recent, before } = signals.replies
  const c = compareRates('reponse',
    { label: 'les 2 dernières semaines', successes: recent.replied, n: recent.mature },
    { label: 'les 4 semaines d’avant', successes: before.replied, n: before.mature },
    { confounders: [] })
  if (c.verdict === 'significatif' && c.delta < 0) {
    out.push({
      key: at('reponse_en_chute'), kind: 'reponse_en_chute', severity: 'alerte', campaignId: id,
      title: `Le taux de réponse de « ${name} » a baissé`,
      evidence: [`${pct(c.a.rate)} (${recent.replied}/${recent.mature}) pour les leads contactés ces 2 dernières semaines`, `${pct(c.b.rate)} (${before.replied}/${before.mature}) les 4 semaines d’avant`, 'écart démontré par le test, même campagne des deux côtés'],
      next: 'Regarder ce qui a changé : liste, message, boîte d’envoi. L’Analyste peut comparer les deux périodes.',
      notify: true,
      actions: pause,
    })
  }

  const silent = diagnoses.find((d) => d.code === 'personne_ne_repond')
  if (silent) {
    out.push({ key: at('personne_ne_repond'), kind: 'personne_ne_repond', severity: 'alerte', campaignId: id, title: `Personne ne répond à « ${name} »`, evidence: silent.evidence, next: silent.next, notify: true, actions: pause })
  }
  return out
}

/** The plan's monthly sends nearly used: one alert per month. */
export function detectWorkspace(quota: { current: number; limit: number; planName: string }, month: string): DetectedInsight[] {
  if (!Number.isFinite(quota.limit) || quota.limit <= 0 || quota.current / quota.limit < QUOTA_WARNING_SHARE) return []
  const used = quota.current / quota.limit
  return [{
    key: `quota_envoi_proche:${month}`, kind: 'quota_envoi_proche', severity: used >= 1 ? 'bloquant' : 'alerte', campaignId: null,
    title: used >= 1 ? 'Le quota d’envois du mois est atteint' : 'Le quota d’envois du mois est presque atteint',
    evidence: [`${nf(quota.current)} emails envoyés sur ${nf(quota.limit)} inclus dans la formule ${quota.planName} (${Math.round(used * 100)} %)`],
    next: used >= 1 ? 'Les envois reprendront le mois prochain, ou tout de suite avec une formule supérieure.' : 'Prévoir une formule supérieure si les campagnes doivent continuer à ce rythme.',
    notify: true,
    actions: [],
  }]
}
