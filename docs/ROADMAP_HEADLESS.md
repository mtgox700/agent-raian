# Roadmap : châssis et carrosseries (Phantera headless)

> Objectif : un **châssis** (back) unique et stable, sur lequel on boulonne des **carrosseries** (fronts)
> interchangeables : charte graphique, textes et mise en page changent sans toucher au back.
> Rédigée le 2026-11-03, à partir de l'état du code sur `main` (commit `7ae61a9`).

## Point de départ

| Élément | État | Conséquence |
|---|---|---|
| API `app/api/**` | 93 routes, auth Clerk, garde d'accès inventoriée (`lib/auth/public-surfaces.ts`) | Le châssis existe déjà à ~90 % |
| Pages qui lisent la base | 19 `.tsx` importent `@/lib/db`, `auth` ou `access` | Couplage direct front → base à retirer |
| Server actions | 3 fichiers `'use server'` | Logique métier appelée hors API |
| Marque | `data-brand="phantera"`, `components/brand/` | Amorce de thème à généraliser |
| Textes | En dur dans les composants | À sortir dans du contenu |
| Qualité | `tsc` 0, 1 118 tests, CI GitHub | Filet de sécurité pour refactorer |

## Règles qui ne bougent pas

1. Le front ne parle au back **que** par le contrat d'API (SDK généré) : jamais de `@/lib/db` côté front.
2. Toute évolution d'API commence par le contrat ; un changement cassant = nouvelle version.
3. Un skin est de la **donnée** (tokens, contenu, config) tant que possible ; du code seulement si l'ergonomie change.
4. Aucune carrosserie n'importe une autre carrosserie.
5. Chaque phase se livre en PR petites, CI verte, preview Vercel, sans interruption de service.

---

## Phase 0 : Châssis opérationnel (1 semaine)

But : une base saine avant de démonter quoi que ce soit. **Local fait** (2026-11-03) : `bash scripts/dev-setup.sh`
(Postgres via `docker-compose.yml` ou `DATABASE_URL`, `.env.local` généré, bootstrap ou migrations, idempotent) ;
dev server vérifié (`/` 200, `/api/health` 200, `/dashboard` → connexion, API protégée 401), build de production OK.
La mise en production est reportée à la fin, comme décidé.

- [x] Environnement local reproductible (`scripts/dev-setup.sh`)
- [ ] Base Postgres prod (Neon UE) + `npm run db:bootstrap`
- [ ] Projet Vercel, variables (`scripts/vercel-env-setup.sh`), intégration Inngest
- [ ] Webhooks Clerk, Stripe, Resend, Unipile, inbound-email
- [ ] Base séparée pour les previews (branche Neon)

**Terminé quand** : `/api/health` répond en prod, une séquence de test part via Inngest.

## Phase 1 : Figer les points de fixation (2 semaines)

But : rendre le contrat explicite et contrôlé.

**Fait** (2026-11-03) : 86 opérations sur 71 chemins, toutes les routes non-infrastructure couvertes.

- [x] Inventaire de ce que le front consomme (test : toute URL `/api` du front doit être au contrat)
- [x] `packages/contract` (zod, source de vérité) → `openapi.json` (OpenAPI 3.1 généré)
- [x] `packages/sdk` : client typé dérivé du contrat, validation des entrées, contrôle des réponses en dev
- [x] CI : `openapi.json` à jour + changements cassants (`oasdiff`, label `api-breaking` pour assumer)
- [x] Garde : une PR front (`front/*` ou label `front`) qui touche `app/api`, `lib/`, `prisma/` ou le contrat échoue
- [ ] Reste : 3 formes encore `z.unknown()` (`TODO(contract)`) ; les 3 server actions entrent au contrat en phase 2

**Terminé quand** : le SDK couvre 100 % des appels du front actuel et la CI bloque toute dérive.

## Phase 2 : Débrancher le front de la base (2 à 3 semaines)

But : plus aucun accès direct front → base.

- [ ] Créer les routes `/api` manquantes pour les données lues par les 19 pages
- [ ] Exposer les 3 server actions en routes `/api` (la logique reste dans `lib/`)
- [ ] Pages = fichier mince (chargement via SDK) + composant de vue à props pures
- [ ] Règle ESLint : `@/lib/db`, `@/lib/access` interdits dans `app/(dashboard)`, `app/(auth)`, `components/`

