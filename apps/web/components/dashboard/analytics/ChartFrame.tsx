'use client'

/**
 * Every chart of the analytics page in the same frame: the question it
 * answers as its title, how many leads it rests on and how it is computed,
 * and its data as a table on demand (keyboard and screen-reader path too)
 * or as a CSV file (aggregates only: no prospect data leaves this way).
 */

import { useState, type ReactNode } from 'react'
import { Download, Table2 } from 'lucide-react'
import { downloadCsv, toCsv } from '@/lib/export/csv'
import type { Rate } from '@/lib/analyst/facts/campaign'
import { formatPercent } from '@/lib/format/percent'

export const pct = (r: Rate) => formatPercent(r.rate * 100)
export const ci = (r: Rate) => `${formatPercent(r.ci.low * 100)} à ${formatPercent(r.ci.high * 100)}`
export const nf = (n: number) => n.toLocaleString('fr-FR')

export function ChartFrame({ id, question, method, n, children, table, empty }: {
  id: string
  question: string
  method: string
  n?: string
  children: ReactNode
  /** Rows of the "Voir les données" table: header first. */
  table?: string[][]
  /** When set, shown instead of the chart. */
  empty?: string | null
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-[10px] border border-border bg-obsidian p-4 md:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-base font-bold text-white">{question}</h2>
          <p className="mt-0.5 text-xs text-muted">{n ? `${n} · ` : ''}{method}</p>
        </div>
        {table && table.length > 1 && !empty && (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}
              className="flex min-h-[32px] items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] font-semibold text-muted hover:text-white">
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> {showTable ? 'Voir le graphique' : 'Voir les données'}
            </button>
            <button type="button" onClick={() => downloadCsv(`phantera-${id}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(table[0], table.slice(1)))}
              aria-label={`Exporter en CSV : ${question}`} title="Exporter en CSV"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-semibold text-muted hover:text-white">
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        )}
      </header>
      {empty ? (
        <p className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{empty}</p>
      ) : showTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead><tr>{table[0].map((h) => <th key={h} className="border-b border-border px-2 py-2 font-semibold text-muted">{h}</th>)}</tr></thead>
            <tbody>{table.slice(1).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-b border-border/30 px-2 py-2 tabular-nums text-white/85">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </section>
  )
}
