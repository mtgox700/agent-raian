'use client'

/**
 * Every chart of the analytics page in the same frame: the question it
 * answers as its title, how many leads it rests on and how it is computed,
 * and its data as a table on demand (keyboard and screen-reader path too)
 * or as a CSV file (aggregates only: no prospect data leaves this way).
 */

import { useState, type ReactNode } from 'react'
import { Download, Table2 } from 'lucide-react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui'
import { analyticsCopy } from '@/lib/copy/analytics'
import { downloadCsv, toCsv } from '@/lib/export/csv'
import { cn } from '@/lib/utils'

const t = analyticsCopy.frame

const toolClass = 'flex min-h-[32px] items-center gap-1.5 rounded-md border border-line px-2.5 font-mono text-[11px] text-quiet transition-colors duration-200 ease-signal hover:border-accent hover:text-accent'

export function ChartFrame({ id, question, method, n, children, table, empty, className }: {
  id: string
  question: string
  method: string
  n?: string
  children: ReactNode
  /** Rows of the "Voir les données" table: header first. */
  table?: string[][]
  /** When set, shown instead of the chart. */
  empty?: string | null
  className?: string
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('min-w-0 rounded-lg border border-line bg-raised p-4 md:p-5', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-base font-semibold tracking-[-0.01em] text-ink">{question}</h2>
          <p className="mt-0.5 text-xs text-quiet">{n ? `${n} · ` : ''}{method}</p>
        </div>
        {table && table.length > 1 && !empty && (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className={toolClass}>
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" /> {showTable ? t.showChart : t.showData}
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(t.fileName(id, new Date().toISOString().slice(0, 10)), toCsv(table[0], table.slice(1)))}
              aria-label={t.csvLabel(question)}
              title={t.csvTitle}
              className={cn(toolClass, 'min-w-[32px] justify-center px-2')}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" /> <span className="hidden sm:inline">{t.csv}</span>
            </button>
          </div>
        )}
      </header>
      {empty ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-quiet">{empty}</p>
      ) : showTable && table ? (
        <Table className="min-w-[420px] text-xs">
          <TableCaption className="sr-only">{question}</TableCaption>
          <TableHeader>
            <TableRow>{table[0].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {table.slice(1).map((r, i) => (
              <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className="py-2 font-mono text-xs tabular-nums">{c}</TableCell>)}</TableRow>
            ))}
          </TableBody>
        </Table>
      ) : children}
    </section>
  )
}
