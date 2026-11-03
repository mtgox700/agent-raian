# @phantera/contract

Contrat entre le **châssis** (le back, `apps/web/app/api`) et les **carrosseries** (les fronts).
Un front ne s'appuie que sur ce contrat, via `@phantera/sdk`.

- `src/endpoints/<domaine>.ts` : un `endpoint()` par méthode et chemin (params, query, body, réponse 2xx en zod).
- `src/schemas/` : formes partagées (lead, campagne, mailbox…).
- `openapi.json` : **généré**, ne pas éditer (`npm run openapi` à la racine).
- Hors contrat (infrastructure) : webhooks, crons, Inngest, pixels de tracking, MCP, routes de debug (`INFRA_ROUTES`).

## Règles

1. Toute évolution d'API commence ici, puis le handler, puis `npm run openapi`.
2. Un changement cassant (champ retiré, type changé, nouveau champ obligatoire) exige le label `api-breaking` et une nouvelle version.
3. Les erreurs suivent toujours `ErrorBody` : `{ error, code? }`.

## Contrôles

| Contrôle | Où |
|---|---|
| Chaque endpoint a son handler, chaque handler est au contrat, chaque URL `/api` du front est au contrat, `openapi.json` à jour | `apps/web/lib/contract/contract.test.ts` (vitest, CI) |
| Pas de changement cassant face à la branche de base | `.github/workflows/contract.yml` (oasdiff) |
| Une PR front (`front/*` ou label `front`) ne touche pas au châssis | `scripts/check-front-boundary.mjs` (CI) |
| Une réponse réelle s'écarte du contrat | le SDK le signale en dev (`onContractMismatch`) sans casser l'appel |

## SDK

```ts
import { createClient } from '@phantera/sdk'

const api = createClient({ stepUpFetch })
const { data } = await api.call('leads.list', { query: { workspaceId } })
await api.call('leads.updateStatus', { params: { leadId }, body: { status: 'qualified' } })
const csv = api.url('security.listAudit', { query: { format: 'csv' } })
```
