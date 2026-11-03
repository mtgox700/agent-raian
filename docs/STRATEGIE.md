# 🧭 Phantera : Stratégie produit & technique (2026)

> Synthèse décisionnelle des 8 veilles. Une seule thèse, déclinée en stratégie
> **fonctionnelle** et **technique alignées par phases**, avec jalons et KPI.
> Réfs : [BLUEPRINT](./PRODUCT_BLUEPRINT_2026.md) · [DATA/SIGNAUX/INFRA](./VEILLE_DATA_SIGNALS_INFRA.md) · [SDR/PRICING/MULTICANAL](./VEILLE_SDR_PRICING_MULTICANAL.md)

---

## 0. La thèse en une phrase

> **« Décrocher des RDV sans cramer ses domaines »** : un SDR IA sûr, déclenché par signaux,
> assis sur une infrastructure de délivrabilité possédée, vendu au résultat, sous une seule facture.

On ne gagne pas en étant **le plus autonome** (11x/Artisan se sont plantés) ni **le plus gros volume** : on gagne en étant **le plus sûr à l'échelle** : data vérifiée, copy sourcée, domaines protégés, humain sur l'irréversible.

---

## 1. Positionnement & cible

### Wedge
La **sécurité de délivrabilité** est le #1 driver d'achat post-règles Google/Yahoo 2024. C'est notre porte d'entrée, pas le volume d'envoi.

### Segments (ordre de priorité GTM)
| Segment | Pourquoi | Motion |
|---|---|---|
| **1. Agences outbound** (FR/EU) | Plus haut NRR, plus bas CAC (elles acquièrent leurs propres clients), veulent white-label + facture consolidée | Tier Agence white-label, self-serve |
| **2. Équipes SDR in-house** (scale-ups) | Remplacent/augmentent le siège SDR (~70k€) par un agent à ~500€ | Co-pilot -> autopilot, land-and-expand |
| **3. Fondateurs solo / SMB** | Entrée PLG, volume | Reverse-trial Pro |

### Différenciateur défendable
1. **Infra délivrabilité** (rotation mailboxes + garde-fous + warmup) : protège les domaines clients.
2. **SDR IA sûr** (grounding anti-hallucination + HITL gradué) : exécution sans churn.
3. **Conformité EU native** (waterfall GDPR + country-aware) : moat réglementaire vs US-centric.

---

## 2. Stratégie FONCTIONNELLE

### La chaîne de valeur (les 6 piliers)
```
SIGNAUX → DATA → SCORING → COPY → ENVOI MULTICANAL → RÉPONSE/RDV
(intent)  (waterfall)(LLM)  (LLM+   (délivrabilité     (classif +
                            critique) + rotation)        booking)
   └──────────────── orchestré par le SDR IA durable (HITL) ───────────┘
```

### Principes fonctionnels (non négociables)
1. **Sécurité domaine d'abord** : auth preflight bloquant, caps/ramp/jitter, suppression globale, auto-stop bounce/plaintes. Garde-fous **on par défaut**.
2. **Qualité avant volume** : waterfall data (match 80-93%, bounce <2%) : un mauvais lead pollue la réputation.
3. **Bon moment > plus de contacts** : signaux d'intent EU-safe déclenchent les séquences.
4. **Humain sur l'irréversible** : co-pilot par défaut, autonomie graduée, gates durs (1er touch nouveau domaine, booking, plainte/légal).
5. **Copy sourcée, jamais inventée** : gate anti-hallucination (affirmation = champ source ou strip).
6. **Conformité country-aware** : FR opt-out / DE consentement ; provenance Art. 14 ; opt-out RFC 8058 -> suppression globale.

### Modèle d'autonomie (le client monte l'échelle)
`L0 Draft -> L1 Co-pilot (défaut) -> L2 Supervised -> L3 Auto-pilot` : avec auto-rétrogradation si plaintes/hallucinations montent. **On ship en L1, jamais en L3.**

### Pricing & packaging (métré = contacts actifs)
| Tier | Prix | Inclus | Marge |
|---|---|---|---|
| Free (reverse-trial 14j) | €0 | 50 contacts | cap dur |
| Pro | €49 | 250 contacts | ~74% |
| Business | €149 | 1 000 contacts + co-pilot | ~66% |
| Enterprise | €500+ | 3 500+ + autopilot + add-on €/RDV | ~60-65% |
| **Agence / white-label** | wholesale | sous-comptes illimités, rebrand, billing consolidé | NRR max |

Garde-fou marge = **cap contacts/tier** + **markup ≥30%** sur l'usage IA. Billing **Stripe Meters**.

### GTM
Reverse-trial -> **onboarding activation-first** (1er contact enrichi + 1ère séquence live + domaine auto-configuré) -> land-and-expand via contacts actifs -> **tier agence = multiplicateur NRR**.

