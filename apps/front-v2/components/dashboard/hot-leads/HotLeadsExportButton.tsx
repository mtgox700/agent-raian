'use client'

/**
 * « Exporter pour CRM »: the hot leads as a CRM-ready CSV (HubSpot,
 * Pipedrive import): contact, reply classification, snippet and date, source
 * campaign. Semicolons and a UTF-8 BOM for French Excel. Paid offers only,
 * like the leads export.
 */

import { Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui'
import { api } from '@/lib/front/api'
import { downloadCsv, toCsv } from '@/lib/export/csv'
import { hotLeadsCopy } from '@/lib/copy/hot-leads'
import type { HotLead, HotLeadsView } from '@/lib/front/types-hot-leads'
import { track } from '@/components/dashboard/leads/track'

const t = hotLeadsCopy.export

export function HotLeadsExportButton({ leads, plan, onUpgradeNeeded }: {
  leads: HotLead[]
  plan: HotLeadsView['plan']
  onUpgradeNeeded?: () => void
}) {
  const canExport = plan !== 'FREE'

  const handleExport = () => {
    if (!canExport) { onUpgradeNeeded?.(); return }
    if (leads.length === 0) return
    track('csv_exported', { leadsCount: leads.length })
    const rows = leads.map((l) => [
      l.firstName, l.lastName, l.email,
      l.company ?? '', l.title ?? '', l.industry ?? '',
      l.linkedinUrl ?? '', l.website ?? '',
      l.aiScore?.toString() ?? '', l.status,
      l.lastReplyClassification ? (t.classification[l.lastReplyClassification] ?? l.lastReplyClassification) : '',
      l.lastReplySnippet ?? '',
      l.lastReplyAt ? new Date(l.lastReplyAt).toLocaleDateString('fr-FR') : '',
      l.campaignName ?? '',
    ])
    // Leaves the export in the workspace's audit log (best effort).
    void api.call('leads.logExport', { body: { kind: 'hot_leads', count: rows.length } }, { keepalive: true }).catch(() => {})
    downloadCsv(t.filename(new Date().toISOString().slice(0, 10)), toCsv([...t.headers], rows))
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={leads.length === 0} title={canExport ? t.title : t.lockedTitle}>
      {canExport ? <Download className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
      <span className="max-sm:sr-only">{t.label}</span>
    </Button>
  )
}
