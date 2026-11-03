import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csv export', () => {
  it('neutralises cells that a spreadsheet would run as formulas', () => {
    expect(csvCell('=HYPERLINK("http://x","clic")')).toBe('"\'=HYPERLINK(""http://x"",""clic"")"')
    expect(csvCell('+33 6 12')).toBe('"\'+33 6 12"')
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"')
    expect(csvCell('-1')).toBe('"\'-1"')
  })

  it('keeps ordinary values, quotes and accents', () => {
    expect(csvCell('Société "Générale"')).toBe('"Société ""Générale"""')
    expect(csvCell(85)).toBe('"85"')
    expect(csvCell(null)).toBe('""')
  })

  it('keeps one lead per row', () => {
    expect(csvCell('ligne 1\nligne 2')).toBe('"ligne 1 ligne 2"')
  })

  it('writes a BOM, semicolons and CRLF rows', () => {
    const csv = toCsv(['Prénom', 'Nom'], [['Zoé', 'Durand']])
    expect(csv).toBe('﻿"Prénom";"Nom"\r\n"Zoé";"Durand"')
  })
})
