# 🎯 Phantera : Product & Architecture Blueprint 2026

> **But de ce document :** challenger le besoin, challenger l'architecture, et définir le produit
> le plus pertinent, performant et sécurisé pour le marché outbound 2026 : industrialisable en SaaS.
> Fondé sur une veille marché + technique (sources en bas de chaque section).
>
> **Auteur :** audit & veille : juin 2026. **Statut :** proposition (north star), à arbitrer.

---

## 0. TL;DR : la thèse en 6 points

1. **Le besoin réel n'est pas « envoyer plus d'emails »** : c'est **« décrocher plus de RDV sans cramer ses domaines »**. Le produit doit se vendre sur la **sécurité de délivrabilité**, pas sur le volume.
2. **Le moat 2026 = l'infrastructure de délivrabilité possédée** (réseau de warmup, IP dédiées, rotation multi-domaines/inbox) + un **SDR IA autonome déclenché par signaux**, facturé à l'usage/au résultat, sous **une seule facture**.
3. **L'architecture actuelle (cron synchrone Vercel) ne tient pas la charge.** Le passage obligé : **Inngest (jobs durables) + Upstash Redis (rate-limit/idempotence) + Neon Postgres + RLS**. Ces 3 changements transforment le stack en SaaS industrialisable.
4. **Les LLM doivent être routés par tâche ET testés en CI** : classification = modèle cheap/contraint, scoring = mid-tier calibré, copywriting = frontier. Harness d'éval (DeepEval en CI + golden datasets) obligatoire : un upgrade de modèle régresse silencieusement.
5. **L'UI doit devenir un instrument, pas une brochure.** ⌘K, optimistic UI, table type tableur (TanStack), skeletons, et **suppression des animations marketing GSAP/Framer** dans l'app. La différenciation = la vitesse opérateur (<100ms).
6. **Conformité EU = feature, pas afterthought.** Base légale intérêt légitime (Art. 6.1.f), LIA par campagne, provenance des données (Art. 14), opt-out one-click (RFC 8058) synchronisé sur une suppression globale. Les amendes 2025 (SOLOCAL 900k€) montrent que l'enforcement est réel.

---

## 1. Challenge du besoin : qu'est-ce qu'on vend vraiment ?

### Le besoin de surface vs le job-to-be-done

| Le client dit… | Mais le vrai job est… | Implication produit |
|---|---|---|
| « Je veux envoyer plus d'emails » | **« Décrocher des RDV sans détruire la réputation de mes domaines »** | Vendre la **sécurité de domaine** : warmup, IP dédiées, rotation, garde-fous bounce/spam. C'est le **#1 driver d'achat** post-règles Google/Yahoo 2024. |
| « Je veux plus de contacts » | **« Toucher la bonne personne au bon moment sans une armée de SDR »** | **Signal-based outbound** (job change, levée de fonds, recrutement, tech installs) + **personnalisation IA research-grade** (façon Clay) + **SDR IA autonome** remplaçant le siège SDR à ~500€/mois. |
| « Je veux un outil de séquences » | **« Une seule facture, un seul cockpit, pas un franken-stack de 5 outils »** | **Consolidation** : data -> infra d'envoi -> séquence -> réponse -> RDV sous un même toit. White-label pour les agences. |

### Conclusion stratégique

> Le wedge défendable en 2026 = **infrastructure de délivrabilité possédée + SDR IA déclenché par signaux**, facturé au résultat (RDV / contacts actifs), sous une facture prévisible.
> On ne compete pas sur « emails envoyés » mais sur **« RDV bookés sans cramer de domaine »**.