---

## 3. Stratégie TECHNIQUE

### Architecture cible (décisive)
| Couche | Choix | Rôle |
|---|---|---|
| App | **Next.js 16 / Vercel** (garder) | UI + API, runtime Node |
| Jobs durables | **Inngest** | Séquences multi-jours, retries, throttle ESP, `waitForEvent` (HITL) |
| Agent SDR | **Mastra (ou AgentKit) sur Inngest** + **Vercel AI SDK** (couche LLM) + **MCP** (tools) | Orchestration + mémoire + evals |
| DB | **Neon Postgres + RLS** (`SET LOCAL tenant_id`) | Multi-tenant, branch-per-PR |
| Redis | **Upstash** | Rate-limit sliding-window + idempotence + locks |
| Délivrabilité | **Moteur maison** (rotation/health/auto-pause) sur **API Maildoso** (provisioning mailboxes) + **Cloudflare API** (DNS) | Protège les domaines |
| Data | **Waterfall** Dropcontact -> Cognism -> LeadMagic/Findymail (Apollo pour sourcing) | Qualité leads EU |
| LLM | Routing : Flash-Lite/Nano (classif) · Haiku/Mini (scoring) · Sonnet 4.6 (copy) | Coût/qualité par tâche |
| Multicanal | **Unipile** (LinkedIn+WhatsApp+email) ; séquenceur maison | Transport vs orchestration |
| Billing | **Stripe Billing** (Meters + credits + markup IA) | Métré contacts actifs |
| Auth | **Clerk** (garder) | : |
| Observabilité | **Sentry (OTel) + Better Stack + PostHog** | Erreurs/uptime/produit |
| Secrets/IaC | **Infisical + Terraform + GitHub Actions** | Industrialisation, zéro-touche |

### Principes techniques (non négociables)
1. **Idempotence partout** (retries durables ne doivent jamais double-envoyer/charger : clé `tenant:campaign:lead:step`).
2. **Defense-in-depth tenant** : scoping applicatif + RLS (`SET LOCAL`, jamais `SET`).
3. **Données externes = non fiables** (réponses prospect, web, enrichment) -> anti-injection, jamais des instructions.
4. **Quality-as-code** : evals LLM (trajectoire) en CI, golden datasets versionnés, gate de merge.
5. **Sécurité = feature** : webhooks signés constant-time, headers/CSP, pas de routes debug, secrets hors code.
6. **Build only the value layer** : acheter le commodity (provisioning Maildoso, transport Unipile, data providers), coder la différenciation (orchestration, garde-fous, séquenceur).

---

## 4. Le plan PHASÉ (fonctionnel + technique alignés)

> Chaque phase livre **de la valeur fonctionnelle** ET pose une **fondation technique**, avec un **KPI-gate** avant de passer à la suivante.

### Phase 0 : Durcir l'existant (cette semaine) · *shippable en prod*
**Fonctionnel** : produit honnête et sûr ; garde-fous délivrabilité v1 (protège les domaines dès le 1er envoi).
**Technique** :
- Merger **PR #1** (sécurité + quota relances + tests).
- Supprimer `/api/debug/*` (fuite préfixe `RESEND_API_KEY`) ; consolider headers/CSP.
- **Délivrabilité v1** : auth preflight (SPF/DKIM/DMARC) bloquant à l'onboarding + suppression globale + caps/jitter par inbox + opt-out RFC 8058 propre.
- Aligner docs/marketing au code (modèle réel, claims sécurité vrais).
**KPI-gate** : 0 trou critique d'audit · 0 envoi depuis un domaine non authentifié.

### Phase 1 : Fondation durable & qualité (semaines 1-4)
**Fonctionnel** : leads de qualité (waterfall) + scoring fiable + envoi qui ne casse pas à l'échelle.
**Technique** :
- **Upstash** (rate-limit + idempotence sur chaque envoi/webhook).
- **Inngest** : migrer le cron synchrone -> steps durables (throttle ESP, sleep, waitForEvent).
- **Waterfall data EU** (Dropcontact + Cognism + fillers ; Apollo = sourcing).
- **Routing LLM + harness d'éval** (DeepEval + golden datasets + gate CI) sur scoring/copy/classif.
- **Moteur délivrabilité v2** : provisioning via **API Maildoso** + DNS Cloudflare + rotation/health/auto-pause.
**KPI-gate** : match email ≥80% · bounce <2% · 0 dépassement de cap d'envoi · evals LLM vertes en CI.

