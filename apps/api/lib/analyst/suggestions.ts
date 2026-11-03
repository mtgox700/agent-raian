/**
 * Suggested questions, computed from the E2 diagnoses of the campaigns the
 * asker can see (spec §10: "2 campagnes sont bloquées : voir pourquoi").
 * No model call: these are free.
 */

import type { PrismaClient } from '@prisma/client'
import { campaignScope, type Scope } from '@/lib/auth/scope'
import { getCampaignFacts } from './facts/campaign'
import { diagnose, type Diagnosis } from './facts/diagnose'

export interface Suggestion { label: string; question: string; tone: 'bloquant' | 'alerte' | 'neutre' }

// A blocked campaign must surface even when it is old: every live campaign
// is read, a few at a time so the database pool is not flooded.
const MAX_CAMPAIGNS = 25
const BATCH = 5

export async function suggestions(db: PrismaClient, scope: Scope, now = new Date()): Promise<Suggestion[]> {
  const campaigns = await db.campaign.findMany({
    where: { ...campaignScope(scope), status: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, name: true }, orderBy: { updatedAt: 'desc' }, take: MAX_CAMPAIGNS,
  })
  const diagnosed: Array<{ name: string; diagnoses: Diagnosis[] }> = []
  for (let i = 0; i < campaigns.length; i += BATCH) {
    diagnosed.push(...await Promise.all(campaigns.slice(i, i + BATCH).map(async (c) => {
      const f = await getCampaignFacts(db, scope, c.id, now).catch(() => null)
      return { name: c.name.replace(/\s+/g, ' ').trim().slice(0, 80), diagnoses: f ? diagnose(f) : [] }
    })))
  }

  const out: Suggestion[] = []
  const blocked = diagnosed.filter((d) => d.diagnoses.some((x) => x.severity === 'bloquant'))
  if (blocked.length === 1) out.push({ tone: 'bloquant', label: `« ${blocked[0].name} » est bloquée : voir pourquoi`, question: `Pourquoi la campagne « ${blocked[0].name} » est bloquée, et que faire ?` })
  else if (blocked.length > 1) out.push({ tone: 'bloquant', label: `${blocked.length} campagnes sont bloquées : voir pourquoi`, question: 'Quelles campagnes sont bloquées en ce moment, et pourquoi ?' })
  const warned = diagnosed.find((d) => !blocked.includes(d) && d.diagnoses.some((x) => x.severity === 'alerte'))
  if (warned) out.push({ tone: 'alerte', label: `Que faire pour « ${warned.name} » ?`, question: `Que dois-je changer sur la campagne « ${warned.name} » ?` })
  out.push({ tone: 'neutre', label: 'Que changer cette semaine ?', question: 'Que dois-je changer cette semaine ?' })
  if (campaigns.length >= 2) out.push({ tone: 'neutre', label: 'Quelle campagne marche le mieux, et pourquoi ?', question: 'Quelle est ma meilleure campagne, et pourquoi ?' })
  return out.slice(0, 4)
}
