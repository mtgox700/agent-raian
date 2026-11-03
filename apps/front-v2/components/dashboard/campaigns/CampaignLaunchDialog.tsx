'use client'

/**
 * Launch a campaign (campaigns.launch): what will leave, at which pace, and
 * the estimate the back computes once queued. Same input as body n°1.
 */
import { useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Loader2, Send } from 'lucide-react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { launchCopy as t } from '@/lib/copy/campaigns'
import { api } from '@/lib/front/api'
import type { SendEstimateData, StepChannelKey } from '@/lib/front/types-campaigns'

interface LaunchResult { queued: number; estimate: SendEstimateData | null }

function describeEstimate(e: SendEstimateData, queued: number, isLinkedIn: boolean): string {
  if (e.pausedUntil) {
    return t.paused(new Date(e.pausedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
  }
  const from = t.from(e.sender)
  if (e.days <= 1) return t.allToday(from, t.duration(e.minutesToday))
  const limit = isLinkedIn ? t.linkedinLimit(e.dailyLimit) : t.emailLimit(e.dailyLimit)
  return t.split(e.today, queued, from, t.duration(e.minutesToday), e.days, limit)
}

export function CampaignLaunchDialog({
  open, campaignId, campaignName, workspaceId, qualifiedLeads, emailsRemaining, firstStepChannel = 'EMAIL', onClose, onSuccess,
}: {
  open: boolean
  campaignId: string
  campaignName: string
  workspaceId: string
  /** FAST_TRACK + NORMAL count. */
  qualifiedLeads: number
  /** null = unlimited. */
  emailsRemaining: number | null
  /** Channel of the first step: a full-LinkedIn pipeline must not promise e-mails. */
  firstStepChannel?: StepChannelKey
  onClose: () => void
  onSuccess?: (result: LaunchResult) => void
}) {
  const isLinkedIn = firstStepChannel === 'LINKEDIN'
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LaunchResult | null>(null)

  const toSend = emailsRemaining !== null ? Math.min(qualifiedLeads, emailsRemaining) : qualifiedLeads

  const handleLaunch = async () => {
    setIsLaunching(true)
    setError(null)
    try {
      const res = await api.call('campaigns.launch', { params: { campaignId }, body: { workspaceId } })
      const next = { queued: res.data.queued ?? 0, estimate: res.data.estimate ?? null }
      setResult(next)
      onSuccess?.(next)
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error ?? t.failed) : err instanceof Error ? err.message : t.unexpected)
    } finally {
      setIsLaunching(false)
    }
  }

  const footer = result ? (
    <Button type="button" variant="outline" size="sm" onClick={onClose}>{t.close}</Button>
  ) : (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLaunching}>{t.cancel}</Button>
      <Button type="button" size="sm" onClick={() => void handleLaunch()} disabled={isLaunching || toSend === 0} aria-busy={isLaunching}>
        {isLaunching
          ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="tabular-nums">{isLaunching ? t.launching : t.launchN(toSend)}</span>
      </Button>
    </>
  )

  return (
    <Dialog
      open={open}
      onClose={() => { if (!isLaunching) onClose() }}
      size="sm"
      closeLabel={t.close}
      title={result ? t.titleLaunched : t.titleLaunch}
      description={<span className="block truncate">{campaignName}</span>}
      footer={footer}
    >
      {!result ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 divide-x divide-line rounded-lg border border-line">
            <div className="px-4 py-3">
              <dt className="font-mono text-xs text-quiet">{t.qualified}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{qualifiedLeads}</dd>
              <dd className="font-mono text-xs text-quiet">{t.qualifiedHint}</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="font-mono text-xs text-quiet">{isLinkedIn ? t.linkedinUnit : t.emailUnit}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-accent">{toSend}</dd>
              <dd className="font-mono text-xs text-quiet">
                {isLinkedIn ? t.linkedinCap : emailsRemaining !== null ? t.remainingMonth(emailsRemaining) : t.unlimited}
              </dd>
            </div>
          </dl>

          <div className="flex items-start gap-2 rounded-md border border-warning/30 px-3 py-3 text-sm text-quiet">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              <span className="font-semibold text-warning">{t.irreversible}</span>{' '}
              {isLinkedIn ? (
                <>
                  {t.linkedinBody}
                  <span className="mt-1 block text-xs">{t.linkedinNote}</span>
                </>
              ) : t.emailBody}
            </p>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="py-2 text-center" role="status">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden="true" />
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{result.queued}</span>
            {t.inProgress(t.unit(result.queued, isLinkedIn))}
          </p>
          {result.estimate && (
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-quiet">
              {describeEstimate(result.estimate, result.queued, isLinkedIn)}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
