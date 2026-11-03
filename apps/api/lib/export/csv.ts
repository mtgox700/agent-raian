/**
 * CSV for spreadsheets and CRM imports.
 *
 * Semicolons and a UTF-8 BOM so French Excel opens it with accents intact.
 * Cells that start like a formula are prefixed with an apostrophe: lead data
 * and reply snippets come from outside, and "=HYPERLINK(…)" in a company name
 * would run as a formula in the customer's spreadsheet.
 */

export type CsvValue = string | number | null | undefined

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: CsvValue): string {
  let s = value == null ? '' : String(value)
  s = s.replace(/\r?\n/g, ' ')
  if (FORMULA_START.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return '﻿' + [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')
}

/** Leaves the export in the workspace's audit log (best effort: the file is already the member's). */
export function logExport(kind: 'leads' | 'hot_leads', count: number): void {
  void fetch('/api/leads/export-log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, count }), keepalive: true,
  }).catch(() => {})
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking right after click() can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
