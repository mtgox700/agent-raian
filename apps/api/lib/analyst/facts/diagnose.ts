/**
 * Deterministic diagnostics of a campaign. Each rule is explicit: a
 * threshold, the evidence it cites (figures from CampaignFacts, each with
 * its unit and, for a rate, its interval), and what to look at next. No
 * model, no guess: if a rule's condition is not met, it is silent: a
 * healthy campaign gets no diagnosis at all.
 *
 * Severity:
 *   bloquant  nothing can leave until a person acts;
 *   alerte    something measurable is going wrong;
 *   info      a fact worth knowing before drawing conclusions (a pause the
 *             user chose, throttling that resolves by itself, a young campaign).
 *
 * Reviewed by Rebecca (2026-10-17): the unit is the lead, silence is not
 * judged on a campaign too young to have received replies, throttling is
 * not a blockage, and "low score" is not "off target".
 */

import type { CampaignFacts } from './campaign'
import { wilson } from './stats'

export type Severity = 'bloquant' | 'alerte' | 'info'

export type DiagnosisCode =
  | 'campagne_immobile'
  | 'envoi_ralenti'
  | 'en_pause'
  | 'rebonds_anormaux'
  | 'echecs_envoi'
  | 'personne_ne_repond'
  | 'score_faible'
  | 'trop_jeune'

export interface Diagnosis {
  code: DiagnosisCode
  severity: Severity
  title: string
  /** Figures that triggered the rule, each readable on its own. */
  evidence: string[]
  /** The rule, as it is documented. */
  threshold: string
  next: string
}

/**
 * Thresholds, in one place.
 *   bounceRate 5 %: the bulk-sender guidelines of the large mailbox providers
 *     put the danger zone between 2 and 5 %; above 5 %, a mailbox's reputation
 *     is at risk. Alerting is a prompt to check the list, so it fires on the
 *     observed rate and cites its interval.
 *   silentMinContacted 100 leads, at least youngDays old: with 0 replies out of
 *     100 leads the 95 % upper bound is 3.7 %, below a normal cold reply rate.
 *   scoredCoverage 80 %: a share of low scores means little when most leads
 *     were never scored.
 */
