/**
 * Sandbox only: seeds a synthetic workspace for the Analyst's volume tests
 * (E2): 10 campaigns, 50 000 leads, 100 000 sends, ~3 % replies, spread over
 * job titles, industries, sizes, score badges and statuses. Bulk SQL
 * (generate_series), a few seconds.
 *
 *   npx tsx --env-file=.env.local scripts/analyst-seed.ts            seed
 *   npx tsx --env-file=.env.local scripts/analyst-seed.ts --remove   delete it
 *
 * Refuses to run against anything but a local database.
 */

import { PrismaClient } from '@prisma/client'

const CLERK_ID = 'user_analyst_seed'
const CAMPAIGNS = 10
const LEADS_PER_CAMPAIGN = 5_000

function assertLocal(): void {
  const url = process.env.DATABASE_URL ?? ''
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('analyst-seed runs on a local sandbox database only')
}

export async function removeSeed(db: PrismaClient): Promise<void> {
  const user = await db.user.findUnique({ where: { clerkId: CLERK_ID }, select: { id: true } })
  if (!user) return
  const workspaces = await db.workspace.findMany({ where: { ownerId: user.id }, select: { id: true } })
  for (const w of workspaces) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('phantera.erase_workspace', ${w.id}, true)`
      await tx.auditEvent.deleteMany({ where: { workspaceId: w.id } })
      await tx.workspace.delete({ where: { id: w.id } })
    }, { timeout: 120_000 })
  }
  await db.user.delete({ where: { id: user.id } })
}

export async function seed(db: PrismaClient): Promise<{ workspaceId: string; ownerUserId: string; campaignIds: string[] }> {
  await removeSeed(db)
  const user = await db.user.create({ data: { clerkId: CLERK_ID, email: 'analyst-seed@example.invalid', name: 'Seed' } })
  // An unlimited plan: the campaigns are healthy, so diagnose() must stay silent.
  const ws = await db.workspace.create({ data: { name: 'Analyst seed', ownerId: user.id, plan: 'ENTERPRISE' } })
  await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: user.id, role: 'OWNER' } })
  const mailbox = await db.connectedMailbox.create({
    data: { workspaceId: ws.id, ownerUserId: user.id, provider: 'SMTP', email: 'seed@example.invalid', accessTokenEnc: 'x' },
  })

  const campaignIds: string[] = []
  for (let c = 0; c < CAMPAIGNS; c++) {
    const campaign = await db.campaign.create({
      data: {
        workspaceId: ws.id, ownerUserId: user.id, name: `Seed ${c + 1}`, status: 'ACTIVE', connectedMailboxId: mailbox.id,
        emailSteps: { create: [
          { position: 1, dayOffset: 0, subject: 'Question pour {{company}}', body: 'Bonjour {{firstName}}, est-ce un sujet chez vous ?' },
          { position: 2, dayOffset: 4, subject: 'Relance', body: 'Je me permets de revenir vers vous. Un échange de 15 minutes ?' },
        ] },
      },
      select: { id: true, emailSteps: { select: { id: true, position: true } } },
    })
    campaignIds.push(campaign.id)
    const [s1, s2] = campaign.emailSteps.sort((a, b) => a.position - b.position)
    // Each campaign has its own reply propensity, so comparisons have signal.
    const replyRate = 0.01 + c * 0.005

    await db.$executeRaw`
      INSERT INTO "Lead" ("id", "workspaceId", "campaignId", "firstName", "lastName", "email", "title", "industry", "companySize", "country", "scoreBadge", "aiScore", "status", "createdAt", "updatedAt")
      SELECT 'seedlead_' || ${campaign.id} || '_' || g, ${ws.id}, ${campaign.id}, 'Prénom' || g, 'Nom', 'seed' || g || '_' || ${campaign.id} || '@example.invalid',
             (ARRAY['CTO','CEO','Head of Sales','VP Marketing','DSI','Directeur commercial'])[1 + g % 6],
             (ARRAY['SaaS','Industrie','Conseil','Santé','Finance'])[1 + g % 5],
             (ARRAY['S','M','L','XL']::"TargetCompanySize"[])[1 + g % 4],
             (ARRAY['France','Belgique','Suisse'])[1 + g % 3],
             (ARRAY['FAST_TRACK','NORMAL','NORMAL','NURTURE','SKIP']::"LeadScoreBadge"[])[1 + g % 5],
             40 + g % 60, 'contacted', now() - interval '20 days', now()
      FROM generate_series(1, ${LEADS_PER_CAMPAIGN}) AS g`

    await db.$executeRaw`
      INSERT INTO "EmailSend" ("id", "leadId", "campaignId", "emailStepId", "mailboxId", "status", "sentAt", "createdAt")
      SELECT 'seedsend1_' || l."id", l."id", ${campaign.id}, ${s1.id}, ${mailbox.id},
             (CASE WHEN random() < 0.03 THEN 'BOUNCED' WHEN random() < 0.25 THEN 'OPENED' ELSE 'SENT' END)::"EmailSendStatus",
             now() - interval '18 days' + (random() * interval '10 days'), now() - interval '19 days'
      FROM "Lead" l WHERE l."campaignId" = ${campaign.id}`
    await db.$executeRaw`
      INSERT INTO "EmailSend" ("id", "leadId", "campaignId", "emailStepId", "mailboxId", "status", "sentAt", "createdAt")
      SELECT 'seedsend2_' || l."id", l."id", ${campaign.id}, ${s2.id}, ${mailbox.id},
             (CASE WHEN random() < 0.05 THEN 'PENDING' ELSE 'SENT' END)::"EmailSendStatus",
             CASE WHEN random() < 0.05 THEN NULL ELSE now() - interval '12 days' + (random() * interval '8 days') END, now() - interval '13 days'
      FROM "Lead" l WHERE l."campaignId" = ${campaign.id}`
    await db.$executeRaw`UPDATE "EmailSend" SET "sentAt" = NULL WHERE "campaignId" = ${campaign.id} AND "status" = 'PENDING'`

    await db.$executeRaw`
      INSERT INTO "EmailReply" ("id", "emailSendId", "campaignId", "leadId", "receivedAt", "fromEmail", "bodyText", "classification", "confidence", "createdAt")
      SELECT 'seedreply_' || s."id", s."id", ${campaign.id}, s."leadId", s."sentAt" + (random() * interval '72 hours'), 'prospect@example.invalid', 'Réponse synthétique',
             (ARRAY['POSITIVE','NEGATIVE','NEUTRAL'])[1 + floor(random() * 3)::int], 80, now()
      FROM "EmailSend" s
      WHERE s."campaignId" = ${campaign.id} AND s."emailStepId" = ${s1.id} AND s."status" IN ('SENT','OPENED') AND random() < ${replyRate}`
  }
  await db.$executeRaw`ANALYZE "Lead"`
  await db.$executeRaw`ANALYZE "EmailSend"`
  await db.$executeRaw`ANALYZE "EmailReply"`
  return { workspaceId: ws.id, ownerUserId: user.id, campaignIds }
}

if (process.argv[1]?.endsWith('analyst-seed.ts')) {
  assertLocal()
  const db = new PrismaClient()
  const run = process.argv.includes('--remove') ? removeSeed(db).then(() => console.log('removed')) : seed(db).then((r) => console.log(JSON.stringify(r)))
  run.catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
}
