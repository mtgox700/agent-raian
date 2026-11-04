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
- [x] Les 3 server actions sont au contrat (phase 2) ; preuve d'exécution : 39 endpoints GET appelés sur une vraie base
  Postgres répondent conformément au contrat (`apps/api/lib/contract/contract.db.test.ts`, opt-in `CONTRACT_DB_URL`)
- [ ] Reste : 3 formes encore `z.unknown()` (`TODO(contract)`), faute de forme déclarée dans le back (JSON libres)

**Terminé quand** : le SDK couvre 100 % des appels du front actuel et la CI bloque toute dérive.

## Phase 2 : Débrancher le front de la base (2 à 3 semaines)

But : plus aucun accès direct front → base.

**Fait** (2026-11-03).

- [x] 12 endpoints de vue `GET /api/views/*` : chaque page ou layout reçoit exactement ce qu'il affiche
- [x] Les 3 server actions deviennent des routes (`lib/actions/`), appelées via le SDK ; plus aucun `'use server'`
- [x] Pages = `loadView()` + rendu ; les redirections deviennent des données renvoyées par la vue
- [x] Règle ESLint : base, accès, repositories, services, vues et actions interdits côté front (types autorisés)

**Terminé quand** : la règle ESLint passe, les tests restent verts, aucun écran n'a changé visuellement.

## Phase 3 : Peinture (charte graphique) en données (2 semaines)

But : changer de couleurs, typos, logo sans toucher au code.

**Fait** (2026-11-03) : 148 déclarations par marque identiques avant/après (CSS compilées comparées).

- [x] `packages/themes/themes/<marque>.json` : toutes les variables CSS (site et dashboard), palette hex, palette Clerk
- [x] Compilation en `themes.generated.css` (générateur maison, sans dépendance) ; plus aucune couleur de marque dans `globals.css`
- [x] **Décision** : une marque par déploiement (`NEXT_PUBLIC_BRAND`), pas de résolution par requête : elle rendrait
  toutes les pages dynamiques et coûterait le budget Lighthouse de la landing statique. Les domaines sont déclarés dans le thème.
- [x] Widgets Clerk et page d'erreur sur le thème ; restent en dur : les logos (actifs de marque) et des ombres neutres

**Terminé quand** : une marque de démonstration change entièrement de couleurs et de logo par un seul fichier JSON.

## Phase 4 : Habillage (textes et médias) en contenu (2 semaines)

But : textes et images éditables sans développeur.

**Fait pour l'identité et la landing** (2026-11-03) : HTML de la landing identique à l'octet pour les 2 marques.

- [ ] Choix du CMS headless (décision founder) : la couche `ContentSource` est prête, un adaptateur CMS la remplace
  sans toucher aux composants ; aujourd'hui la source est un fichier JSON par document (modifier = commit + déploiement)
- [x] Modèle de contenu zod + JSON Schema : `identity`, `navigation`, `landing`, `faq` (+ `auth` pour la carrosserie n°2)
- [ ] Reste à modéliser : blog, pages légales, e-mails transactionnels
- [x] Textes de la landing et identité de marque sortis du code
- [ ] Textes du dashboard (~126 composants) en clés i18n : non fait, à mener avec la carrosserie n°2
- [ ] Revalidation à la publication : dépend du CMS choisi

**Terminé quand** : un rédacteur modifie la landing et un libellé du dashboard depuis le CMS, en ligne sans déploiement.

## Phase 5 : Séparer châssis et carrosserie (2 semaines)

But : deux déployables indépendants.

**Fait** (2026-11-03) : 1 137 tests (même total qu'avant), 2 builds, les 2 apps vérifiées ensemble.

- [x] Monorepo : `apps/api` (châssis), `apps/front` (carrosserie n°1), `packages/{contract,sdk,themes,content}`
- [x] Modules partagés : le front résout `@/lib/*` dans son propre `lib/` puis dans celui du châssis (modules purs :
  marque, types, formats) ; ESLint l'empêche d'atteindre les données. Un `packages/core` séparé reste possible plus tard.
- [x] Même origine : le front relaie `/api/*` vers `API_URL` (rewrite) → cookies Clerk partagés, aucun CORS
- [x] Un `vercel.json` par app ; CI en 2 jobs ; `DEPLOY.md` décrit les 2 projets (mise en ligne : à la fin)

**Terminé quand** : on redéploie le front sans redéployer le back, et inversement.

## Phase 6 : Carrosserie n°2, la refonte (4 à 6 semaines)

But : le nouveau front, construit sur le châssis sans le toucher.

**Construite** (2026-11-03), pas encore en ligne : `apps/front-v2`, 15 écrans, builds verts pour les 2 marques.

- [x] Direction visuelle Katana Forge « Arrêt net » : `apps/front-v2/DESIGN.md` (principes, tokens, mouvement, budgets)
- [x] `apps/front-v2` sur le même châssis, SDK, thèmes et contenus ; aucun commit dans `apps/api` pour la refonte
  (seul ajustement de contrat : `analyst.ask` accepte `conversationId: null`, comme le back le faisait déjà)
- [x] Landing, connexion, inscription, onboarding, invitation, et tout le dashboard : accueil, leads, leads chauds,
  à envoyer, campagnes (liste, assistant, détail), boîte de réception, analytics, analyste, historique, réglages, facturation
- [x] Pages publiques portées : à propos, pilote, confidentialité, CGU, blog (articles, thèmes, RSS), alternatives,
  404, page d'erreur, robots, sitemap, manifest, llms.txt, images de partage (2026-11-04)
- [x] PostHog, bandeau de consentement (rien avant accord) et événements produit de la v1 ; composants dupliqués fusionnés
- [ ] Textes du dashboard v2 dans `lib/copy/*` (repris mot pour mot de la v1), pas encore en documents de contenu
- [ ] Budgets Lighthouse **non mesurés** : le navigateur du conteneur ne joint pas localhost. Landing vue en rendu hors
  ligne (`scripts/render-static.cjs`) pour les 2 marques ; écrans connectés jamais vus avec une vraie session Clerk
- [ ] Bascule de domaine et retrait de la v1 : à la mise en production (décision founder après revue visuelle)

**Terminé quand** : le nouveau front est en production et le back n'a reçu aucun commit de la refonte.

## Phase 7 : Usine à carrosseries (continu)

**Fait** (2026-11-03).

- [x] `npm run brand:new <clé> "<Nom>" <domaine>` (testé de bout en bout) + skill `.claude/skills/new-brand` ; registres
  générés depuis les données (`npm run brands:sync`)
- [x] Skills `new-endpoint` (contrat d'abord) et `new-view` (données de page par l'API)
- [x] Régression visuelle par marque sans navigateur : HTML de la landing figé par marque (`apps/front/lib/visual`)
- [x] `npm run bodies` : châssis, carrosseries et marques d'un coup d'œil

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
