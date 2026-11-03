# Phantera

**Moteur d'outbound B2B piloté par IA** : sourcing -> enrichment -> scoring -> copy -> séquences multicanal -> gestion des réponses, orchestré par un SDR IA sûr.

> **Thèse produit :** *« décrocher des RDV sans cramer ses domaines ».* On gagne sur la
> **sécurité de délivrabilité** + un SDR IA déclenché par signaux, pas sur le volume.

Monorepo npm workspaces · `apps/api` = **Next.js 16** (Turbopack) · Prisma/Postgres · Clerk · Stripe ·
LLM **Ollama Cloud** (FOSS) · **Inngest** (exécution durable) · déployé sur Vercel.

---

## 🚀 Démarrage

**En une commande :** `bash scripts/dev-setup.sh` (Postgres local, `.env.local`, schéma), puis `npm run dev`.
Contrat d'API front/back : [`packages/contract`](packages/contract/README.md).

À la main :

```bash
cd apps/api
cp env.local.template .env.local     # coller les clés (TIER 1 en premier)
npm run setup:check                  # rapport actif/bloqué par feature
npm install
npx prisma generate
npm run dev                          # + (option) npx inngest-cli@latest dev
```

**Qualité :** `npm run type-check` · `npm run lint` · `npm run test` · `npm run test:llm:security` (garak).

> Sans clés, tout tourne en **mocks déterministes** (rien ne casse). Voir `apps/api/env.local.template`.

---

## 📚 Documentation

### Cadrage & stratégie
| Doc | Contenu |
|-----|---------|
| **[docs/STRATEGIE.md](docs/STRATEGIE.md)** | La stratégie fonctionnelle + technique alignée par phases (capstone) |
| **[docs/PRODUCT_BLUEPRINT_2026.md](docs/PRODUCT_BLUEPRINT_2026.md)** | Challenge du besoin + archi cible + plan |
| **[docs/ETAT_ET_ROADMAP.md](docs/ETAT_ET_ROADMAP.md)** | ✅ Fait · 🔜 Reste-à-faire · 🚀 Prochaines évolutions |

### Veilles marché & technique
| Doc | Contenu |
|-----|---------|
| **[docs/VEILLE_DATA_SIGNALS_INFRA.md](docs/VEILLE_DATA_SIGNALS_INFRA.md)** | Sourcing data (waterfall EU), signaux d'intent, infra mailboxes |
| **[docs/VEILLE_SDR_PRICING_MULTICANAL.md](docs/VEILLE_SDR_PRICING_MULTICANAL.md)** | Archi SDR IA, monétisation/unit-economics, multicanal |

### Référence technique
| Doc | Contenu |
|-----|---------|
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Architecture système, pipeline 5 agents, data model |
| **[docs/SECURITY.md](docs/SECURITY.md)** | OWASP, webhooks, secrets, GDPR, runbook incidents |
| **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)** | Core Web Vitals, budgets, optimisations |
| **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** | Tokens, composants, motion |
| **[apps/api/security/garak/README.md](apps/api/security/garak/README.md)** | Red-team LLM (NVIDIA garak) |

### Tests & setup
| Doc | Contenu |
|-----|---------|
| **[AUDIT.md](AUDIT.md)** | Rapport d'audit initial + fixes |
| **[TESTING_GUIDE.md](TESTING_GUIDE.md)** | Guide de test du pipeline |
| **[apps/api/env.local.template](apps/api/env.local.template)** | Toutes les variables d'env, par priorité |

---

## 🧭 Modules clés (`apps/api/lib/`)

| Domaine | Chemin |
|---|---|
| Délivrabilité | `deliverability/` (send-policy · auth-preflight · suppression · gate) |
| LLM + agents | `llm/client.ts` · `agents/` (lead-scorer · copywriter · reply-classifier · grounding) |
| Éval LLM | `evals/` + `*.eval.test.ts` |
| Sécurité LLM | `security/prompt-guard.ts` · `security/garak/` · `app/api/security/redteam` |
| Exécution durable | `inngest/` · `durability/` (idempotency · upstash-store) |
| SDR IA | `sdr/` (autonomy · orchestrator · approvals) |
| Signaux / Data | `signals/router.ts` · `enrichment/` (waterfall · providers) |
| Multicanal / Billing | `multichannel/unipile.ts` · `stripe/usage.ts` |

---

## ✅ État

`tsc` 0 · `eslint --max-warnings=0` 0 · `vitest` **222 tests + 2 skipped** sur `main`.
Détail complet et feuille de route dans **[docs/ETAT_ET_ROADMAP.md](docs/ETAT_ET_ROADMAP.md)**.
