/** Compiles the themes into one stylesheet (variables per brand and scope). */

import { DEFAULT_THEME, themes, type Theme } from './index'

const TIER_CLASSES = [
  ['25', '30', '35', '40', '45'],
  ['50', '55', '60', '65'],
  ['70', '75', '80'],
]

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
}

function tiers(scope: string, tier: NonNullable<NonNullable<Theme['textTiers']>['site']>): string {
  return TIER_CLASSES.map((alphas, i) =>
    `${scope} :is(${alphas.map((a) => `[class*='text-white/${a}']`).join(', ')}) {\n  color: rgba(${tier.rgb}, ${tier.alphas[i]});\n}`,
  ).join('\n')
}

export function buildCss(): string {
  const out = [
    '/* Generated from packages/themes/themes/*.json by `npm run build --workspace=@phantera/themes`. Do not edit. */',
  ]
  for (const t of themes) {
    const site = `[data-brand='${t.key}']`
    const app = `${site} [data-app-shell]`
    out.push(`${t.key === DEFAULT_THEME ? ':root,\n' : ''}${site} {\n${declarations(t.vars.site)}\n}`)
    if (t.vars.app) out.push(`${app} {\n${declarations(t.vars.app)}\n}`)
    // Light text tiers first, then the app shell restores its own (same specificity, later wins).
    if (t.textTiers?.site) out.push(tiers(site, t.textTiers.site))
    if (t.textTiers?.app) out.push(tiers(app, t.textTiers.app))
  }
  return `${out.join('\n\n')}\n`
}
