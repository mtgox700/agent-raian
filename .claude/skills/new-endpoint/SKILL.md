---
name: new-endpoint
description: Add or change an API endpoint of the chassis contract-first - contract, handler, SDK, tests. Use for any new route under apps/api/app/api or any change to what an endpoint accepts or returns.
---

# New endpoint (contract first)

The contract (`packages/contract`) is the only thing a front relies on. Order matters.

1. **Contract.** In `packages/contract/src/endpoints/<domain>.ts`, add an `endpoint({...})`:
   `id` (`domain.action`), `method`, `path` (Next style, `[param]`), `summary`, `auth`
   (`session` | `stepUp` | `public`), zod `params` / `query` / `body`, the exact 2xx
   `response`, `responseKind` when not JSON. Shared shapes go in `src/schemas/`.
   A new domain file must be added to `src/index.ts` (array and `EndpointMap`).
2. **Handler.** `apps/api/app/api/<path>/route.ts`: session via `auth()`, then
   `requireAccess(userId, '<permission>')` (or a guarded public surface declared in
   `apps/api/lib/auth/public-surfaces.ts`). Validate with the same zod rules. Business logic
   lives in `apps/api/lib/`, not in the route. Errors: `{ error, code? }` with a real status.
3. **Generate.** `npm run openapi` (commit `packages/contract/openapi.json`).
4. **Front.** Call it with `@phantera/sdk`: `api.call('<id>', { params, query, body })`, or
   `loadView` on the server. Never `fetch('/api/...')` by hand, never import `@/lib/db`.
5. **Check.** `cd apps/api && npx vitest run lib/contract` (implemented, complete, front URLs
   covered, openapi fresh). For a GET: the DB test proves the real answer matches:
   `CONTRACT_DB_URL=postgresql://…/contract_test npx vitest run lib/contract/contract.db.test.ts`.

## Breaking changes

Removing a field, changing a type or adding a required input breaks the fronts. CI
(`contract.yml`, oasdiff) blocks it unless the PR carries the `api-breaking` label: prefer an
additive change, or a new endpoint version.
