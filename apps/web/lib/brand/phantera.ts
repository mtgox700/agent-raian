/**
 * Brand config: PHANTERA (default brand).
 *
 * Every value below is EXTRACTED from the previously hardcoded strings
 * (app/layout.tsx metadata, Navbar, Hero, legal pages): not invented.
 * P1 acceptance criterion: with NEXT_PUBLIC_BRAND=phantera the rendered site
 * must be pixel-identical to the pre-refactor version.
 */

import type { BrandConfig } from './types'
import { getContent } from '@phantera/content'
import { themeByKey } from '@phantera/themes'

// Identity texts live in packages/content/content/phantera/fr/identity.json,
// colours in packages/themes/themes/phantera.json: this file only assembles them.
const { $schema: _schema, ...identity } = getContent('phantera', 'fr', 'identity')
const theme = themeByKey('phantera')

export const phanteraBrand: BrandConfig = {
  key: 'phantera',
  locale: 'fr',
  mode: theme.mode,
  colors: theme.colors,
  ...identity,
}
