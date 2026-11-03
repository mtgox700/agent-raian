# 🔍 Audit complet PhanteraTN : Rapport

> Audit réalisé sur `apps/api` (Next.js 16 + Prisma + Clerk + Stripe + Resend).
> Méthode : type-check, lint, tests, build + revue manuelle des chemins critiques
> (auth, webhooks, quotas, pipeline IA, séquences email). 27 fichiers modifiés.

## État de départ

| Contrôle | Avant | Après |
|----------|-------|-------|
| `tsc --noEmit` | ✅ (après `prisma generate`) | ✅ |
| `eslint` | 0 erreur / 21 warnings | ✅ 0 / 0 |
| `vitest` | **2 suites plantent** (`jest is not defined`) | ✅ **61/61** |
| `next build` | compile | compile |

---

## Bugs corrigés

### 🔴 CRITIQUE : Le quota d'envoi était contourné sur les relances
**Fichiers :** `lib/sequences/process-campaign.ts`, `lib/sequences/send-step.ts`

Seule l'étape 1 (route `launch`) vérifiait `checkEmailSendQuota`. Les étapes 2+ envoyées
par le cron `process-sequences` (`processCampaign` -> `sendStepToLead`) ne vérifiaient **jamais**
le quota. Une séquence à 5 étapes envoyée à 100 leads sur un plan FREE (limite 100/mois)
pouvait envoyer jusqu'à **500 emails**.

**Fix :** enforcement du quota dans `processCampaign` : la run est cappée au quota restant ;
les leads restants restent dus et sont repris une fois le quota renouvelé.

### 🟠 ÉLEVÉ : Désabonnement = sabotage cross-tenant (IDOR anonyme)
**Fichier :** `app/api/webhooks/unsubscribe/route.ts`

`GET`/`POST /api/webhooks/unsubscribe?email=…` exécutait
`db.lead.updateMany({ where: { email } })` **sans authentification, sur tous les workspaces**.
N'importe quel anonyme pouvait passer en `doNotContact` (et `status: 'lost'`) n'importe quelle
adresse : voire la liste entière d'un concurrent par énumération. Aucune signature, aucun rate limit.

**Fix :** désabonnement scoppé **uniquement au `sid`** (id `EmailSend` non devinable, présent dans
chaque lien sortant et dans l'en-tête `List-Unsubscribe`). Le paramètre `email` brut n'est plus honoré.

### 🟠 ÉLEVÉ : Secret webhook inbound comparé en non-constant-time
**Fichier :** `app/api/webhooks/inbound-email/route.ts`

`secret !== process.env.INBOUND_WEBHOOK_SECRET` court-circuite au premier octet différent ->
fuite de longueur/préfixe par timing.

**Fix :** comparaison constant-time via le nouveau helper `safeCompare()` (`timingSafeEqual`).

### 🟠 ÉLEVÉ : Les campagnes ne se terminaient jamais
**Fichier :** `lib/sequences/process-campaign.ts`

La détection de complétion était gardée derrière `if (result.sent > 0)`. Conséquence :
les campagnes mono-étape (jamais de « next step » à envoyer) et celles dont les derniers
envois étaient *skippés* (DNC) restaient `ACTIVE` à vie, reclaimées par le cron à chaque run.

**Fix :** complétion évaluée à **chaque** run dès qu'aucun lead n'est plus dû (maintenant ou
dans le futur), en conservant la garde « au moins un step 1 réellement envoyé » (anti
faux-positif sur les campagnes 100 % en échec). Si la run a été throttlée par le quota,
les leads non envoyés restent dus -> la campagne reste correctement `ACTIVE`.

### 🟡 MOYEN : Secret cron comparé en non-constant-time (×3)
**Fichiers :** `app/api/cron/{daily-digest,poll-inboxes,process-sequences}/route.ts`

Même classe de fuite par timing sur `CRON_SECRET`. **Fix :** `safeCompare()`.

### 🟡 MOYEN : Taux d'ouverture sous-compté dans le funnel
**Fichier :** `lib/repositories/campaigns.repository.ts`

« Ouverts » comptait `status === 'OPENED'` seul -> un email `CLICKED` (donc nécessairement
ouvert) était exclu. **Fix :** `status IN ['OPENED','CLICKED']`.

### 🟡 MOYEN : Erreurs d'upsert masquées en « doublons »
**Fichiers :** `app/api/leads/search/route.ts`, `app/api/leads/search/stream/route.ts`

`catch { duplicateCount++ }` avalait **toute** erreur DB et la comptait comme doublon ->
pertes de leads silencieuses et invisibles. **Fix :** distinction du vrai doublon
(`P2002`) vs erreur réelle, qui est désormais loggée avec contexte (workspaceId, apolloId, email).

### 🧪 Tests cassés réparés (Jest -> Vitest)
**Fichiers :** `lib/email/sender-router.test.ts`, `app/api/cron/poll-inboxes/idempotency.test.ts`

Les deux suites utilisaient l'API `jest.*` sous Vitest -> `jest is not defined`, suites
non chargées. Converties en `vi.*` avec imports/typages corrects.

### 🧹 Qualité
- 20 warnings lint nettoyés (imports/variables morts) sur 16 fichiers.
- Dernier `any` (`PhilosophySection.tsx`) typé proprement.
- Nouveau helper réutilisable `safeCompare()` dans `lib/security/crypto.ts`.

---

## Confirmés sûrs (revus, aucun problème : pas de faux positifs)

- **Webhooks Clerk / Stripe / Resend** : signatures (svix / HMAC raw-body) vérifiées avant parsing, fail-closed.
- **`lib/security/crypto.ts`** : AES-256-GCM correct (IV aléatoire 12 o, auth tag vérifié, clé validée).
- **`resolve-workspace.ts`** + routes leads/campaigns échantillonnées : auth + ownership workspace
  systématiques, pas d'IDOR (les `update`/`updateMany` sont scoppés par `workspaceId`).
- **`scoreToBadge`** : seuils (≥80 / ≥50 / ≥25 / SKIP) cohérents.
- **Idempotence des envois** (`sendStepToLead`) et **claim atomique** des campagnes (`updateMany` + `lastProcessedAt`) : corrects.

---

## Pistes restantes (non bloquantes, hors périmètre « bug »)

- **Rate limit IP spoofable** (`lib/security/rate-limit.ts`) : `x-forwarded-for` est lu tel quel ;
  acceptable derrière l'edge Vercel (qui réécrit l'en-tête), mais à migrer vers Upstash Redis
  pour une vraie protection multi-instances (déjà noté en TODO dans le fichier).
- **Quota TOCTOU** : le décompte exclut les `PENDING`, donc deux lancements concurrents peuvent
  chacun passer la grille. Atténué par le cap par run ; un claim atomique de quota serait l'étape suivante.
- **`quotaRemaining`** (route `search`) légèrement sous-estimé (compte les upserts qui ne créent rien) : cosmétique.

---

## Vérification finale

```
tsc --noEmit   → exit 0
eslint .       → 0 erreur, 0 warning
vitest run     → 61/61 (stable sur 3 runs)
next build     → Compiled successfully
```
