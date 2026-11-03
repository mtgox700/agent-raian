/**
 * Inngest: builds a requested workspace export (lib/privacy/workspace-export)
 * and stores the ZIP on its WorkspaceExport row. The archive never travels
 * through a step result (Inngest caps their size): one step builds and
 * stores, and returns only the size.
 */

import type { PrismaClient } from '@prisma/client'
import { inngest, WORKSPACE_EXPORT_EVENT } from './client'
import type { StepLike } from './functions'
import { db } from '@/lib/db'
import { EXPORT_MAX_BYTES, buildExportArchive, collectWorkspaceData } from '@/lib/privacy/workspace-export'
import { createNotification } from '@/lib/services/notifications.service'

export async function buildWorkspaceExport(client: PrismaClient, exportId: string): Promise<{ sizeBytes: number } | { skipped: string }> {
  const job = await client.workspaceExport.findUnique({ where: { id: exportId }, select: { workspaceId: true, requestedById: true, status: true } })
  if (!job) return { skipped: 'not found' }
  if (job.status !== 'PENDING') return { skipped: job.status }
  try {
    const archive = buildExportArchive(await collectWorkspaceData(client, job.workspaceId))
    if (archive.byteLength > EXPORT_MAX_BYTES) throw new Error(`archive too large (${archive.byteLength} bytes)`)
    await client.workspaceExport.update({
      where: { id: exportId },
      data:  { status: 'READY', archive: Buffer.from(archive), sizeBytes: archive.byteLength, completedAt: new Date() },
    })
    await createNotification({
      workspaceId: job.workspaceId,
      userId:      job.requestedById,
      type:        'EXPORT_READY',
      title:       'Export de l’espace prêt',
      body:        'Téléchargez-le dans Paramètres › Sécurité. Le lien expire dans 7 jours.',
    }).catch(() => null)
    return { sizeBytes: archive.byteLength }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[workspace-export] ${exportId} failed:`, message)
    await client.workspaceExport.update({ where: { id: exportId }, data: { status: 'FAILED', error: message.slice(0, 500), completedAt: new Date() } })
    return { skipped: 'failed' }
  }
}

export const workspaceExport = inngest.createFunction(
  {
    id:          'workspace-export',
    name:        'Build a full workspace export',
    retries:     1,
    concurrency: { limit: 2 },
    triggers:    [{ event: WORKSPACE_EXPORT_EVENT }],
    // Killed or timed out: the job must not stay « en préparation ».
    onFailure:   async ({ event }: { event: { data: { event: { data: { exportId?: string } } } } }) => {
      const exportId = event.data.event.data.exportId
      if (exportId) {
        await db.workspaceExport.updateMany({ where: { id: exportId, status: 'PENDING' }, data: { status: 'FAILED', error: 'job failed', completedAt: new Date() } })
      }
    },
  },
  async ({ event, step }) => {
    const exportId = (event.data as { exportId?: string }).exportId
    if (!exportId) return { skipped: 'no export id' }
    return (step as unknown as StepLike).run('build-and-store', () => buildWorkspaceExport(db, exportId))
  },
)
