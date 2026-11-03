/**
 * Brand config: SPAR-X (white-label deployment).
 *
 * Sourced from the real brand material (founder-provided logo SVGs + spar-x.fr,
 * archived in .war-room/TEAM_MEMORY.md § CHARTE SPAR-X: extracted 2026-07-04):
 *   • teal #006D71 (exact fill of logo-sparx.svg), off-white #FBFFFE
 *   • ivory page background, charcoal text, editorial serif display
 *   • French, premium consulting tone (« agentique », « orchestrateur »)
 *   • Legal entity: e-kigai SCOP SAS (marque Spar-x), Anglet: RCS Bayonne
 *
 * ⚠️ domain: the Spar-x APP domain is a founder decision (spar-x.fr hosts the
 * consulting site). Placeholder `app.spar-x.fr` until confirmed: update it in
 * packages/content/content/sparx/fr/identity.json and packages/themes/themes/sparx.json.
 */

import type { BrandConfig } from './types'
import { getContent } from '@phantera/content'
import { themeByKey } from '@phantera/themes'

// Identity texts live in packages/content/content/sparx/fr/identity.json,
// colours in packages/themes/themes/sparx.json: this file only assembles them.
const { $schema: _schema, ...identity } = getContent('sparx', 'fr', 'identity')
const theme = themeByKey('sparx')

export const sparxBrand: BrandConfig = {
  key: 'sparx',
  locale: 'fr',
  mode: theme.mode,
  colors: theme.colors,
  ...identity,
}
