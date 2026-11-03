/**
 * Sandbox only: measures the Analyst's facts on the seeded workspace
 * (scripts/analyst-seed.ts): one campaign, then ten compared, plus the
 * EXPLAIN of the heaviest query. Run after seeding; prints real timings.
 *
 *   npx tsx --env-file=.env.local scripts/analyst-bench.ts
 */

import { PrismaClient } from '@prisma/client'
import { getCampaignFacts } from '../lib/analyst/facts/campaign'
import { compareSegments } from '../lib/analyst/facts/compare'
import { diagnose } from '../lib/analyst/facts/diagnose'

async function main() {
  const db = new PrismaClient()
  try {
    const user = await db.user.findUniqueOrThrow({ where: { clerkId: 'user_analyst_seed' }, select: { id: true } })
    const ws = await db.workspace.findFirstOrThrow({ where: { ownerId: user.id }, select: { id: true } })
    const campaigns = await db.campaign.findMany({ where: { workspaceId: ws.id }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    const scope = { workspaceId: ws.id, userId: user.id, role: 'OWNER' as const }
    const sends = await db.emailSend.count({ where: { campaign: { workspaceId: ws.id } } })
    console.log(`workspace: ${campaigns.length} campaigns, ${sends} sends`)

    // Warm-up (connection, plan cache), then measured runs.
    await getCampaignFacts(db, scope, campaigns[0].id)
    const singles: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      await getCampaignFacts(db, scope, campaigns[i % campaigns.length].id)
      singles.push(performance.now() - t0)
    }
    singles.sort((a, b) => a - b)
    console.log(`one campaign (10 000 sends): median ${singles[2].toFixed(0)} ms, max ${singles[4].toFixed(0)} ms`)

    const t0 = performance.now()
    const all = await Promise.all(campaigns.map((c) => getCampaignFacts(db, scope, c.id)))
    const segments = all.map((f) => ({
      arm: { label: f!.campaign.name, successes: f!.leads.replied, n: f!.leads.contacted },
      rest: {
        label: 'les autres',
        successes: all.filter((o) => o !== f).reduce((s, o) => s + o!.leads.replied, 0),
        n: all.filter((o) => o !== f).reduce((s, o) => s + o!.leads.contacted, 0),
      },
      // Seeded together: same mailbox, same period, same targeting.
      confounders: [] as string[],
    }))
    const compared = compareSegments('taux de réponse', segments)
    const diagnoses = all.map((f) => diagnose(f!))
    const tenMs = performance.now() - t0
    console.log(`ten campaigns compared + diagnosed: ${tenMs.toFixed(0)} ms`)
    for (const c of compared) console.log(`  ${c.a.label}: ${(c.a.rate * 100).toFixed(2)} % vs ${(c.b.rate * 100).toFixed(2)} % -> ${c.verdict} (p adj ${c.adjustedP?.toExponential(2) ?? '-'})`)
    console.log(`  diagnoses: ${JSON.stringify(diagnoses.map((d) => d.map((x) => x.code)))}`)

    const plan = await db.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
      `EXPLAIN (ANALYZE, BUFFERS) SELECT lower(btrim(coalesce(l."title", ''))) AS value, count(DISTINCT l."id"), count(DISTINCT s."leadId"), count(DISTINCT r."leadId")
       FROM "Lead" l
       LEFT JOIN "EmailSend" s ON s."leadId" = l."id" AND s."campaignId" = $1 AND s."status"::text IN ('SENT','DELIVERED','OPENED','CLICKED')
       LEFT JOIN "EmailReply" r ON r."leadId" = l."id" AND r."campaignId" = $1
       WHERE l."campaignId" = $1 AND l."email" NOT LIKE 'opposition-%@invalid.phantera'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 15`, campaigns[0].id)
    console.log('EXPLAIN (segment query):')
    for (const row of plan) console.log(`  ${row['QUERY PLAN']}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