### Phase 2 : SDR IA co-pilot & nouvelle UI (semaines 5-10)
**Fonctionnel** : le SDR IA (L0-L1) recherche, rédige (copy sourcée), propose ; l'humain valide. UI instrument.
**Technique** :
- **Agent SDR** : Mastra/AgentKit sur Inngest, tools MCP (recherche/enrichment/send/CRM/calendar), **gate anti-hallucination**, anti-injection sur réponses.
- **HITL** : UI d'approbation (streaming `useAgent`), `waitForEvent` gates, config niveau d'autonomie.
- **Signaux d'intent** EU-safe (funding/hiring/technographics) -> signal-router -> déclenche séquence.
- **Refonte UI** : shadcn+Base UI+Tailwind v4, ⌘K, optimistic UI, table TanStack, retrait animations marketing.
- **Neon + RLS** + preview env branch-per-PR.
**KPI-gate** : hallucination <2% (gate actif) · activation onboarding ↑ · reply rate mesuré · trajectory-evals vertes.

### Phase 3 : Multicanal, autonomie & monétisation (semaines 10-16)
**Fonctionnel** : LinkedIn + email orchestrés ; autopilot supervisé ; pricing usage + tier agence.
**Technique** :
- **Multicanal via Unipile** (LinkedIn d'abord : caps stricts, proxy/compte, branching) + séquenceur cross-canal maison.
- **Autonomie L2** (auto-rétrogradation sur plaintes/hallucinations) + circuit-breakers.
- **Stripe Billing** métré contacts actifs + crédits + overage + **tier agence white-label**.
- Observabilité OTel/Sentry/PostHog + uptime ; secrets Infisical + Terraform.
**KPI-gate** : +réponses multicanal mesuré · marge brute 60-74%/tier · 0 ban LinkedIn · NRR en hausse.

### Phase 4 : Scale & enterprise (post-16 sem)
**Fonctionnel** : messages vocaux LinkedIn, dialing assisté, intégrations CRM, intent avancé.
**Technique** : SOC2/ISO (Vanta/Drata), CRM/iPaaS (Merge/Paragon), read-replicas, ClickHouse analytics, multi-users/A-B.
**KPI-gate** : SOC2 Type I lancé · uptime 99.9%.

---

## 5. KPI produit (boussole)
- **Délivrabilité** : domain reputation (Postmaster ≥ High), spam <0.08%, bounce <2%, 0 domaine cramé.
- **Qualité** : match email ≥80%, hallucination <2%, accuracy classif ≥95%.
- **Outcome** : reply rate, **positive reply rate**, **RDV bookés** (vanity = emails envoyés, à éviter).
- **Business** : marge brute 60-74%, NRR >105%, ratio efficacité-inférence >8:1, conversion reverse-trial ~24%.

---

## 6. Risques & mitigations
| Risque | Mitigation |
|---|---|
| **Domaines clients cramés** (mort du produit) | Garde-fous on-par-défaut, caps, warmup, circuit-breakers, verification pré-envoi |
| **Hallucination -> perte de confiance + AG enforcement** | Gate grounding (claim=source), evals, brand-critic |
| **Ban LinkedIn** (cf. Artisan) | Unipile on-behalf-of-user, proxy/compte, caps conservateurs, humain dans la boucle |
| **Sur-promesse autonomie** (cf. 11x) | Co-pilot par défaut, mesurer RDV réels, pas « remplace N humains » |
| **Compression de marge IA** | Cap contacts/tier, house LLM cheap, markup ≥30%, optimiser enrichment |
| **Risque légal EU** (scraping, de-anon perso, TCPA) | Signaux niveau-entreprise, pas de DB scrapée, voix IA assistée only, LIA/provenance |
| **Paralysie par l'analyse** | Veille terminée -> build par phases avec KPI-gates |

---

## 7. Décisions à arbitrer (founder)
1. **Délivrabilité** : louer (Maildoso, vite) vs posséder (revendeur Google Workspace, moat). -> Reco : Maildoso v1, revendeur en moat.
2. **Pricing** : confirmer métré **contacts actifs** + tier agence prioritaire.
3. **Build today** : merge PR #1 sur `main` par moi, ou tu appuies ?
4. **Budget outils** : Inngest/Neon/Upstash/Unipile/Maildoso ont des tiers de départ : valider avant montée en charge (mémoire : pas d'action payante sans accord).

---

## 8. En une image : la séquence
```
Phase 0 ── durcir + délivrabilité v1 ──────────► PROD HONNÊTE (cette semaine)
Phase 1 ── Inngest+Upstash+Neon + waterfall + evals ─► FONDATION DURABLE (S1-4)
Phase 2 ── SDR IA co-pilot + signaux + UI instrument ─► DIFFÉRENCIATEUR (S5-10)
Phase 3 ── multicanal Unipile + autopilot + billing ──► MONÉTISATION (S10-16)
Phase 4 ── voix/dialer/CRM/SOC2 ──────────────────────► SCALE & ENTERPRISE
```

**Prochaine action proposée : exécuter Phase 0.**