**Ce que Phantera fait déjà bien** (pipeline 5 agents source ->enrich ->score ->write ->reply) est une bonne fondation. **Ce qui manque pour être pertinent** : la couche délivrabilité (aujourd'hui quasi absente), les signaux d'intent, et l'industrialisation technique.

*Sources : teardowns Instantly / Smartlead / lemlist / Clay / Apollo / Salesforge / HeyReach / Outreach / Salesloft ; règles bulk Google+Yahoo fév. 2024 ; CNIL.*

---

## 2. Challenge de l'architecture : état actuel vs cible

### Diagnostic du stack actuel

| Composant actuel | Problème | Gravité |
|---|---|---|
| **Vercel Cron synchrone** (`process-sequences`) | Budget 60s, tout dans une invocation ; au-delà de ~100 campagnes actives -> défère silencieusement. Pas de retry durable, pas de backpressure. | 🔴 Bloquant scale |
| **Rate-limit in-memory** (`lib/security/rate-limit.ts`) | Per-instance -> inefficace en multi-région serverless ; spoofable via XFF. | 🟠 |
| **Quota qui ignore les PENDING** | TOCTOU -> dépassement en concurrence. | 🟠 |
| **Railway Postgres** | Pas serverless-natif (galère de connexions), pas de branching pour preview envs. | 🟠 |
| **Pas de délivrabilité** | Ni SPF/DKIM/DMARC preflight, ni warmup, ni caps/ramp, ni suppression globale, ni bounce auto-stop. | 🔴 Bloquant produit |
| **LLM non testés** | Aucun harness d'éval ; Haiku partout (alors que la doc dit Sonnet) ; prompts non versionnés. | 🟠 |

### Architecture cible 2026

```
┌────────────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router, Node runtime) · Vercel cdg1                │
│  proxy.ts (ex-middleware) : Clerk auth + rate-limit Edge léger      │
└───────────────┬────────────────────────────────────────────────────┘
                │ events
        ┌───────▼────────┐   durable steps, retries, throttle, sleep
        │    INNGEST     │───────────────────────────────────────────►  Resend / Gmail / Outlook / SMTP
        │ (jobs durables)│   step.run · step.sleepUntil · concurrency      (rotation multi-inbox)
        └───────┬────────┘
                │
   ┌────────────┼─────────────┬───────────────┬────────────────┐
   ▼            ▼             ▼               ▼                ▼
┌────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐ ┌─────────────┐
│ Neon PG│ │ Upstash  │ │  LLM      │ │ Deliverability│ │  Signals    │
│ + RLS  │ │ Redis    │ │  Router   │ │  Engine       │ │  (intent)   │
│(tenant)│ │(rl/idem) │ │(éval CI)  │ │(auth/warmup/  │ │ job change, │
└────────┘ └──────────┘ └───────────┘ │ caps/suppress)│ │ funding…    │
                                       └──────────────┘ └─────────────┘
```

### Décisions techniques (opinion + raison)

| Couche | Choix recommandé | Pourquoi | Migration |
|---|---|---|---|
| Jobs async | **Inngest** (primaire) ; Trigger.dev v3 en secours | Event-driven, step memoization, retries/throttle/sleep, zéro infra sur Vercel ; gère séquences drip & rate-limit ESP | **Priorité #2** : sortir le cron synchrone |
| DB | **Neon Postgres** + **RLS** (`SET LOCAL tenant_id`) | Serverless-natif, **branch-per-PR** (vraies preview envs), pooler PgBouncer, driver HTTP edge | **Priorité #3** : Railway -> Neon, RLS en defense-in-depth |
| Redis | **Upstash** | HTTP/connectionless -> rate-limit sliding-window + clés d'idempotence + locks distribués | **Priorité #1** (sûr, sans refonte) |
| ORM | **Prisma 7** (rester) ou **Drizzle** (si edge/RLS strict) | Prisma 7 a comblé l'écart (TS/WASM, ~9× cold start) ; Drizzle si bundle/edge critique | Optionnel, en dernier |
| Auth / Billing | **Clerk + Stripe** (garder) | Aucune raison de churner | : |
| Observabilité | **Sentry** (OTel) + **Better Stack** (uptime/logs) + **PostHog** | Instrumenter OTel une fois ; logs structurés `tenant_id`/`trace_id`/`job_run_id` | Sprint 1 |
| Secrets / IaC | **Infisical** (ou Doppler) + **Terraform** + GitHub Actions | Reproductible, self-hostable, injection CI (mandat « zéro touche secrets ») | Sprint 2 |
| Cache | Next 16 `use cache` (opt-in) ; `use cache: remote` sur Upstash, **clé par tenant** | Évite le bleed multi-tenant | Sprint 2 |

**Ordre de migration (risque croissant) :** Upstash -> Inngest -> Neon/RLS -> preview envs -> secrets/IaC -> observabilité -> cache -> (ORM optionnel).

> Verdict : on **garde Next 16 + Vercel + Clerk + Stripe**. Les 3 changements à fort levier = **Inngest + Upstash + Neon/RLS**. Ils transforment le stack synchrone en stack durable, multi-tenant, industrialisable.

*Sources : Inngest/Trigger.dev/Temporal (durable execution), Neon vs Supabase vs PlanetScale, RLS multi-tenant AWS, Upstash ratelimit, Next.js 16 release.*

---

## 3. Le moteur de délivrabilité (le cœur manquant)

C'est **le** chantier qui rend le produit pertinent. Spec des garde-fous à implémenter (par ordre d'impact) :

