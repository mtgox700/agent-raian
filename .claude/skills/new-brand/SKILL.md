---
name: new-brand
description: Add a brand (a new body) on the existing chassis - theme, texts, deployment - without touching components or the API. Use when asked for a new brand, a white-label, a new skin or a new client site on Phantera.
---

# New brand (new body, same chassis)

A brand is data only: its paint (`packages/themes/themes/<key>.json`) and its texts
(`packages/content/content/<key>/<locale>/*.json`). Components never change for a brand.

## Steps

1. Create it from an existing brand (default: the default one):
   ```bash
   node scripts/new-brand.mjs <key> "<Display name>" <domain> [--from <brand>]
   ```
   It copies theme and texts, sets name/domain/URL/support e-mail, regenerates the
   registries (`scripts/sync-brands.mjs`) and the compiled themes.
2. Work through `packages/content/content/<key>/NOTES.md`:
   - colours in the theme JSON: every variable of the default theme must stay (test
     `apps/api/lib/brand/themes.test.ts`); light themes need `textTiers`;
   - every text: the copy still carries the source brand's words. Facts only, never
     invented figures, testimonials or claims;
   - legal identity in `identity.json` (company, SIREN, address) before any public deployment.
3. Check: `npm run check --workspace=@phantera/themes`, `node scripts/sync-brands.mjs --check`,
   `npm test`, then `NEXT_PUBLIC_BRAND=<key> npm run build --workspace=@phantera/front` and read
   the rendered `index.html` for leftovers of the source brand name.
4. Deploy: a new Vercel project with Root Directory `apps/front` (or `apps/front-v2`),
   `NEXT_PUBLIC_BRAND=<key>`, `API_URL` = the chassis (DEPLOY.md). The chassis is shared.

## Never

- A `if (brand.key === …)` in a component to change a text or a colour: put it in the data.
  A structural difference (a section hidden) is a content flag.
- Editing `*.generated.ts` by hand.
