/**
 * @phantera/themes: the paint of each body (brand).
 *
 * A theme is data: a JSON file in themes/ that sets every CSS variable the
 * components read, for two scopes:
 *   - site: marketing pages and auth (on <html data-brand>);
 *   - app:  inside the dashboard ([data-app-shell]), when it differs.
 * Adding a brand = adding a JSON file here. No component changes.
 */

import { z } from 'zod'
import { themeData } from './registry.generated'

const CssVars = z.record(z.string().regex(/^--[\w-]+$/), z.string().min(1))

const TextTiers = z.object({
  /** "R, G, B" of the body text, the three tiers re-anchor text-white/25…/80. */
  rgb: z.string().regex(/^\d{1,3}, \d{1,3}, \d{1,3}$/),
  alphas: z.tuple([z.number(), z.number(), z.number()]),
})

export const Theme = z.object({
  $schema: z.string().optional(),
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  /** The brand served when NEXT_PUBLIC_BRAND is unset (exactly one theme). */
  default: z.boolean().optional(),
  mode: z.enum(['dark', 'light']),
  /** Mode of the dashboard when it differs from the site. */
  appShellMode: z.enum(['dark', 'light']).optional(),
  /** Hosts served by this brand's deployment (one deployment per brand, NEXT_PUBLIC_BRAND). */
  domains: z.array(z.string()),
  /** Hex palette for consumers that cannot read CSS variables (Clerk, web manifest, theme-color). */
  colors: z.object({
    primary: z.string(), primaryDeep: z.string(), background: z.string(),
    surface: z.string(), text: z.string(), textMuted: z.string(),
  }),
  /** Palette of the hosted auth widgets (Clerk sign-in, user menu). */
  auth: z.object({
    background: z.string(), inputBackground: z.string(), inputText: z.string(),
    text: z.string(), textSecondary: z.string(), danger: z.string(), radius: z.string(),
  }),
  vars: z.object({ site: CssVars, app: CssVars.optional() }),
  /** For light themes: the codebase's text-white/NN alphas were tuned on dark grounds. */
  textTiers: z.object({ site: TextTiers.optional(), app: TextTiers.optional() }).optional(),
})
export type Theme = z.infer<typeof Theme>

/** The first theme is the default: its site variables also apply on :root. */
export const themes: Theme[] = themeData.map((t) => Theme.parse(t))

export const DEFAULT_THEME = themes[0].key

export function themeByKey(key: string | null | undefined): Theme {
  return themes.find((t) => t.key === key) ?? themes[0]
}

/** Brand served on a host (`www.example.com:3000` → theme), else null. */
export function themeForHost(host: string | null | undefined): Theme | null {
  if (!host) return null
  const name = host.toLowerCase().replace(/:\d+$/, '')
  return themes.find((t) => t.domains.includes(name)) ?? null
}
