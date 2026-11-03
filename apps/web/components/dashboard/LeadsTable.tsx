'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type RowSelectionState,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Filter, Linkedin, Globe, Check, HelpCircle } from 'lucide-react'
import { StatusBadge, LEAD_STATUS } from '@/components/ui/status-badge'
import { ScoreGauge } from '@/components/dashboard/ScoreGauge'
import { LeadScoreBadge } from '@/components/dashboard/LeadScoreBadge'
import { LeadDetailDrawer } from '@/components/dashboard/LeadDetailDrawer'
import type { LeadWithEnrichment } from '@/lib/types/lead'
import { LEAD_STATUS_FILTERS, leadMatchesSearch } from '@/lib/leads/lead-status'

// Normalise a bare URL for use as an href.
const toHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

// ─── Status styles ────────────────────────────────────────────────────────────

// Not contacted yet either: "queued" is shown and filtered with "Nouveau".
function leadStatus(status: string) {
  if (status === 'queued') return LEAD_STATUS.new!
  return LEAD_STATUS[status] ?? LEAD_STATUS.new!
}

// ─── Indeterminate checkbox (ref-based for correct DOM behaviour) ─────────────

function IndeterminateCheckbox({
  indeterminate,
  ...rest
}: { indeterminate: boolean } & React.HTMLAttributes<HTMLInputElement> & { checked?: boolean; onChange?: React.ChangeEventHandler<HTMLInputElement> }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate
    }
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-white/[0.03] accent-cyan"
      {...rest}
    />
  )
}

// ─── Column helper ────────────────────────────────────────────────────────────

