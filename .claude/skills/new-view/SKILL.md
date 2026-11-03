---
name: new-view
description: Give a front page its data through a view endpoint (GET /api/views/<page>) instead of reading the database. Use when creating a page that shows server data, or when a page still imports the database, repositories or services.
---

# New view (page data through the API)

A page of a body never reads the database: it asks the chassis for exactly what it renders.

1. `apps/api/lib/views/<name>.ts`: a function `(db, access, input) => data` returning
   JSON-safe data (ISO strings, no `Date`, no Prisma objects). Redirect decisions are data:
   `{ state: 'redirect', to }` or `{ redirectTo }`.
2. `apps/api/app/api/views/<name>/route.ts`: `auth()`, `requireAccess`, call the view.
3. `packages/contract/src/endpoints/views/<name>.ts`: `views.<name>` with the exact zod
   response, exported and listed in `endpoints/views/index.ts`; then `npm run openapi`.
4. The page: `const data = await loadView('views.<name>', { params, query })` from
   `@/lib/front/server-api` (a 401 already redirects to sign-in), then render; apply the
   returned redirect with `redirect()` / `notFound()`.
5. Check: `npx tsc --noEmit` in the front, `npx vitest run lib/contract` in `apps/api`, the DB
   contract test for the real answer. ESLint fails a page that imports data modules.
