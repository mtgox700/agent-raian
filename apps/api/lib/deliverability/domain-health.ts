/**
 * Phantera: Domain Health Score (deliverability-as-product).
 *
 * Turns the deliverability signals we already track into ONE 0-100 score the
 * operator watches: the product surface that backs the core promise
 * ("don't burn your domains"). Pure and fully unit-testable.
 *
 * Inputs are whatever is known; missing fields don't penalize (we score on
 * evidence). Thresholds follow the 2026 ISP rules (Postmaster spam <0.08%,
 * complaint >0.3% = enforcement; hard bounce >2% red).
 */

export type Reputation = 'high' | 'medium' | 'low' | 'bad'

export interface DomainMetrics {
  /** Google Postmaster domain reputation, if known. */
  reputation?: Reputation
  /** Spam-complaint rate 0-1, if known. */
  spamRate?: number
  /** Hard-bounce rate 0-1, if known. */
  bounceRate?: number
  spfOk?: boolean
  dkimOk?: boolean
  dmarcOk?: boolean
  /** Sends today vs the mailbox/domain daily cap (over-cap is risky). */
  sentToday?: number
  dailyCap?: number
}

export type HealthStatus = 'healthy' | 'at_risk' | 'critical'

export interface HealthFactor {
  label: string
  delta: number // negative = penalty
  ok: boolean
}

export interface DomainHealth {
  score: number // 0-100
  status: HealthStatus
  factors: HealthFactor[]
  recommendations: string[]
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function computeDomainHealth(m: DomainMetrics): DomainHealth {
  const factors: HealthFactor[] = []
  const recommendations: string[] = []
  let score = 100

  // ── Authentication (blocking-class for deliverability) ──
  const authChecks: Array<[keyof DomainMetrics, string]> = [
    ['spfOk', 'SPF'], ['dkimOk', 'DKIM'], ['dmarcOk', 'DMARC'],
  ]
  for (const [key, label] of authChecks) {
    const val = m[key]
    if (val === false) {
      score -= 20
      factors.push({ label: `${label} manquant`, delta: -20, ok: false })
      recommendations.push(`Configurer ${label} sur le domaine d'envoi (bloquant post-Google/Yahoo 2024).`)
    } else if (val === true) {
      factors.push({ label, delta: 0, ok: true })
    }
  }

  // ── Spam-complaint rate ──
  if (typeof m.spamRate === 'number') {
    if (m.spamRate > 0.003) {
      score -= 40
      factors.push({ label: 'Taux de plaintes critique', delta: -40, ok: false })
      recommendations.push('Plaintes >0,3% : pauser les envois et nettoyer la liste immédiatement.')
    } else if (m.spamRate > 0.0008) {
      score -= 15
      factors.push({ label: 'Taux de plaintes élevé', delta: -15, ok: false })
      recommendations.push('Plaintes >0,08% : réduire le volume et resserrer le ciblage.')
    } else {
      factors.push({ label: 'Taux de plaintes', delta: 0, ok: true })
    }
  }

  // ── Hard-bounce rate ──
  if (typeof m.bounceRate === 'number') {
    if (m.bounceRate > 0.02) {
      score -= 30
      factors.push({ label: 'Bounce rate critique', delta: -30, ok: false })
      recommendations.push('Bounce >2% : vérifier les emails avant envoi (waterfall + verification).')
    } else if (m.bounceRate > 0.01) {
      score -= 10
      factors.push({ label: 'Bounce rate élevé', delta: -10, ok: false })
      recommendations.push('Bounce >1% : renforcer la vérification des adresses.')
    } else {
      factors.push({ label: 'Bounce rate', delta: 0, ok: true })
    }
  }

  // ── Postmaster reputation ──
  if (m.reputation) {
    const repDelta: Record<Reputation, number> = { high: 0, medium: -10, low: -30, bad: -50 }
    const delta = repDelta[m.reputation]
    score += delta
    factors.push({ label: `Réputation: ${m.reputation}`, delta, ok: delta === 0 })
    if (delta < 0) recommendations.push('Réputation dégradée : ralentir, warmer, et auditer les derniers envois.')
  }

  // ── Over daily cap ──
  if (typeof m.sentToday === 'number' && typeof m.dailyCap === 'number' && m.dailyCap > 0) {
    if (m.sentToday > m.dailyCap) {
      score -= 10
      factors.push({ label: 'Cap journalier dépassé', delta: -10, ok: false })
      recommendations.push('Volume au-dessus du cap : répartir sur plus de mailboxes (rotation).')
    } else {
      factors.push({ label: 'Volume sous le cap', delta: 0, ok: true })
    }
  }

  const finalScore = clamp(score)
  const status: HealthStatus = finalScore >= 80 ? 'healthy' : finalScore >= 50 ? 'at_risk' : 'critical'

  return { score: finalScore, status, factors, recommendations }
}
