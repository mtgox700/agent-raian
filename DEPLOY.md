# Déploiement de Phantera (Vercel + Postgres)

Vérifié le 2026-11-03 sur une base Postgres 16 neuve : install, `tsc`, 1 118 tests, build de production,
`/api/health` et les trois routes `/api/cron/*` (200 avec le bon `CRON_SECRET`, 401 sinon).

## 1. Base de données (une seule fois)

L'historique des migrations ne sait pas créer une base vide (une migration ancienne vise une table créée
par la baseline suivante). Sur une base **vide**, lancer d'abord :

```bash
cd apps/web
DATABASE_URL=postgresql://… DIRECT_URL=postgresql://… npm run db:bootstrap
```

Le script crée le schéma et marque les migrations comme appliquées ; chaque build ne joue ensuite que les
nouvelles migrations.

## 2. Projet Vercel

- Importer le dépôt, **Root Directory = racine du dépôt** (c'est le `vercel.json` racine qui est lu ;
  région `cdg1`).
- Variables : `bash scripts/vercel-env-setup.sh` après `vercel link`, ou à la main depuis
  `apps/web/env.local.template`. Minimum pour démarrer : `DATABASE_URL`, `DIRECT_URL`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ENCRYPTION_KEY` (`openssl rand -hex 32`),
  `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`.
- `DATABASE_URL` et `DIRECT_URL` en **production seulement**. Le build lance les migrations, sauf sur les
  previews (`scripts/migrate-on-deploy.mjs`) ; mettre `MIGRATE_ON_PREVIEW=1` si les previews ont leur
  propre base.

## 3. Planification : Inngest

Les tâches récurrentes (séquences, relève des boîtes mail, housekeeping, insights) tournent sur
**Inngest** : connecter l'intégration Vercel d'Inngest et poser `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
Sans Inngest, aucune séquence ne part. Les routes `/api/cron/*` restent un déclenchement de secours
(appel manuel ou cron externe avec `Authorization: Bearer $CRON_SECRET`).

## 4. Après le premier déploiement

1. `GET /api/health` → `{"ok":true}`.
2. Déclarer les webhooks et poser leurs secrets : Clerk `/api/webhooks/clerk`, Stripe
   `/api/webhooks/stripe`, Resend `/api/webhooks/resend`, Unipile `/api/webhooks/unipile`, worker
   Cloudflare `/api/webhooks/inbound-email`.
3. Redéployer pour prendre en compte les secrets ajoutés.
