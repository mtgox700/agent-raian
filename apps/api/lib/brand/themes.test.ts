/**
 * Brands and themes stay in lockstep: every brand has a theme, every theme
 * paints the same variables as the default one (a missing variable would
 * fall back to the default brand's colour), and the compiled CSS is fresh.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_THEME, themeByKey, themes } from '@phantera/themes'
import { buildCss } from '@phantera/themes/css'
import { BRAND_KEYS, buildBrand } from './index'

describe('themes', () => {
  it('one theme per brand, and every brand assembles (theme + identity)', () => {
    expect(themes.map((t) => t.key).sort()).toEqual([...BRAND_KEYS].sort())
    for (const key of BRAND_KEYS) expect(buildBrand(key).key).toBe(key)
  })

  it('every theme sets every variable of the default theme', () => {
    const expected = Object.keys(themeByKey(DEFAULT_THEME).vars.site).sort()
    for (const t of themes) {
      expect({ key: t.key, vars: Object.keys(t.vars.site).sort() }).toEqual({ key: t.key, vars: expected })
      if (t.vars.app) {
        const missing = Object.keys(t.vars.app).filter((v) => !expected.includes(v))
        expect({ key: t.key, unknownAppVars: missing }).toEqual({ key: t.key, unknownAppVars: [] })
      }
    }
  })

  it('app/themes.generated.css is up to date (npm run themes)', () => {
    const file = join(__dirname, '..', '..', '..', 'front', 'app', 'themes.generated.css')
    expect(readFileSync(file, 'utf8')).toBe(buildCss())
  })
})
