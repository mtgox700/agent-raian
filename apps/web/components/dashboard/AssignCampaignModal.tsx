'use client'

/**
 * AssignCampaignModal
 *
 * Bulk-assign selected leads to a campaign (or unassign them).
 * Calls POST /api/leads/assign-campaign.
 */

import { useState } from 'react'
import {
  X, CheckCircle, Loader2, AlertCircle, FolderOpen,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StatusBadge, CAMPAIGN_STATUS } from '@/components/ui/status-badge'
import type { CampaignOption } from '@/components/dashboard/AddLeadModal'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AssignCampaignModalProps {
  open:        boolean
  workspaceId: string
  leadIds:     string[]
  campaigns:   CampaignOption[]
  onClose:     () => void
  /** Called after successful assignment. campaignId=null means unassigned. */
  onAssigned:  (campaignId: string | null, count: number) => void
}

type Status = 'idle' | 'loading' | 'success' | 'error'

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignCampaignModal({
  open,
  workspaceId,
  leadIds,
  campaigns,
  onClose,
  onAssigned,
}: AssignCampaignModalProps) {
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined)
  // undefined = nothing chosen yet; null = user explicitly chose "unassign"
  const [status,    setStatus]    = useState<Status>('idle')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [outcome,   setOutcome]   = useState<{ queued: number; active: boolean } | null>(null)

  const handleAssign = async () => {
    // selectedId === undefined means nothing was selected
    if (selectedId === undefined) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/leads/assign-campaign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId, leadIds, campaignId: selectedId }),
      })
      const data = await res.json() as {
        success?: boolean
        data?:    { assigned: number; campaignId: string | null; queued?: number; campaignStatus?: string | null }
        error?:   string
      }

      if (!res.ok || !data.success) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Erreur inconnue')
        return
      }

      setOutcome({ queued: data.data?.queued ?? 0, active: data.data?.campaignStatus === 'ACTIVE' })
      setStatus('success')
      onAssigned(selectedId, data.data?.assigned ?? 0)

      setTimeout(() => {
        onClose()
        setStatus('idle')
        setSelectedId(undefined)
      }, 1_200)
    } catch {
      setStatus('error')
      setErrorMsg('Erreur réseau : vérifiez votre connexion')
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
    ? 'Assignation en cours...'
    : selectedId === null
      ? `Désassigner ${leadIds.length} lead(s)`
      : `Assigner ${leadIds.length} lead(s) à cette campagne`

  const footer = status === 'success' ? undefined : (
    <div className="w-full">
      <Button
        onClick={handleAssign}
        disabled={!canConfirm}
        variant={selectedId === null ? 'outline' : 'default'}
        className={`w-full gap-2 ${selectedId === null ? 'border-danger/40 text-danger hover:border-danger/60' : ''}`}
      >
        {status === 'loading' && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
        {confirmLabel}
      </Button>
      {selectedId === undefined && (
        <p className="mt-2 text-center text-[11px] text-muted">
          Sélectionnez une campagne ci-dessus pour confirmer
        </p>
      )}
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      busy={status === 'loading'}
      title="Assigner à une campagne"
      description={`${leadIds.length} lead${leadIds.length > 1 ? 's' : ''} sélectionné${leadIds.length > 1 ? 's' : ''}`}
      footer={footer}
    >
      {/* Success */}
      {status === 'success' && (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center" role="status">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-success-fg/30">
            <CheckCircle className="h-6 w-6 text-success-fg" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-white">
            {selectedId ? 'Leads assignés' : 'Leads désassignés'}
          </p>
          <p className="text-xs text-muted">
            {!selectedId
              ? 'Les leads ne sont plus liés à aucune campagne.'
              : outcome?.active
                ? outcome.queued > 0
                  ? `${outcome.queued} premier${outcome.queued > 1 ? 's' : ''} message${outcome.queued > 1 ? 's' : ''} mis en file : ils partent au rythme de votre boîte.`
                  : 'Aucun nouveau lead à contacter (déjà contactés ou non qualifiés).'
                : 'Ils partiront quand vous lancerez la campagne.'}
          </p>
        </div>
      )}

      {/* Body */}
      {status !== 'success' && (
        <div className="space-y-3">
          {/* Campaign list */}
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-border py-8 text-center">
              <FolderOpen className="h-6 w-6 text-muted/60" aria-hidden="true" />
              <p className="text-xs text-muted">Aucune campagne disponible</p>
              <p className="text-[11px] text-muted">
                Créez une campagne d&apos;abord pour assigner des leads.
              </p>
            </div>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1" role="group" aria-label="Campagnes">
              {campaigns.map((c) => {
                const isSelected = selectedId === c.id
                const st = CAMPAIGN_STATUS[c.status.toLowerCase()] ?? { tone: 'neutral' as const, label: c.status.toLowerCase() }

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(isSelected ? undefined : c.id)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors duration-150 ease-signal ${
                      isSelected ? 'border-cyan/30 bg-cyan/[0.06]' : 'border-border hover:border-white/20'
                    }`}
                  >
                    <span className="flex-1 truncate text-xs font-semibold text-white">
                      {c.name}
                    </span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    {isSelected && (
                      <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Separator */}
          <div className="flex items-center gap-2 py-0.5" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="font-mono text-[11px] text-muted">ou</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Unassign option */}
          <button
            type="button"
            onClick={() => setSelectedId(selectedId === null ? undefined : null)}
            aria-pressed={selectedId === null}
            className={`flex w-full items-center gap-3 rounded-md border px-4 py-2.5 text-left transition-colors duration-150 ease-signal ${
              selectedId === null ? 'border-danger/30 bg-danger/[0.06]' : 'border-border hover:border-white/20'
            }`}
          >
            <X className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
            <span className={`text-xs font-medium ${selectedId === null ? 'text-danger' : 'text-muted'}`}>
              Désassigner de toute campagne
            </span>
            {selectedId === null && (
              <CheckCircle className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden="true" />
            )}
          </button>

          {/* Error */}
          {status === 'error' && (
            <div className="flex items-start gap-2 rounded-md border border-danger/25 px-3 py-2.5" role="alert">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-danger" aria-hidden="true" />
              <p className="text-xs text-danger">{errorMsg}</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