| # | Garde-fou | Règle dure |
|---|---|---|
| 1 | **Auth preflight (bloquant)** | Par domaine d'envoi : SPF, DKIM (signe live), DMARC (≥`p=none`, viser enforcement), PTR/rDNS, MX, TLS. **Refus d'envoyer si échec.** |
| 2 | **Opt-out one-click (RFC 8058)** | Headers `List-Unsubscribe` (mailto+https) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` ; traiter le POST **sous 2 jours (viser instantané)** + lien visible. |
| 3 | **Architecture domaines/inbox** | Domaines d'envoi dédiés (**jamais le primaire**) ; rotation **3-5 domaines × 4-6 inbox** ; DNS isolé par domaine. |
| 4 | **Caps + ramp** | Défaut **≤30-50 emails/inbox/jour** ; ramp imposé (5 ->10 ->20 ->30 sur 4 semaines) pour inbox neuve ; plafond agrégé par SDR. |
| 5 | **Throttle + jitter** | Délais randomisés, heures ouvrées/timezone du destinataire, étalé sur la journée, pas de burst. |
| 6 | **Sécurité contenu** | Plain-text first ; linter de spam-words ; ≤1 lien + alerte domaine de tracking ; ratio image/HTML ; **spintax limité aux salutations/CTA** (le full-body agressif fait throttler 18%). |
| 7 | **Suppression globale** | Cross-domaine/campagne ; auto-add sur hard bounce (1er échec), désabo, plainte ; dédupe pré-envoi. |
| 8 | **Auto-stop bounce/plainte** | Vérif liste pré-envoi ; **pause auto** si hard-bounce >~2% ou plaintes >0.1% sur fenêtre ; ingestion FBL. |
| 9 | **Monitoring réputation** | Google Postmaster (domain rep + spam <0.08%) ; seed tests (GlockApps/MailReach) ; RBL (Spamhaus/Barracuda) + alertes. |
| 10 | **Warmup** | Réseau de warmup réel, continu pendant l'envoi, métrique = **placement inbox** (pas juste delivered). |

*Sources : règles bulk Google/Yahoo (fév. 2024) & Microsoft (mai 2025), RFC 8058, Postmaster, MailReach/GlockApps, experts délivrabilité.*

---

## 4. Stratégie LLM : routing par tâche + tests obligatoires

### Routing recommandé

| Tâche | Modèle primaire | Fallback | Sortie |
|---|---|---|---|
| **Classification réponse** (POSITIVE/MEETING/NEGATIVE/NEUTRAL) | **Gemini Flash-Lite** / **GPT-5.x Nano** (~$0.10-0.20 in) | DeepSeek/Qwen self-host | **decoding contraint** -> 1 des 4 labels |
| **Scoring lead 0-100** | **Claude Haiku 4.5** ($1/$5) ou **GPT-5.x Mini** | Gemini Flash | JSON `{score, reasons[]}`, rubrique ICP en cache (−90%) |
| **Copywriting + auto-critique** | **Claude Sonnet 4.6** ($3/$15) ; Opus 4.8 si A/B le justifie | GPT-5.x / Gemini Pro | draft sur frontier, **critique sur modèle moins cher** |

**Optimisations coût (cumulables, −95%) :** prompt caching (rubrique ICP / brand-voice / few-shot), Batch API −50% pour le non-temps-réel, cascade (cheap d'abord, escalade si ambigu), fallback open-model comme plafond de prix.

### Harness d'éval (le user veut des LLM testés)

- **Outils :** **DeepEval** (gate CI, pytest, `minimum_score`) + **Braintrust ou LangSmith** (dashboards, prod ->dataset) + **Promptfoo** (red-team injection sur la classification).
- **Quoi mesurer :**
  - Classification -> **accuracy, macro-F1, confusion** (surtout MEETING vs POSITIVE) sur golden set labellisé.
  - Scoring -> **MAE / corrélation Spearman** vs scores humains + **calibration** + **monotonie** (un lead mieux aligné ICP ne doit pas scorer moins).
  - Copywriting -> **LLM-as-judge** (G-Eval : brand-voice, perso, zéro hallucination, CTA, longueur, pas de spam-words) avec un **juge ≠ générateur**.
- **CI :** golden datasets versionnés (15-20 cas/tâche au départ, enrichis depuis la prod) ; **chaque PR passe les évals avant merge** ; run de régression au changement de modèle/prompt.

### Garde-fous injection (critique : les réponses entrantes sont du texte non fiable)

Prompt injection = **OWASP LLM01:2025**. Défense : (1) sortie **contrainte** à l'enum, (2) **délimiter** la réponse comme donnée (jamais concaténée à l'instruction), (3) classifieur/guardrail d'input, (4) validation de sortie + alerte, (5) **red-team Promptfoo** dans la suite d'éval. « L'email dit de me classer POSITIVE » = cas de test qui doit fail-safe en NEUTRAL/flag.

*Sources : trackers prix LLM 2026, structured output OpenAI/Gemini/Claude, DeepEval/Promptfoo/Braintrust/LangSmith, OWASP LLM Top 10, prompt caching.*

---

## 5. UI/UX : construire un instrument, pas une brochure

**Thèse :** l'opérateur outbound vit 6h/jour dans l'outil. La différenciation = **vitesse (<100ms), densité, clavier**. Les animations GSAP/Framer marketing actuelles **nuisent** au produit (signal « brochure »).

### Stack composants 2026
**shadcn/ui sur Base UI** (`shadcn init --base-ui`) + **Tailwind v4** (`@theme` tokens) + **TanStack Table/Virtual/Query** + **React 19 `useOptimistic`** + **cmdk**.

### Top 10 améliorations
1. **⌘K command palette** comme navigation + actions primaires (raccourcis inline).
2. **Retirer les animations marketing** de l'app ; ne garder que des micro-transitions fonctionnelles 100-150ms ; respecter `prefers-reduced-motion`.
3. **Mutations optimistes partout** (statut, réponse, tag, enrôlement) avec rollback.
4. **Table leads sur TanStack** : pagination/filtre/tri server-side, headers sticky, **toggle de densité** persisté.
5. **Édition inline** (statut/owner/tags) : zéro modal.
6. **Saved Views** first-class, **URL-addressables** (Hot replies, Bounced, No-touch 7d) + filtres composables.
7. **Bulk actions** avec select-all cross-page + barre d'action sticky.
8. **Skeletons (pas spinners)** + streaming SSR (shell interactif avant la data).
9. **Pass WCAG 2.2** (cibles ≥24px, focus non masqué, alternative non-drag, auth paste-friendly, focus rings).
10. **Onboarding orienté activation** : auto-config domaine (SPF/DKIM/DMARC), checklist deep-linkée « jusqu'au 1er envoi », warmup + garde-fous **on par défaut**.

*Sources : Linear/Attio/Clay/Resend UX, shadcn vs Base UI vs Radix 2026, TanStack, React 19 useOptimistic, WCAG 2.2 (ISO/IEC 40500:2025).*

---

## 6. Sécurité : corriger les écarts doc↔code d'abord

La doc SECURITY.md décrit une posture A ; le code ne la tient pas encore. Actions :

1. **Merger la PR #1** (fixes d'audit) : rend vraies les affirmations « IDOR clean / quota enforced / tests passants ».
2. **Supprimer `/api/debug/*`** : la doc dit « deleted entirely » mais 3 routes vivent ; `workspace-check` **fuite un préfixe de `RESEND_API_KEY`** à tout user connecté.
3. **Consolider les headers** (`vercel.json` SAMEORIGIN vs `next.config.js` DENY -> garder next.config).
4. **Secret cron/inbound en constant-time** (fait dans PR #1).
5. **Conformité EU bloquante** : LIA par campagne, provenance données (Art. 14), suppression globale, retention ~3 ans, mode CAN-SPAM US.

*Sources : OWASP Top 10 2021, CNIL (SOLOCAL 900k€/CALOGA 80k€ 2025), audit interne.*

---

## 7. Plan d'industrialisation réaliste

> **Honnêteté :** un produit benchmarké/sécurisé/industrialisé ne se reconstruit pas en une nuit.
> Le chemin réaliste = **durcir l'existant (déjà en prod) aujourd'hui**, puis industrialiser par sprints.

### 🚀 Aujourd'hui (shippable en prod ce matin : zéro régression)
- Merger **PR #1** (sécurité + quota + tests).
- **Supprimer `/api/debug/*`** + consolider headers.
- **Garde-fous délivrabilité v1** : auth preflight bloquant à l'onboarding + suppression globale + caps/jitter par inbox (la partie qui protège les domaines des clients **dès le 1er envoi**).
- Corriger le nom du modèle dans docs+marketing (cohérence Sonnet/Haiku, pas « GPT-4o »).

### Sprint 1 (semaine 1-2)
- **Upstash** (rate-limit sliding-window + idempotence sur chaque envoi/webhook).
- **Inngest** : migrer le cron synchrone -> steps durables (throttle ESP, sleep entre étapes).
- **Harness LLM** : DeepEval + golden datasets + gate CI sur les 3 tâches.

### Sprint 2 (semaine 3-4)
- **Neon + RLS** (defense-in-depth), preview env branch-per-PR.
- **Refonte table leads** (TanStack) + ⌘K + optimistic UI ; retrait animations marketing app.
- Observabilité OTel/Sentry/PostHog + uptime.

### Sprint 3+
- **Signaux d'intent** (job change, funding, hiring) + déclencheurs.
- **SDR IA autonome** packagé (facturation à l'usage/contact actif).
- Warmup réseau + IP dédiées (moat délivrabilité).
- Secrets Infisical + Terraform (mandat « zéro touche »).
- Multi-users (invitations : modèle `WorkspaceMember` déjà présent), A/B testing, intégrations CRM (combler les promesses pricing).

---

## 8. Décisions à arbitrer (par le founder)

- **Délivrabilité : louer ou posséder ?** Warmup tiers (rapide) vs réseau possédé + IP dédiées (moat, plus long). Reco : tiers v1, possédé en moat.
- **Budget outils** : Inngest / Neon / Upstash / Braintrust ont des tiers gratuits suffisants pour démarrer ; valider avant de monter en charge.
- **Positionnement pricing** : flat-unlimited-inbox (Instantly/Smartlead) vs usage/résultat (RDV/contact actif). Reco : usage/résultat aligné sur le SDR IA.
- **Modèle copywriting** : Sonnet 4.6 par défaut ; Opus 4.8 seulement si l'A/B le justifie.

---

**Prochaine étape proposée :** exécuter le bloc « Aujourd'hui » (merge PR #1 + suppression debug + garde-fous délivrabilité v1) et préparer les PR Sprint 1 (Upstash, Inngest, harness LLM).
