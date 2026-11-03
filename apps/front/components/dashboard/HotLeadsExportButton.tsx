'use client'

/**
 * HotLeadsExportButton: "Exporter pour CRM".
 *
 * Downloads the hot-leads list as a CRM-ready CSV (HubSpot/Pipedrive import):
 * full contact context + reply classification/snippet/date + source campaign.
 * Format details that matter for French users: semicolon separator + UTF-8 BOM
 * so Excel FR opens it with correct columns and accents. Pro-gated like the
 * generic leads export (FREE plans get the upgrade prompt handled upstream).
 */

import { downloadCsv, logExport, toCsv } from '@/lib/export/csv'
import { Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/events'
import type { HotLead } from '@/lib/repositories/leads.repository'
import type { Plan } from '@prisma/client'

const CLASSIFICATION_LABELS: Record<string, string> = {
  POSITIVE:        'Intéressé',
  MEETING_REQUEST: 'Rendez-vous demandé',
  NEUTRAL:         'Neutre',
  NEGATIVE:        'Négatif',
  NOT_INTERESTED:  'Pas intéressé',
}

export function HotLeadsExportButton({ leads, plan, onUpgradeNeeded }: {
  leads: HotLead[]
  plan: Plan
  onUpgradeNeeded?: () => void
}) {
  const canExport = plan !== 'FREE'

  const handleExport = () => {
    if (!canExport) { onUpgradeNeeded?.(); return }
    if (leads.length === 0) return
    track('csv_exported', { leadsCount: leads.length })

    const headers = [
      'Prénom', 'Nom', 'Email', 'Entreprise', 'Poste', 'Secteur',
      'LinkedIn', 'Site web', 'Score IA', 'Statut',
      'Classification réponse', 'Extrait de la réponse', 'Date de réponse', 'Campagne',
    ]
    const rows = leads.map((l) => [
      l.firstName, l.lastName, l.email,
      l.company ?? '', l.title ?? '', l.industry ?? '',
      l.linkedinUrl ?? '', l.website ?? '',
      l.aiScore?.toString() ?? '', l.status,
      l.lastReplyClassification ? (CLASSIFICATION_LABELS[l.lastReplyClassification] ?? l.lastReplyClassification) : '',
      l.lastReplySnippet ?? '',
      l.lastReplyAt ? new Date(l.lastReplyAt).toLocaleDateString('fr-FR') : '',
      l.campaignName ?? '',
    ])

    logExport('hot_leads', rows.length)
    downloadCsv(`leads-chauds-crm-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={leads.length === 0}
      title={canExport
        ? 'Télécharger les leads chauds au format CSV prêt pour votre CRM'
        : 'Export CSV réservé aux plans payants'}
    >
      {canExport
        ? <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
        : <Lock className="mr-2 h-3.5 w-3.5" aria-hidden="true" />}
      Exporter pour CRM
    </Button>
  )
}
