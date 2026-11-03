import { describe, expect, it, vi } from 'vitest'

process.env.ENCRYPTION_KEY ??= 'ab'.repeat(32)

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { createFunction: (_: unknown, fn: unknown) => fn } }))

import { strFromU8, unzipSync } from 'fflate'
import { buildExportArchive, tableToCsv } from './workspace-export'
import { runHousekeeping } from '@/lib/inngest/housekeeping'

describe('export tables', () => {
  it('one column per key across rows, dates in ISO, objects as JSON', () => {
    const csv = tableToCsv([
      { id: 'a', createdAt: new Date('2026-10-16T10:00:00Z') },
      { id: 'b', data: { x: 1 } },
    ]).replace(/^﻿/, '')
    const [header, first, second] = csv.split('\r\n')
    expect(header).toBe('"id";"createdAt";"data"')
    expect(first).toBe('"a";"2026-10-16T10:00:00.000Z";""')
    expect(second).toBe('"b";"";"{""x"":1}"')
  })

  it('neutralises spreadsheet formulas coming from prospect data', () => {
    expect(tableToCsv([{ company: '=HYPERLINK("http://evil")' }])).toContain('"\'=HYPERLINK')
  })

  it('an archive with the full JSON, a readme and a CSV per table', () => {
    const files = unzipSync(buildExportArchive({ leads: [{ id: 'l1' }], campaigns: [] }, new Date('2026-10-16T00:00:00Z')))
    expect(Object.keys(files).sort()).toEqual(['LISEZMOI.txt', 'csv/campaigns.csv', 'csv/leads.csv', 'phantera-export.json'])
    expect(JSON.parse(strFromU8(files['phantera-export.json']))).toMatchObject({ format: 1, data: { leads: [{ id: 'l1' }] } })
  })
})

describe('daily housekeeping', () => {
  it('runs every purge even when one fails, and reports each', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = await runHousekeeping([
      { name: 'first', run: async () => 3 },
      { name: 'broken', run: async () => { throw new Error('db down') } },
      { name: 'last', run: async () => 1 },
    ])
    expect(report).toEqual({ first: 3, broken: 'failed: db down', last: 1 })
    error.mockRestore()
  })
})
