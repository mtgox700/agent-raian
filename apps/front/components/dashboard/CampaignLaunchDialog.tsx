'use client'

import type { StepChannelDb } from '@/lib/types/channels'
import { useState } from 'react'
import { Send, AlertTriangle, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/events'
import type { SendEstimate } from '@/lib/sequences/launch-estimate'

interface LaunchResult {
  queued: number
  estimate: SendEstimate | null
}

interface CampaignLaunchDialogProps {
  open: boolean
  campaignId: string
  campaignName: string
  workspaceId: string
  qualifiedLeads: number  // FAST_TRACK + NORMAL count
  emailsRemaining: number | null  // null = unlimited
  /** Channel of the sequence's first step: drives the dialog wording
   *  (a full-LinkedIn pipeline must not promise "emails via Resend"). */
  firstStepChannel?: StepChannelDb
  onClose: () => void
  onSuccess?: (result: LaunchResult) => void
}

export function CampaignLaunchDialog({
  open,
  campaignId,
  campaignName,
  workspaceId,
  qualifiedLeads,
  emailsRemaining,
  firstStepChannel = 'EMAIL',
  onClose,
  onSuccess,
}: CampaignLaunchDialogProps) {
  const isLinkedIn = firstStepChannel === 'LINKEDIN'
  const unit = (n: number) =>
    isLinkedIn ? `message${n > 1 ? 's' : ''} LinkedIn` : `e-mail${n > 1 ? 's' : ''}`
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState(false)
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null)

  const toSend = emailsRemaining !== null
    ? Math.min(qualifiedLeads, emailsRemaining)
    : qualifiedLeads

  const handleLaunch = async () => {
    setIsLaunching(true)
    setError(null)

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })

      const data = await res.json() as { success?: boolean; data?: LaunchResult; error?: string }

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Erreur lors du lancement')
      }

      const result: LaunchResult = { queued: data.data?.queued ?? 0, estimate: data.data?.estimate ?? null }

      track('campaign_launched', { campaignId, leadsCount: result.queued })

      setLaunchResult(result)
      setLaunched(true)
      onSuccess?.(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue")
    } finally {
      setIsLaunching(false)
    }
  }

  const unitLabel = isLinkedIn ? 'Messages LinkedIn' : 'E-mails à envoyer'

  const footer = launched ? (
    <Button type="button" variant="outline" size="sm" onClick={onClose}>Fermer</Button>
  ) : (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isLaunching}>
        Annuler
      </Button>
      <Button type="button" size="sm" onClick={handleLaunch} disabled={isLaunching || toSend === 0} aria-busy={isLaunching}>
        {isLaunching
          ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Send className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
        <span className="tabular-nums">{isLaunching ? 'Lancement…' : `Lancer · ${toSend} message${toSend > 1 ? 's' : ''}`}</span>
      </Button>
    </>
  )

  // Native <dialog> in the top layer: transformed ancestors no longer
  // re-anchor it, so no portal is needed.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={isLaunching}
      size="sm"
      title={launched ? 'Campagne lancée' : 'Lancer la campagne'}
      description={<span className="block truncate">{campaignName}</span>}
      footer={footer}
    >
      {!launched ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 divide-x divide-border rounded-[10px] border border-border">
            <div className="px-4 py-3">
              <dt className="font-mono text-xs text-muted">Leads qualifiés</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white">{qualifiedLeads}</dd>
              <dd className="font-mono text-xs text-muted">Fast Track + Normal</dd>
            </div>
            <div className="px-4 py-3">
              <dt className="font-mono text-xs text-muted">{unitLabel}</dt>
              <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-cyan">{toSend}</dd>
              <dd className="font-mono text-xs text-muted">
                {isLinkedIn
                  ? '25 par jour au plus (protection du compte)'
                  : emailsRemaining !== null ? `${emailsRemaining.toLocaleString('fr-FR')} restants ce mois` : 'Illimité'}
              </dd>
            </div>
          </dl>

          <div className="flex items-start gap-2 rounded-md border border-warning/30 px-3 py-3 text-sm text-muted">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
            <p>
              <span className="font-semibold text-warning">Action irréversible.</span>{' '}
              {isLinkedIn ? (
                <>
                  L&apos;envoi démarre tout de suite via votre compte LinkedIn connecté,
                  un message à la fois pour protéger votre compte.
                  <span className="mt-1 block text-xs">
                    Prospects hors de votre réseau : une invitation avec une note courte part à la place
                    du message ; les étapes LinkedIn suivantes leur arrivent en message une fois l&apos;invitation acceptée.
                  </span>
                </>
              ) : (
                "L'envoi démarre tout de suite : un e-mail à la fois, au rythme de votre boîte, pour protéger votre délivrabilité. Vous pouvez fermer cette fenêtre, tout continue en arrière-plan."
              )}
            </p>
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 px-3 py-2 text-sm text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="py-2 text-center" role="status">
          <CheckCircle className="mx-auto mb-3 h-8 w-8 text-success-fg" aria-hidden="true" />
          <p className="text-sm text-white">
            <span className="font-mono tabular-nums">{launchResult?.queued ?? 0}</span>
            {` ${unit(launchResult?.queued ?? 0)} en cours d'envoi`}
          </p>
          {launchResult?.estimate && (
            <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted">
              {describeEstimate(launchResult.estimate, launchResult.queued, isLinkedIn)}
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "moins d'une minute"
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function describeEstimate(e: SendEstimate, queued: number, isLinkedIn: boolean): string {
  if (e.pausedUntil) {
    const at = new Date(e.pausedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return `Votre fournisseur a demandé une pause : les envois reprennent seuls vers ${at}. Aucun message n'est perdu.`
  }
  const from = e.sender ? ` depuis ${e.sender}` : ''
  if (e.days <= 1) {
    return `Tout part aujourd'hui${from}, en ${formatDuration(e.minutesToday)} environ, un message à la fois.`
  }
  const limitNote = isLinkedIn
    ? `LinkedIn limite à ${e.dailyLimit} messages par jour pour protéger votre compte.`
    : `Plafond de ${e.dailyLimit} e-mails par jour pour protéger votre délivrabilité, réglable dans Paramètres, onglet E-mails et canaux.`
  return `${e.today} sur ${queued} partent aujourd'hui${from} (${formatDuration(e.minutesToday)} environ), le reste sur ${e.days} jours. ${limitNote}`
}
