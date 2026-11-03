'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel,
  useReactTable, type RowSelectionState, type SortingState,
} from '@tanstack/react-table'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, Globe, HelpCircle, Linkedin, Search,
} from 'lucide-react'
import { Badge, EmptyState, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { LEAD_STATUS_FILTERS, leadMatchesSearch } from '@/lib/leads/lead-status'
import { LEAD_STATUS, leadStatus, tableCopy as t } from '@/lib/copy/leads'
import type { LeadRow } from '@/lib/front/types-leads'
import { LeadDetailDrawer, toHref } from './LeadDetailDrawer'
import { LeadScoreBadge } from './LeadScoreBadge'
import { ScoreGauge } from './ScoreGauge'

/** A checkbox whose `indeterminate` is set on the DOM node (it has no attribute). */
function Checkbox({ indeterminate = false, ...rest }: { indeterminate?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" className="h-4 w-4 cursor-pointer accent-accent" {...rest} />
}

const columnHelper = createColumnHelper<LeadRow>()

const PAGER = 'flex h-8 w-8 items-center justify-center rounded-md border border-line text-quiet transition-colors duration-200 ease-signal hover:border-accent hover:text-ink disabled:pointer-events-none disabled:opacity-30'

export function LeadsTable({ leads, selectedIds = [], onSelectionChange, onQueryChange, searching = false, onLeadUpdated }: {
  leads: LeadRow[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  /** Search text and status filter, so the page can search the whole base. */
  onQueryChange?: (query: string, status: string) => void
  /** Shown under the search box while the page fetches matching leads. */
  searching?: boolean
  /** A lead changed in the detail panel (status, opt-out, phone). */
  onLeadUpdated?: (lead: LeadRow) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() => Object.fromEntries(selectedIds.map((id) => [id, true])))
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null)

  const filteredLeads = useMemo(() => {
    if (statusFilter === 'all') return leads
    const statuses = LEAD_STATUS_FILTERS[statusFilter] ?? [statusFilter]
    return leads.filter((l) => statuses.includes(l.status))
  }, [leads, statusFilter])

  // Selection is keyed by lead id. When the page clears it (« Désélectionner »,
  // after an assignment), the boxes clear too.
  useEffect(() => {
    if (selectedIds.length === 0) setRowSelection((current) => (Object.keys(current).length > 0 ? {} : current))
  }, [selectedIds])

  useEffect(() => {
    onQueryChange?.(globalFilter, statusFilter)
  }, [globalFilter, statusFilter, onQueryChange])

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          aria-label={t.selectAll}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          aria-label={t.select(`${row.original.firstName} ${row.original.lastName}`)}
        />
      ),
      size: 40,
    }),

    columnHelper.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'name',
      header: t.columns.lead,
      cell: (info) => {
        const lead = info.row.original
        const name = info.getValue()
        return (
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line font-mono text-xs font-semibold text-quiet" aria-hidden="true">
              {`${lead.firstName[0] ?? ''}${lead.lastName[0] ?? ''}`}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDetailLead(lead) }}
                  aria-label={t.open(name)}
                  className="truncate rounded-sm text-left text-sm font-medium text-ink transition-colors duration-200 ease-signal hover:text-accent"
                >
                  {name}
                </button>
                {lead.linkedinUrl && (
                  <a
                    href={toHref(lead.linkedinUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={t.linkedin}
                    aria-label={t.linkedinOf(name)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink"
                  >
                    <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
                {lead.website && (
                  <a
                    href={toHref(lead.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={t.website}
                    aria-label={t.websiteOf(name)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-accent"
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
              <div className="truncate text-xs text-quiet">{lead.email}</div>
            </div>
          </div>
        )
      },
    }),

    columnHelper.accessor('company', {
      header: t.columns.company,
      cell: (info) => (
        <div>
          <div className="text-sm text-ink">{info.getValue() ?? '-'}</div>
          <div className="text-xs text-quiet">{info.row.original.title ?? '-'}</div>
        </div>
      ),
    }),

    columnHelper.accessor('industry', {
      header: t.columns.industry,
      cell: (info) => (
        <span className="whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs text-quiet">{info.getValue() ?? '-'}</span>
      ),
    }),

    columnHelper.accessor('aiScore', {
      header: t.columns.score,
      sortingFn: 'basic',
      cell: (info) => {
        const lead = info.row.original
        const score = info.getValue()
        if (lead.scoreBadge === 'UNSCORED' || score == null) return <span className="text-xs text-quiet">-</span>
        return (
          <div className="flex items-center gap-2">
            <ScoreGauge score={score} size={28} />
            <LeadScoreBadge badge={lead.scoreBadge} />
          </div>
        )
      },
    }),

    columnHelper.accessor('status', {
      header: t.columns.status,
      cell: (info) => {
        const s = leadStatus(info.getValue())
        return <Badge tone={s.tone}>{s.label}</Badge>
      },
    }),

    columnHelper.accessor('enrichment', {
      id: 'enriched',
      header: t.columns.email,
      enableSorting: false,
      cell: (info) => {
        const enrichment = info.getValue()
        if (!enrichment) return <span className="text-xs text-quiet">-</span>
        const Icon = enrichment.emailVerified ? Check : HelpCircle
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium', enrichment.emailVerified ? 'text-success' : 'text-warning')}>
              <Icon className="h-3 w-3" aria-hidden="true" />
              {enrichment.emailVerified ? t.verified : t.uncertain}
            </span>
            {enrichment.emailConfidence != null && (
              <span className="font-mono text-[11px] tabular-nums text-quiet">{t.percent(enrichment.emailConfidence)}</span>
            )}
          </div>
        )
      },
    }),

    columnHelper.accessor('source', {
      header: t.columns.source,
      cell: (info) => <span className="font-mono text-[11px] text-quiet">{t.sources[info.getValue()] ?? info.getValue()}</span>,
    }),
  ], [])

  // TanStack Table returns functions React Compiler cannot memoize; the table is local to this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(next)
      onSelectionChange?.(Object.entries(next).filter(([, v]) => v).map(([id]) => id))
    },
    // Rows keyed by lead id: keyed by position, a selection pointed at other
    // leads as soon as the filter or the list changed.
    getRowId: (lead) => lead.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Same word rule as the server search (lib/leads/lead-status).
    globalFilterFn: (row, _columnId, value) => leadMatchesSearch(row.original, String(value ?? '')),
    // 10 rows per page: also caps the hydration cost of 500 rows.
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
    enableRowSelection: true,
  })

  const { pageIndex, pageSize } = table.getState().pagination
  const totalRows = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, totalRows)

  const pages = Array.from({ length: pageCount }, (_, i) => i)
    .filter((i) => i === 0 || i === pageCount - 1 || Math.abs(i - pageIndex) <= 1)
    .reduce<number[]>((acc, i, idx, arr) => {
      if (idx > 0 && i - arr[idx - 1]! > 1) acc.push(-1)
      acc.push(i)
      return acc
    }, [])

  return (
    <div className="rounded-lg border border-line bg-raised">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-quiet" aria-hidden="true" />
          <Input
            size="sm"
            type="search"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t.search}
            aria-label={t.searchLabel}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t.filterLabel}>
          {t.filters.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              aria-pressed={statusFilter === s}
              className={cn(
                'rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-200 ease-signal',
                statusFilter === s ? 'border-accent/40 bg-surface text-ink' : 'border-transparent text-quiet hover:text-ink',
              )}
            >
              {s === 'all' ? t.all : LEAD_STATUS[s]?.label ?? s}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-quiet" aria-live="polite">
          {searching ? t.searching : t.count(totalRows)}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="border-b border-line">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const label = flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                      className="h-10 whitespace-nowrap px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-quiet first:pl-4"
                      style={{ width: header.column.columnDef.size === 40 ? 40 : undefined }}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1.5 uppercase tracking-[0.08em] transition-colors duration-200 ease-signal hover:text-ink"
                        >
                          {label}
                          {sorted === 'asc' && <ChevronUp className="h-3 w-3 text-accent" aria-hidden="true" />}
                          {sorted === 'desc' && <ChevronDown className="h-3 w-3 text-accent" aria-hidden="true" />}
                        </button>
                      ) : label}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="[&>tr:last-child]:border-0">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setDetailLead(row.original)}
                aria-selected={row.getIsSelected()}
                className="cursor-pointer border-b border-line transition-colors duration-200 ease-signal hover:bg-surface/50 aria-selected:bg-surface"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-3 align-middle first:pl-4"
                    onClick={cell.column.id === 'select' ? (e) => e.stopPropagation() : undefined}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {totalRows === 0 && <EmptyState title={t.emptyTitle}>{t.emptyBody}</EmptyState>}
      </div>

      {/* Pagination: 10 leads per page */}
      {totalRows > 0 && (
        <nav aria-label={t.paginationLabel} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="font-mono text-[11px] tabular-nums text-quiet">{t.range(rangeStart, rangeEnd, totalRows)}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} title={t.first} aria-label={t.first} className={PAGER}>
              <ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} title={t.previous} aria-label={t.previous} className={PAGER}>
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {pages.map((i, idx) => i === -1 ? (
              <span key={`gap-${idx}`} className="px-1 text-[11px] text-quiet" aria-hidden="true">…</span>
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => table.setPageIndex(i)}
                aria-label={t.page(i + 1)}
                aria-current={i === pageIndex ? 'page' : undefined}
                className={cn(
                  'flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 font-mono text-[11px] tabular-nums transition-colors duration-200 ease-signal',
                  i === pageIndex ? 'border-accent/50 bg-surface text-accent' : 'border-transparent text-quiet hover:border-line hover:text-ink',
                )}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} title={t.next} aria-label={t.next} className={PAGER}>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()} title={t.last} aria-label={t.last} className={PAGER}>
              <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      <LeadDetailDrawer
        lead={detailLead}
        onClose={() => setDetailLead(null)}
        onLeadUpdated={(updated) => { setDetailLead(updated); onLeadUpdated?.(updated) }}
      />
    </div>
  )
}
