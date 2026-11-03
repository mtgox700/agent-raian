# 📍 Phantera : État, reste-à-faire & évolutions

> Photo du produit au **2026-06-11**. Synthèse de la session d'industrialisation.
> Réfs : [STRATEGIE](./STRATEGIE.md) · [BLUEPRINT](./PRODUCT_BLUEPRINT_2026.md) · veilles.
>
> **Mesure objective :** `tsc` 0 · `eslint --max-warnings=0` 0 · `vitest` **222 tests + 2 skipped** sur `main`.
> 18 PRs mergées + 1 PR draft UI (#17). Zéro dépendance payante (hors SDK Inngest, gratuit).

---

## 1. Vue d'ensemble

Le produit est **intégralement codé côté logique, intégrations et données**, plus la **fondation UI**. Chaque brique externe est **env-gated + testée** (mocks déterministes sans clé) -> elle s'active dès qu'une clé est posée, sans rien casser. Il reste : l'**assemblage visuel des pages** (validation au navigateur) et la **validation live** des adaptateurs.

```
Signal → Data (waterfall) → Scoring (LLM) → Copy (LLM + grounding) →
   → SDR (autonomie + HITL) → Délivrabilité (caps/rotation/suppression) →
   → Envoi (Resend / Unipile multicanal) → Réponse (classif + anti-injection) → RDV
        └────────── orchestré durablement par Inngest, métré par Stripe ──────────┘
```

---

## 2. ✅ Ce qui a été fait

### Qualité & sécurité de base
- **Audit complet + fixes** (PR #1) : IDOR unsubscribe, quota relances, campagnes jamais COMPLETED, secrets non-constant-time (`safeCompare`).
- **Headers/CSP consolidés**, **routes `/api/debug/*` supprimées** (fuite préfixe clé), `/api/health` (PR #3).

### Délivrabilité (`lib/deliverability/`)
- `send-policy` (caps/jour, ramp warmup 5 ->10 ->20 ->cap, jitter, lint spam), `auth-preflight` (SPF/DKIM/DMARC/MX via DNS), `suppression` (globale workspace), `gate` (décision d'envoi unifiée). **Câblés** : suppression sur bounce/plainte (webhook), lint bloquant dans le send-path. (PR #3, #10)

### LLM (`lib/llm/`, `lib/agents/`)
- **Migration vers Ollama Cloud** (FOSS, OpenAI-compatible), modèle `qwen3.5`, **routing par tâche** (classify/score/copy). `chat()` + `chatStream()` sans dépendance. (PR #5, #6)
- **Harness d'éval** (`lib/evals/`) : métriques (accuracy/F1/MAE/spearman), golden datasets, gates CI (`RUN_LLM_EVALS=1`). (PR #4)

### Sécurité LLM
- **NVIDIA Garak** red-team (endpoint gated `ENABLE_REDTEAM`, config + analyzer + CI hebdo) (PR #7).
- **Anti-injection** sur le classifieur (délimitation + détecteur EN/FR + system prompt durci) (PR #8).
- **Anti-hallucination** (grounding) : la copy ne peut pas inventer de chiffres -> régénération forcée (PR #9).

### Exécution durable (`lib/inngest/`)
- **Inngest** : scheduler horaire + processeur de campagne (concurrence/retries), **fonction SDR** sur signal. Endpoint `/api/inngest`. (PR #6, #11)
- **Idempotence** (`lib/durability/`) : `IdempotencyStore` + **Upstash Redis** (REST) + in-memory fallback. (PR #4, #10)

### SDR IA (`lib/sdr/`)
- **Autonomie L0 ->L3** + gates durs, **orchestrateur** (`planSdrAction`), **persistance des approbations** (Notification + migration `SDR_APPROVAL_NEEDED`). (PR #11, #16)

### Signaux & Data (`lib/signals/`, `lib/enrichment/`)
- **Signal-router** (funding/hiring/job-change/technographic/web-visit -> playbook + priorité + conformité EU). (PR #10)
- **Waterfall d'enrichment** (pay-on-success) + adaptateurs **Findymail / LeadMagic / Prospeo**. (PR #12, #13)

### Multicanal & Billing
- **Unipile** (LinkedIn + email) (PR #14).
- **Stripe usage** : métré contacts actifs via Meters (PR #15).

### UI (PR draft #17, branche `feat/ui-refonte`, **non mergée**)
- Primitives `skeleton`/`badge`, **DataTable** TanStack (tri/sélection/densité/sticky/skeleton), **palette ⌘K** montée dans le shell, **file d'approbation SDR** (API + composant optimistic + page), **AutonomySelector** L0-L3, **cartes KPI délivrabilité** (helpers seuils ISP testés). **228 tests** sur la branche.

### Setup
- `env.local.template` (variables par priorité, commentées) + `npm run setup:check` (rapport actif/bloqué par feature). (PR #18)

---

## 3. 🔜 Ce qui reste à faire (prérequis = clés / app qui tourne)

| Chantier | Détail | Prérequis |
|---|---|---|
| **Validation live des adaptateurs** | 1 test d'intégration par provider (Findymail/LeadMagic/Prospeo, Unipile, Stripe Meters, Ollama) pour confirmer les endpoints exacts | les clés correspondantes |
| **Migration DB** | `prisma migrate deploy` (applique `SDR_APPROVAL_NEEDED`) | `DATABASE_URL` (Neon) |
| **Refonte UI : pages** | Assembler les briques : page Leads (DataTable + inline + saved views + bulk), inbox, analytics (funnel + KPI délivrabilité), onboarding activation-first | **Clés Clerk** (app qui tourne, validation visuelle) |
| **Retrait animations marketing** | Sortir GSAP/Framer du dashboard, micro-transitions only | app qui tourne |
| **Pass WCAG 2.2** | Cibles ≥24px, focus non masqué, alt non-drag, focus rings | app qui tourne |
| **Wiring SDR complet** | Sur « approve » : émettre l'event Inngest d'envoi avec le draft ; recherche + génération copy par signal | DB + Ollama + Inngest |
| **Provisioning délivrabilité** | Intégrer l'API Maildoso (mailboxes), DNS Cloudflare auto, rotation/health par mailbox | comptes Maildoso/Cloudflare |
| **Adaptateurs EU GDPR** | Dropcontact (async/poll) + Cognism en tête du waterfall | clés Dropcontact/Cognism |
| **Inngest prod** | Connecter l'intégration Vercel (le scheduler horaire pilote les séquences) | dashboard Inngest |

---

## 4. 🚀 Prochaines évolutions (post-MVP)

### Court terme (active dès les comptes)
- **Warmup réseau** + IP dédiées (moat délivrabilité) : passer de « louer » (Maildoso) à « posséder ».
- **Intent providers** réels : Specter (funding), TheirStack/PredictLeads (hiring), Wappalyzer (tech), Snitcher (de-anon entreprise EU-safe).
- **Messages vocaux LinkedIn** (clone voix consentie, ~2× reply, hors TCPA).
- **A/B testing** des emails (promis tier Business).
- **Invitations multi-utilisateurs** (le modèle `WorkspaceMember` existe ; manque le flux d'invite).

### Moyen terme
- **Eval continue en prod** : sampler les trajectoires SDR, suivre hallucination/plaintes/RDV ; trajectory-evals (LangSmith/Braintrust).
- **CRM bidirectionnel** (HubSpot/Salesforce/Pipedrive via Merge.dev/Paragon) : promis tier Enterprise.
- **Dialer assisté IA** (Twilio/Orum, humain dans la boucle ; éviter la voix IA cold = TCPA).
- **Analytics avancées** : attribution multi-touch, benchmarks, cohortes.
- **Tier Agence white-label** (rebrand, sous-comptes, billing consolidé : segment NRR le plus fort).

### Long terme / scale
- **SOC2 Type I** (Vanta/Drata), pen-test, DPA : déblocage grands comptes.
- **Migration cron -> 100% Inngest**, Neon read-replicas, cache Redis dashboard.
- **ETL analytics** (ClickHouse/BigQuery), uptime monitoring + alerting.
- **PPR / Streaming SSR** (Next 16) pour la perf dashboard.

---

## 5. Comment lancer

```bash
cd apps/web
cp env.local.template .env.local      # coller les clés (TIER 1 d'abord)
npm run setup:check                   # rapport actif/bloqué
npm install
npx prisma generate
npm run dev                           # + (option) npx inngest-cli@latest dev
```
**Qualité :** `npm run type-check` · `npm run lint` · `npm run test` · `npm run test:llm:security` (garak).

---

## 6. Inventaire des modules clés

| Domaine | Chemin |
|---|---|
| Délivrabilité | `lib/deliverability/` (send-policy, auth-preflight, suppression, gate) |
| LLM | `lib/llm/client.ts`, `lib/agents/` (lead-scorer, copywriter, reply-classifier, grounding) |
| Éval LLM | `lib/evals/` + `*.eval.test.ts` |
| Sécurité LLM | `lib/security/prompt-guard.ts`, `security/garak/`, `app/api/security/redteam` |
| Durable | `lib/inngest/`, `lib/durability/` |
| SDR | `lib/sdr/` (autonomy, orchestrator, approvals) |
| Signaux / Data | `lib/signals/router.ts`, `lib/enrichment/` |
| Multicanal / Billing | `lib/multichannel/unipile.ts`, `lib/stripe/usage.ts` |
| UI (branche #17) | `components/ui/`, `components/dashboard/` (CommandPalette, sdr/, DeliverabilityKpi) |
| Setup | `env.local.template`, `scripts/check-env.mjs` |