const columnHelper = createColumnHelper<LeadWithEnrichment>()

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadsTableProps {
  leads: LeadWithEnrichment[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /** Search text and status filter, so the page can search the whole base. */
  onQueryChange?: (query: string, status: string) => void
  /** Shown under the search box while the page fetches matching leads. */
  searching?: boolean
  /** A lead changed in the detail panel (status, opt-out). */
  onLeadUpdated?: (lead: LeadWithEnrichment) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadsTable({ leads, selectedIds = [], onSelectionChange, onQueryChange, searching = false, onLeadUpdated }: LeadsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() =>
    Object.fromEntries(selectedIds.map((id) => [id, true]))
  )
  const [detailLead, setDetailLead] = useState<LeadWithEnrichment | null>(null)

  const filteredLeads = useMemo(() => {
    if (statusFilter === 'all') return leads
    const statuses = LEAD_STATUS_FILTERS[statusFilter] ?? [statusFilter]
    return leads.filter((l) => statuses.includes(l.status))
  }, [leads, statusFilter])

  // Selection is keyed by lead id (see getRowId). When the page clears it
  // ("Désélectionner", after an assignment), the boxes must clear too: they
  // stayed checked and the next pick silently included the old leads.
  useEffect(() => {
    if (selectedIds.length === 0) setRowSelection((current) => (Object.keys(current).length > 0 ? {} : current))
  }, [selectedIds])

  useEffect(() => {
    onQueryChange?.(globalFilter, statusFilter)
  }, [globalFilter, statusFilter, onQueryChange])

  const columns = useMemo(
    () => [
      // Checkbox column
      columnHelper.display({
        id: 'select',
        header: ({ table }) => (
          <IndeterminateCheckbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            aria-label="Sélectionner tous les leads"
          />
        ),
        cell: ({ row }) => (
          <IndeterminateCheckbox
            checked={row.getIsSelected()}
            indeterminate={false}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Sélectionner ${row.original.firstName} ${row.original.lastName}`}
          />
        ),
        size: 36,
      }),

      // Name + email
      columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
        id: 'name',
        header: 'Lead',
        cell: (info) => {
          const lead = info.row.original
          const initials = `${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border font-mono text-xs font-semibold text-muted" aria-hidden="true">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDetailLead(lead) }}
                    aria-label={`Ouvrir la fiche de ${info.getValue()}`}
                    className="truncate rounded-sm text-left text-xs font-semibold text-white hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                  >
                    {info.getValue()}
                  </button>
                  {lead.linkedinUrl && (
                    <a
                      href={toHref(lead.linkedinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Profil LinkedIn"
                      aria-label={`Profil LinkedIn de ${info.getValue()}`}
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <Linkedin className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                  {lead.website && (
                    <a
                      href={toHref(lead.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Site web"
                      aria-label={`Site web de ${info.getValue()}`}
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white/5 hover:text-cyan"
                    >
                      <Globe className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="truncate text-[11px] text-muted">{lead.email}</div>
              </div>
            </div>
          )
        },
      }),

      // Company + title
      columnHelper.accessor('company', {
        header: 'Entreprise',
        cell: (info) => (
          <div>
            <div className="text-xs font-medium text-white">{info.getValue() ?? '-'}</div>
            <div className="text-[11px] text-muted">{info.row.original.title ?? '-'}</div>
          </div>
        ),
      }),

      // Industry
      columnHelper.accessor('industry', {
        header: 'Secteur',
        cell: (info) => (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            {info.getValue() ?? '-'}
          </span>
        ),
      }),

      // AI Score + Badge
      columnHelper.accessor('aiScore', {
        header: 'Score IA',
        cell: (info) => {
          const lead = info.row.original
          if (lead.scoreBadge === 'UNSCORED' || info.getValue() == null) {
            return <span className="text-[11px] text-muted">-</span>
          }
          return (
            <div className="flex items-center gap-2">
              <ScoreGauge score={info.getValue()!} size={28} />
              <LeadScoreBadge badge={lead.scoreBadge} size="sm" />
            </div>
          )
        },
        sortingFn: 'basic',
      }),

      // Status
      columnHelper.accessor('status', {
        header: 'Statut',
        cell: (info) => {
          const s = leadStatus(info.getValue())
          return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        },
      }),

      // Email enrichment
      columnHelper.accessor('enrichment', {
        id: 'enriched',
        header: 'E-mail',
        cell: (info) => {
          const enrichment = info.getValue()
          if (!enrichment) return <span className="text-[11px] text-muted">-</span>
          const Icon = enrichment.emailVerified ? Check : HelpCircle
          return (
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${enrichment.emailVerified ? 'text-success-fg' : 'text-warning'}`}>
                <Icon className="h-3 w-3" aria-hidden="true" />
                {enrichment.emailVerified ? 'Vérifié' : 'Incertain'}
              </span>
              {enrichment.emailConfidence != null && (
                <span className="font-mono text-[11px] tabular-nums text-muted">{enrichment.emailConfidence} %</span>
              )}
            </div>
          )
        },
      }),

      // Source
      columnHelper.accessor('source', {
        header: 'Source',
        cell: (info) => {
          const SOURCE_LABELS: Record<string, string> = {
            APOLLO: 'Apollo',
            CSV_IMPORT: 'CSV',
            MANUAL: 'Manuel',
            AI_PROSPECTING: 'IA',
            LINKEDIN: 'LinkedIn',
          }
          return (
            <span className="font-mono text-[11px] text-muted">
              {SOURCE_LABELS[info.getValue()] ?? info.getValue()}
            </span>
          )
        },
      }),
    ],
    []
  )

  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(newSelection)
      // Notify parent with selected lead IDs
      if (onSelectionChange) {
        onSelectionChange(Object.entries(newSelection).filter(([, v]) => v).map(([id]) => id))
      }
    },
    // Rows keyed by lead id: keyed by position, a selection pointed at other
    // leads as soon as the filter or the list changed.
    getRowId: (lead) => lead.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Same word rule as the server search (lib/leads/lead-status).
    globalFilterFn: (row, _columnId, value) => leadMatchesSearch(row.original, String(value ?? '')),
    // Paginated rendering: 10 rows per page. Besides UX, this also caps the
    // hydration cost (500 rows at once was a measured main-thread killer).
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    enableRowSelection: true,
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, totalRows)

  return (
    <div className="rounded-[10px] border border-border bg-obsidian">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Rechercher un lead..."
            aria-label="Rechercher un lead"
            className="h-8 w-full rounded-md border border-border bg-white/[0.03] pl-9 pr-3 text-xs text-white placeholder:text-muted outline-none focus:border-cyan/40 focus:ring-1 focus:ring-cyan/30"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par statut">
          <Filter className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          {(['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ease-signal ${
                statusFilter === s
                  ? 'border-cyan/30 bg-white/[0.06] text-white'
                  : 'border-transparent text-muted hover:text-white'
              }`}
            >
              {s === 'all' ? 'Tous' : LEAD_STATUS[s]?.label ?? s}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-muted" aria-live="polite">
          {searching
            ? 'Recherche dans toute la base…'
            : `${table.getFilteredRowModel().rows.length} lead${table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full min-w-[720px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}
                    className={`px-4 py-2.5 text-left ${header.column.getCanSort() ? 'cursor-pointer select-none' : ''}`}
                    style={{ width: header.column.columnDef.size }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-medium text-muted">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </span>
                      {header.column.getIsSorted() === 'asc' && <ChevronUp className="h-3 w-3 text-cyan" aria-hidden="true" />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDown className="h-3 w-3 text-cyan" aria-hidden="true" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setDetailLead(row.original)}
                className={`group cursor-pointer border-b border-border/60 transition-colors duration-150 last:border-0 hover:bg-white/[0.02] ${row.getIsSelected() ? 'bg-cyan/[0.03]' : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-3"
                    onClick={cell.column.id === 'select' ? (e) => e.stopPropagation() : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {table.getFilteredRowModel().rows.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-muted">Aucun lead trouvé</p>
            <p className="mt-1 text-xs text-muted">Lancez « Prospecter IA » pour sourcer vos premiers leads.</p>
          </div>
        )}
      </div>

      {/* Pagination: 10 leads per page */}
      {totalRows > 0 && (
        <nav aria-label="Pagination des leads" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {rangeStart}-{rangeEnd} sur {totalRows} lead{totalRows > 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              title="Première page"
              aria-label="Première page"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
            >
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              title="Page précédente"
              aria-label="Page précédente"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {/* Numbered pages, windowed around the current page */}
            {Array.from({ length: pageCount }, (_, i) => i)
              .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - pageIndex) <= 1)
              .reduce<number[]>((acc, i, idx, arr) => {
                // insert -1 sentinel for ellipsis gaps
                if (idx > 0 && i - arr[idx - 1] > 1) acc.push(-1)
                acc.push(i)
                return acc
              }, [])
              .map((i, idx) =>
                i === -1 ? (
                  <span key={`gap-${idx}`} className="px-1 text-[11px] text-muted" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={i}
                    onClick={() => table.setPageIndex(i)}
                    aria-label={`Page ${i + 1}`}
                    aria-current={i === pageIndex ? 'page' : undefined}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold tabular-nums transition-colors duration-150 ${
                      i === pageIndex
                        ? 'border border-cyan/40 bg-cyan/10 text-cyan'
                        : 'border border-transparent text-muted hover:border-border hover:text-white'
                    }`}
                  >
                    {i + 1}
                  </button>
                ),
              )}

            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              title="Page suivante"
              aria-label="Page suivante"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
              title="Dernière page"
              aria-label="Dernière page"
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted transition-colors duration-150 hover:border-cyan/30 hover:text-white disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
            >
              <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {/* Mega-pro lead detail slide-over */}
      <LeadDetailDrawer
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onLeadUpdated={(updated) => { setDetailLead(updated); onLeadUpdated?.(updated) }}
      />
    </div>
  )
}