**Terminé quand** : la règle ESLint passe, les tests restent verts, aucun écran n'a changé visuellement.

## Phase 3 : Peinture (charte graphique) en données (2 semaines)

But : changer de couleurs, typos, logo sans toucher au code.

- [ ] `packages/themes/<marque>.json` : couleurs, typographies, rayons, ombres, motion, logo
- [ ] Génération en variables CSS (Style Dictionary) ; Tailwind ne lit plus que ces variables
- [ ] Résolution de la marque par domaine (ou en-tête), côté middleware
- [ ] Composants `components/ui` sans aucune couleur en dur

**Terminé quand** : une marque de démonstration change entièrement de couleurs et de logo par un seul fichier JSON.

## Phase 4 : Habillage (textes et médias) en contenu (2 semaines)

But : textes et images éditables sans développeur.

- [ ] Choix du CMS headless (recommandé : Payload, auto-hébergeable en TypeScript ; alternatives Strapi, Sanity)
- [ ] Modèle de contenu : pages marketing, blog, textes d'interface, e-mails transactionnels, par marque et par langue
- [ ] Migration des textes en dur ; textes d'interface en clés i18n
- [ ] Revalidation à la publication (ISR / webhook du CMS)

**Terminé quand** : un rédacteur modifie la landing et un libellé du dashboard depuis le CMS, en ligne sans déploiement.

## Phase 5 : Séparer châssis et carrosserie (2 semaines)

But : deux déployables indépendants.

- [ ] Monorepo : `apps/api` (châssis), `apps/front-phantera` (carrosserie n°1), `packages/{contract,sdk,core,ui,themes,config}`
- [ ] `packages/core` : logique front partagée sans UI (hooks, état, validation)
- [ ] Auth Clerk partagée entre domaines ; CORS et cookies configurés
- [ ] Deux projets Vercel ; le front pointe sur l'URL de l'API

**Terminé quand** : on redéploie le front sans redéployer le back, et inversement.

## Phase 6 : Carrosserie n°2, la refonte (4 à 6 semaines)

But : le nouveau front, construit sur le châssis sans le toucher.

- [ ] Direction visuelle et storyboard (Katana Forge : `/forge`)
- [ ] `apps/front-v2` sur le même SDK, les mêmes thèmes, le même CMS
- [ ] Écran par écran : landing → auth → dashboard (leads, campagnes, inbox, analytics, réglages, analyst, historique, à envoyer)
- [ ] Budgets : Lighthouse ≥ 95 performance, 100 accessibilité ; tests visuels par carrosserie
- [ ] Bascule de domaine quand tous les écrans sont prêts ; retrait de l'ancien front

**Terminé quand** : le nouveau front est en production et le back n'a reçu aucun commit de la refonte.

## Phase 7 : Usine à carrosseries (continu)

- [ ] Gabarit `templates/new-skin` + skill Claude `new-skin` (thème + espace CMS + domaine en une commande)
- [ ] Skill `new-endpoint` : contrat → SDK → implémentation → tests
- [ ] Régression visuelle par marque en CI, tableau de bord des carrosseries déployées

**Terminé quand** : une nouvelle marque est en ligne en moins d'une journée.

---

## Calendrier indicatif

| Phase | Durée | Cumul |
|---|---|---|
| 0. Mise en production | 1 sem. | S1 |
| 1. Contrat + SDK | 2 sem. | S3 |
| 2. Front débranché de la base | 2-3 sem. | S6 |
| 3. Thèmes | 2 sem. | S8 |
| 4. CMS | 2 sem. | S10 (parallélisable avec 3) |
| 5. Séparation physique | 2 sem. | S12 |
| 6. Refonte | 4-6 sem. | S18 |
| 7. Usine | continu | |

Les phases 3 et 4 sont indépendantes : en parallèle, la refonte peut démarrer vers S10.

## Décisions à prendre (founder)

1. CMS : Payload (auto-hébergé) ou SaaS (Sanity) ?
2. Données des marques : base partagée avec `brand_id` ou base par marque ?
3. Une seule langue (FR) au départ, ou FR + EN dès la phase 4 ?
4. Périmètre de la refonte : landing seule, dashboard seul, ou les deux ?
