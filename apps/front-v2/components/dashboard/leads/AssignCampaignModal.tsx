'use client'

/** Bulk-assign the selected leads to a campaign, or unassign them (leads.assignCampaign). */

import { useState } from 'react'
import { AlertCircle, CheckCircle, FolderOpen, Loader2, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Badge, Button, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import { api } from '@/lib/front/api'
import { campaignCard } from '@/lib/app-copy'
import { assignCopy as t } from '@/lib/copy/leads'
import type { CampaignOption } from '@/lib/front/types-leads'
import { apiErrorMessage } from '@/components/dashboard/shared/errors'

type Status = 'idle' | 'loading' | 'success' | 'error'

export function AssignCampaignModal({ open, workspaceId, leadIds, campaigns, onClose, onAssigned }: {
  open: boolean
  workspaceId: string
  leadIds: string[]
  campaigns: CampaignOption[]
  onClose: () => void
  /** Called after a successful assignment; campaignId null means unassigned. */
  onAssigned: (campaignId: string | null, count: number) => void
}) {
  // undefined = nothing chosen yet; null = the user chose "unassign".
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [outcome, setOutcome] = useState<{ queued: number; active: boolean } | null>(null)

  const handleAssign = async () => {
    if (selectedId === undefined) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const data = await api.call('leads.assignCampaign', { body: { workspaceId, leadIds, campaignId: selectedId } })
      setOutcome({ queued: data.data.queued ?? 0, active: data.data.campaignStatus === 'ACTIVE' })
      setStatus('success')
      onAssigned(selectedId, data.data.assigned ?? 0)
      setTimeout(() => {
        onClose()
        setStatus('idle')
        setSelectedId(undefined)
      }, 1_200)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof TypeError ? t.network : apiErrorMessage(err, t.unknownError))
    }
  }

  const handleClose = () => {
    if (status === 'loading') return
    onClose()
    setTimeout(() => {
      setStatus('idle')
      setSelectedId(undefined)
      setErrorMsg('')
    }, 200)
  }

  const canConfirm = selectedId !== undefined && status !== 'loading'
  const confirmLabel = status === 'loading'
    ? t.assigning
    : selectedId === null ? t.confirmUnassign(leadIds.length) : t.confirmAssign(leadIds.length)

  const footer = status === 'success' ? undefined : (
    <div className="w-full">
      <Button
        onClick={handleAssign}
        disabled={!canConfirm}
        variant={selectedId === null ? 'outline' : 'primary'}
        className={cn('w-full', selectedId === null && 'border-danger/50 text-danger hover:border-danger hover:text-danger')}
      >
        {status === 'loading' && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
        {confirmLabel}
      </Button>
      {selectedId === undefined && <p className="mt-2 text-center text-xs text-quiet">{t.pick}</p>}
    </div>
  )

  return (
    <Dialog open={open} onClose={handleClose} title={t.title} description={t.description(leadIds.length)} closeLabel={t.close} footer={footer}>
      {status === 'success' ? (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center" role="status">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-success/40">
            <CheckCircle className="h-6 w-6 text-success" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-ink">{selectedId ? t.assigned : t.unassigned}</p>
          <p className="text-sm text-quiet">
            {!selectedId
              ? t.unassignedBody
              : outcome?.active
                ? outcome.queued > 0 ? t.queued(outcome.queued) : t.nothingQueued
                : t.onLaunch}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line">
              <EmptyState icon={FolderOpen} title={t.noneTitle}>{t.noneBody}</EmptyState>
            </div>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1" role="group" aria-label={t.campaigns}>
              {campaigns.map((c) => {
                const isSelected = selectedId === c.id
                const st = campaignCard.status[c.status.toLowerCase()] ?? { tone: 'neutral' as const, label: c.status.toLowerCase() }
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? undefined : c.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-200 ease-signal',
                      isSelected ? 'border-accent/50 bg-surface' : 'border-line hover:border-quiet/60',
                    )}
                  >
                    <span className="flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {isSelected && <CheckCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="font-mono text-[11px] text-quiet">{t.or}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={() => setSelectedId(selectedId === null ? undefined : null)}
            aria-pressed={selectedId === null}
            className={cn(
              'flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left transition-colors duration-200 ease-signal',
              selectedId === null ? 'border-danger/50 bg-surface' : 'border-line hover:border-quiet/60',
            )}
          >
            <X className="h-4 w-4 text-danger" aria-hidden="true" />
            <span className={cn('text-sm', selectedId === null ? 'text-danger' : 'text-quiet')}>{t.unassign}</span>
            {selectedId === null && <CheckCircle className="ml-auto h-4 w-4 shrink-0 text-danger" aria-hidden="true" />}
          </button>

          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-danger/40 px-3 py-2.5" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm text-danger">{errorMsg}</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