export const THRESHOLDS = {
  bounceRate: 0.05,
  bounceMinAttempts: 50,
  failureRate: 0.1,
  failureMinAttempts: 20,
  silentMinContacted: 100,
  lowScoreShare: 0.5,
  lowScoreMinScored: 30,
  scoredCoverage: 0.8,
  youngDays: 7,
  youngContacted: 30,
} as const

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`
const interval = (successes: number, n: number) => {
  const ci = wilson(successes, n)
  return `intervalle à 95 % : ${pct(ci.low)} à ${pct(ci.high)}`
}

/** Holds that only a person can lift. */
const BLOCKING: Record<string, string> = {
  MAILBOX_DISCONNECTED: 'la boîte d’envoi est déconnectée',
  NO_SENDER:            'aucune boîte d’envoi n’est disponible',
  QUOTA:                'le quota d’envois du plan est atteint',
}
/** What lifts each hold: the action a person must take. */
const REMEDY: Record<string, string> = {
  MAILBOX_DISCONNECTED: 'Reconnecter la boîte d’envoi dans Paramètres, onglet « E-mails et canaux »',
  NO_SENDER:            'Connecter ou choisir une boîte d’envoi pour la campagne',
  QUOTA:                'Passer à une formule supérieure ou attendre le renouvellement du quota',
}
/** Holds that resolve by themselves. */
const THROTTLING: Record<string, string> = {
  MAILBOX_CAP:    'le plafond quotidien de la boîte est atteint',
  SHARED_CAP:     'le plafond du domaine partagé est atteint',
  MAILBOX_PAUSED: 'le fournisseur a mis la boîte en pause',
}

const isYoung = (f: CampaignFacts) =>
  f.ageDays !== null && (f.ageDays < THRESHOLDS.youngDays || f.leads.contacted < THRESHOLDS.youngContacted)

function stalled(f: CampaignFacts): Diagnosis | null {
  const queued = f.sendStatus.queued
  const hold = f.sendStatus.hold ?? ''
  const causes = [
    ...(BLOCKING[hold] ? [BLOCKING[hold]] : []),
    ...(f.campaign.senderLost ? ['l’expéditeur de la campagne a été retiré et aucun autre n’a été choisi'] : []),
  ]
  if (queued === 0 || causes.length === 0) return null
  return {
    code: 'campagne_immobile', severity: 'bloquant',
    title: 'La campagne ne peut pas envoyer',
    evidence: [`${queued} message${queued > 1 ? 's' : ''} en file`, ...causes],
    threshold: 'Messages en file et une cause que seule une personne peut lever (boîte déconnectée, aucun expéditeur, quota du plan, expéditeur retiré).',
    next: `${REMEDY[hold] ?? (f.campaign.senderLost ? 'Choisir un nouvel expéditeur pour la campagne' : 'Lever la cause indiquée')} : rien ne partira avant.`,
  }
}

const MOMENT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** "le dimanche 19 octobre à 01:45", Paris time: a user reads it, not a machine. */
export function frenchMoment(iso: string | Date): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'au prochain créneau' : `le ${MOMENT.format(d)}`
}

function throttled(f: CampaignFacts): Diagnosis | null {
  const label = THROTTLING[f.sendStatus.hold ?? '']
  if (f.sendStatus.queued === 0 || !label) return null
  return {
    code: 'envoi_ralenti', severity: 'info',
    title: 'Envois étalés',
    evidence: [`${f.sendStatus.queued} messages en file`, label],
    threshold: 'Messages en file retenus par un plafond ou une pause du fournisseur, qui se lèvent d’eux-mêmes.',
    next: f.sendStatus.resumesAt ? `Reprise prévue ${frenchMoment(f.sendStatus.resumesAt)}.` : 'Les envois reprennent au prochain créneau disponible.',
  }
}

function paused(f: CampaignFacts): Diagnosis | null {
  if (f.sendStatus.queued === 0 || (f.sendStatus.hold !== 'CAMPAIGN_PAUSED' && f.campaign.status !== 'PAUSED')) return null
  return {
    code: 'en_pause', severity: 'info',
    title: 'Campagne en pause',
    evidence: [`${f.sendStatus.queued} messages attendent la reprise`],
    threshold: 'Campagne en pause avec des messages en file.',
    next: 'Reprendre la campagne pour que ces messages partent.',
  }
}

function bounces(f: CampaignFacts): Diagnosis | null {
  const bounced = f.funnel.reduce((s, x) => s + x.bounced, 0)
  const attempted = bounced + f.funnel.reduce((s, x) => s + x.sent, 0)
  if (attempted < THRESHOLDS.bounceMinAttempts || bounced / attempted <= THRESHOLDS.bounceRate) return null
  const verified = f.enrichment.valid ?? 0
  const known = Object.values(f.enrichment).reduce((s, n) => s + n, 0)
  const worst = [...f.mailboxes].filter((m) => m.sent + m.bounced >= 20).sort((a, b) => b.bounceRate.rate - a.bounceRate.rate)[0]
  return {
    code: 'rebonds_anormaux', severity: 'alerte',
    title: 'Trop d’adresses rebondissent',
    evidence: [
      `${bounced} rebonds sur ${attempted} envois (${pct(bounced / attempted)}, ${interval(bounced, attempted)})`,
      ...(known ? [`${pct(verified / known)} des adresses vérifiées comme valides`] : []),
      ...(worst ? [`pire boîte : ${worst.label}, ${pct(worst.bounceRate.rate)}`] : []),
      ...(f.ageDays !== null && f.ageDays < 3 ? ['des rebonds arrivent encore plusieurs jours après l’envoi : ce taux peut monter'] : []),
    ],
    threshold: `Plus de ${pct(THRESHOLDS.bounceRate)} de rebonds sur au moins ${THRESHOLDS.bounceMinAttempts} envois.`,
    next: 'La liste ou son enrichissement est en cause : vérifier les adresses avant d’envoyer. Un taux élevé abîme la réputation de la boîte.',
  }
}

function failures(f: CampaignFacts): Diagnosis | null {
  const failed = f.funnel.reduce((s, x) => s + x.failed, 0)
  const attempted = failed + f.funnel.reduce((s, x) => s + x.sent + x.bounced, 0)
  if (attempted < THRESHOLDS.failureMinAttempts || failed / attempted <= THRESHOLDS.failureRate) return null
  return {
    code: 'echecs_envoi', severity: 'alerte',
    title: 'Le fournisseur refuse des envois',
    evidence: [`${failed} échecs sur ${attempted} tentatives (${pct(failed / attempted)}, ${interval(failed, attempted)})`],
    threshold: `Plus de ${pct(THRESHOLDS.failureRate)} d’échecs sur au moins ${THRESHOLDS.failureMinAttempts} tentatives.`,
    next: 'Configuration de la boîte (authentification, limites du fournisseur) : voir le dernier message d’erreur des envois.',
  }
}

function silence(f: CampaignFacts): Diagnosis | null {
  const contacted = f.leads.contacted
  // A young campaign has not had time to receive replies: no judgement.
  if (isYoung(f) || contacted < THRESHOLDS.silentMinContacted || f.leads.replied > 0) return null
  const first = f.messages[0]
  const sent = f.funnel.reduce((s, x) => s + x.sent, 0)
  return {
    code: 'personne_ne_repond', severity: 'alerte',
    title: 'Aucune réponse',
    evidence: [
      `0 lead sur ${contacted} contactés n’a répondu (${sent} messages envoyés ; ${interval(0, contacted)})`,
      ...(first ? [`premier message : ${first.words} mots, ${first.questions} question${first.questions > 1 ? 's' : ''}, ${first.links} lien${first.links > 1 ? 's' : ''}`] : []),
    ],
    threshold: `Au moins ${THRESHOLDS.silentMinContacted} leads contactés depuis au moins ${THRESHOLDS.youngDays} jours, et aucune réponse.`,
    next: 'Le message ou le ciblage est en cause ; comparer avec une campagne qui répond avant de conclure.',
  }
}

function lowScore(f: CampaignFacts): Diagnosis | null {
  const badges = f.targeting.scoreBadge
  const contacted = badges.reduce((s, b) => s + b.contacted, 0)
  const scored = badges.filter((b) => b.value !== 'UNSCORED').reduce((s, b) => s + b.contacted, 0)
  const weak = badges.filter((b) => b.value === 'NURTURE' || b.value === 'SKIP').reduce((s, b) => s + b.contacted, 0)
  if (scored < THRESHOLDS.lowScoreMinScored || contacted === 0 || scored / contacted < THRESHOLDS.scoredCoverage) return null
  if (weak / scored <= THRESHOLDS.lowScoreShare) return null
  return {
    code: 'score_faible', severity: 'alerte',
    title: 'La plupart des contacts ont un score faible',
    evidence: [
      `${weak} des ${scored} leads contactés et notés sont « à mûrir » ou « à ignorer » (${pct(weak / scored)})`,
      `${pct(scored / contacted)} des leads contactés sont notés`,
    ],
    threshold: `Plus de ${pct(THRESHOLDS.lowScoreShare)} des leads notés en NURTURE ou SKIP, sur au moins ${THRESHOLDS.lowScoreMinScored} leads notés et ${pct(THRESHOLDS.scoredCoverage)} de leads notés.`,
    next: 'Le score mesure l’adéquation au profil de l’espace : resserrer le ciblage, ou n’envoyer qu’aux leads FAST_TRACK et NORMAL.',
  }
}

function tooYoung(f: CampaignFacts): Diagnosis | null {
  if (f.ageDays === null || !isYoung(f)) return null
  const young = f.ageDays < THRESHOLDS.youngDays
  return {
    code: 'trop_jeune', severity: 'info',
    title: 'Trop tôt pour conclure',
    evidence: [
      ...(young ? [`premier envoi il y a ${Math.floor(f.ageDays)} jour${Math.floor(f.ageDays) > 1 ? 's' : ''}`] : []),
      ...(f.leads.contacted < THRESHOLDS.youngContacted ? [`${f.leads.contacted} leads contactés`] : []),
    ],
    threshold: `Moins de ${THRESHOLDS.youngDays} jours depuis le premier envoi, ou moins de ${THRESHOLDS.youngContacted} leads contactés.`,
    next: 'Les taux de cette campagne ne se comparent pas encore : attendre avant de juger.',
  }
}

const RULES = [stalled, throttled, paused, bounces, failures, silence, lowScore, tooYoung]
const ORDER: Record<Severity, number> = { bloquant: 0, alerte: 1, info: 2 }

export function diagnose(facts: CampaignFacts): Diagnosis[] {
  return RULES.map((rule) => rule(facts)).filter((d): d is Diagnosis => d !== null).sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
