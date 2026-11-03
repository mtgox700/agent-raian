# Déploiement de Phantera (Vercel + Postgres)

Vérifié le 2026-11-03 sur une base Postgres 16 neuve : install, `tsc`, 1 118 tests, build de production,
`/api/health` et les trois routes `/api/cron/*` (200 avec le bon `CRON_SECRET`, 401 sinon).

## 1. Base de données (une seule fois)

L'historique des migrations ne sait pas créer une base vide (une migration ancienne vise une table créée
par la baseline suivante). Sur une base **vide**, lancer d'abord :

```bash
cd apps/api
DATABASE_URL=postgresql://… DIRECT_URL=postgresql://… npm run db:bootstrap
```

Le script crée le schéma et marque les migrations comme appliquées ; chaque build ne joue ensuite que les
nouvelles migrations.

## 2. Deux projets Vercel : châssis et carrosserie

Le dépôt contient deux applications déployées séparément (docs/ROADMAP_HEADLESS.md, phase 5) :

| Projet | Root Directory | Rôle | Variables |
|---|---|---|---|
| **api** | `apps/api` | Routes `/api/*`, base, Inngest, webhooks. Aucune page. | tout `apps/api/env.local.template` (`bash scripts/vercel-env-setup.sh api`) |
| **front** | `apps/front` | Pages et composants. Relaie `/api/*` vers `API_URL` (même origine : cookies Clerk, pas de CORS). | `API_URL`, clés Clerk, `NEXT_PUBLIC_*` (`API_URL=… bash scripts/vercel-env-setup.sh front`) |

- Déployer **api** d'abord, puis renseigner son URL dans `API_URL` du projet **front**. Le domaine public
  pointe sur **front** ; les webhooks peuvent viser le domaine public (relayés) ou l'URL de l'API.
- Chaque projet a son `vercel.json` (région `cdg1`, install à la racine du monorepo).
- `DATABASE_URL` et `DIRECT_URL` (projet **api**) en **production seulement**. Le build lance les
  migrations, sauf sur les previews (`scripts/migrate-on-deploy.mjs`) ; mettre `MIGRATE_ON_PREVIEW=1` si
  les previews ont leur propre base.
- Une autre marque = un autre projet **front** (même Root Directory, `NEXT_PUBLIC_BRAND=<clé>`), branché
  sur le même **api**.

## 3. Planification : Inngest

Les tâches récurrentes (séquences, relève des boîtes mail, housekeeping, insights) tournent sur
**Inngest** (aucun cron Vercel n'est déclaré) : connecter l'intégration Vercel d'Inngest et poser `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
Sans Inngest, aucune séquence ne part. Les routes `/api/cron/*` restent un déclenchement de secours
(appel manuel ou cron externe avec `Authorization: Bearer $CRON_SECRET`).

## 4. Après le premier déploiement

1. `GET /api/health` → `{"ok":true}`.
2. Déclarer les webhooks et poser leurs secrets : Clerk `/api/webhooks/clerk`, Stripe
   `/api/webhooks/stripe`, Resend `/api/webhooks/resend`, Unipile `/api/webhooks/unipile`, worker
   Cloudflare `/api/webhooks/inbound-email`.
3. Redéployer pour prendre en compte les secrets ajoutés.
