# 🔎 Veille complémentaire : SDR IA agentique, Monétisation, Multicanal (2026)

> Complète le [PRODUCT_BLUEPRINT_2026.md](./PRODUCT_BLUEPRINT_2026.md) et la
> [VEILLE_DATA_SIGNALS_INFRA.md](./VEILLE_DATA_SIGNALS_INFRA.md).
> Les 3 sujets qui finalisent le cadrage : **comment construire le SDR IA**, **comment
> le monétiser avec marge**, et **comment passer multicanal**. Sources en bas.

---

## 1. Architecture du SDR IA agentique

### Verdict : **workflow durable + points de décision LLM contraints + gates humains : PAS un essaim d'agents autonomes**

Les acteurs les plus « autonomes » (11x, Artisan) sont ceux qui se sont **plantés** : 11x (allégations de faux clients, churn 70-80%, action en justice), Artisan (comptes LinkedIn bannis pour spam). Le produit défendable en 2026 n'est pas « le plus autonome » : c'est **le plus sûr à l'échelle** : data vérifiée, copy sourcée, retries durables, humains sur les décisions irréversibles.

### Stack recommandé
- **Orchestration/agent** : **Mastra** (mémoire + evals first-class, se déploie sur Inngest) ou **Inngest AgentKit** (natif sur ton moteur durable). Les deux gardent le multi-modèle.
- **Couche LLM/streaming** : **Vercel AI SDK v5** (le meilleur sur le tool-calling + streaming, mais **zéro durabilité** -> pas l'orchestrateur).
- **Tools** : **MCP** (standard de facto 2026) : recherche/enrichissement, vérif email, send, CRM, calendar.
- **Durabilité** : **Inngest** (`step.run` idempotent, `step.sleepUntil` pour les attentes multi-jours, `step.waitForEvent` pour les gates HITL et l'arrivée des réponses).
- ❌ Éviter LangGraph.js (retarde le Python de semaines), CrewAI/AutoGen (Python).

### Pattern (guidance Anthropic « Building Effective Agents »)
> « Les implémentations qui réussissent utilisent des patterns simples et composables, pas des frameworks complexes. » Le multi-agent consomme **10-15× plus de tokens**.

Le SDR = **backbone déterministe** (workflow) avec une **boucle agentique bornée uniquement à la recherche**, puis prompt-chaining (draft ->critique ->critique), routing (classif réponse), evaluator-optimizer (fact-critic).

### Autonomie graduée (le client monte l'échelle, ne démarre jamais en haut)
| Niveau | L'agent fait | Gate humain |
|---|---|---|
| **L0 Draft** | Recherche + rédige | Humain approuve **chaque** message |
| **L1 Co-pilot** (défaut) | Rédige séquence + réponses | Approuve **1er touch/prospect** + tout nouveau domaine |
| **L2 Supervised** | Envoie les relances routinières | Approuve nouveaux 1ers touch + réponses qui bookent/affirment |
| **L3 Auto-pilot** | Envoie + book en batch | **Échantillonnage** + circuit-breakers |

**Gates durs non-négociables** (toujours, quel que soit le niveau) : avant 1er touch sur nouveau domaine, avant **booking calendrier**, avant toute réponse qui fait une **affirmation factuelle/prix**, sur toute réponse **plainte/légal/désabo** -> STOP humain.

### Garde-fous (defense-in-depth)
1. **Réponses prospect & résultats web = données non fiables**, jamais des instructions (délimiteurs + guardrail anti-injection : OWASP LLM01).
2. **Validation schéma** (Zod) sur chaque sortie LLM.
3. **Gate anti-hallucination (la clé)** : chaque affirmation entreprise-spécifique d'un draft **doit mapper à un champ source vérifié, sinon strip**. Les taux d'hallucination mesurés (12-20%) sont ce qui a tué les concurrents.
4. Brand-safety/tone classifier, cost caps, circuit-breaker plaintes >0.3% -> auto-pause.

### Evals = trajectoire, pas juste output
Les agents passent 20-40% de tests en plus en scoring output-only qu'en scoring trajectoire. Capturer la trace step/tool et scorer la **séquence** (a-t-il vérifié l'email avant d'envoyer ? respecté le gate ?). Outils : **Mastra evals**, LangSmith `agentevals`, Braintrust.

### ⚠️ Ce qu'il ne faut PAS sur-automatiser
1er touch nouveau domaine non supervisé · personnalisation inventée (strip non-sourcé) · booking sans gate · LinkedIn/multicanal autonome à volume (ban Artisan) · réponses aux plaintes/légal · sur-promesse « remplace N humains » (chute de 11x).

---

## 2. Monétisation & unit economics

### Verdict : **hybride : socle plateforme + métré « contacts actifs » (crédits inclus + overage) + add-on outcome + tier agence white-label**

Le per-seat s'effondre pour l'IA (21% ->15% en 12 mois ; 70% des vendeurs quittent le pur per-seat d'ici 2028). L'**hybride** (socle + variable) est le standard (~41-43%, ~61% fin 2026). Les concurrents AI-SDR métrent en **contacts actifs** (Salesforge Agent Frank ~$499/mo/1000 contacts) ou **crédits/action** (Instantly).

### Unit economics (COGS/contact actif/mois)
| Composant | Coût |
|---|---|
| Enrichment waterfall (batch) | $0.01-0.06 |
| Vérification email | $0.0025-0.007 |
| LLM (copy + scoring, ~6 emails) | **~$0.003-0.01** (négligeable) |
| Infra mailbox (amorti) | ~$0.003-0.006 |
| Sending (amorti) | ~$0.002-0.005 |
| **Total ≈ $0.05/contact actif** | |

> **Le vrai driver de COGS = l'enrichment, pas le LLM.** Le ratio efficacité-inférence (revenu ÷ $ inférence) est ~20-30:1 sur la ligne LLM. Optimiser l'enrichment (batch, ordre du waterfall, cache) avant de s'inquiéter des tokens.

### Tiers recommandés (marge protégée par le cap de contacts)
| Tier | Prix/mo | Inclus | Marge |
|---|---|---|---|
| **Free (reverse-trial 14j)** | €0 | 50 contacts, 1 mailbox | (CAC, cap dur) |
| **Pro** | €49 | 250 contacts (~1 500 emails), overage €0.15 | **~74%** |
| **Business** | €149 | 1 000 contacts, multi-mailbox, co-pilot | **~66%** |
| **Enterprise** | €500+ | 3 500+ contacts, autopilot, **add-on €/RDV** | ~60-65% |
| **Agence / white-label** | wholesale | sous-comptes illimités, rebrand, billing consolidé | NRR le plus élevé |

Marges dans la bande **AI-first 55-70%**. **Le cap de contacts actifs par tier = la garde-fou de marge** (sans lui, un power-user Pro coûte plus cher que son abo).

### Pass-through coût IA & billing
- Séparer **socle plateforme** (couvre le COGS de base) des **crédits inclus + overage** (marge positive). **Markup ≥30%** sur l'usage IA métré.
- **Billing : Stripe Billing** (Meters API + credit grants + markup % IA, livré mars 2026) pour lancer vite. Revisiter **Lago** (open-source, EU self-host : pertinent vu posture Hetzner/EU) ou **Orb** (flexibilité pricing) à l'échelle.

### PLG
**Reverse-trial** (Pro complet 14j -> downgrade free capé) : conversion médiane **24%** vs freemium 4.5%. L'**activation** explique 60-75% de la variance de conversion -> onboarding activation-first (1er contact enrichi + 1ère séquence live). Le métré contacts actifs = moteur naturel de **land-and-expand** (NRR).

---

## 3. Multicanal (LinkedIn / phone / WhatsApp)

### Verdict : **intégrer via Unipile (LinkedIn + WhatsApp + email en une API), posséder uniquement le séquenceur cross-canal**

Le multicanal paie : LinkedIn+email **+50% de réponses** ; 3+ canaux **+287%**. Reply rate cold : email ~3.4%, LinkedIn ~10.3%, InMail 10-25%. (Le « 3.5× » de La Growth Machine = marketing ; défendable = +50% à 3-4×.)

### Ne PAS construire la couche session LinkedIn (course à l'armement + risque ToS) -> **Unipile**

| Provider | API propre ? | Canaux | Prix |
|---|---|---|---|
| **Unipile** ✅ | **Oui : infra dédiée** | LinkedIn (Classic/Recruiter/Sales Nav) + Email + WhatsApp + Calendar | €49 base (≤10 comptes) + €4-5/compte/mo |
| HeyReach | Oui (app) | LinkedIn multi-comptes | $79-199/mo |
| PhantomBuster | partiel | scraping LinkedIn | crédits |

Unipile : REST + SDK TS + webhooks ; **hosted auth** (tes users connectent leur propre LinkedIn) ; **proxy & quota management intégrés** ; pas de DB de profils propre (posture GDPR/ToS).

### Contraintes de sécurité LinkedIn (durs)
- **1 proxy résidentiel/mobile dédié par compte** (obligatoire) : mobile = meilleur.
- **Cloud > extension navigateur** (moins détectable).
- Limites sûres : **invitations ~15-20/jour (~100/sem)**, **messages 40-80/jour**, InMail 50-150/mois. **Ne jamais maxer** (23% des comptes « dans les limites » se font restreindre car pattern détectable). L'**acceptance rate** compte plus que le volume.

### Légal (flags)
1. **Automatiser une session LinkedIn loggée viole le ToS** (hiQ : $500k de dommages + destruction de données). Modèle « on-behalf-of-user », pas de DB de profils scrapés (GDPR).
2. **Voix IA en appel cold = TCPA strict liability** ($500-1 500/violation, class actions actives) -> **appels assistés par IA avec humain**, pas de voix IA autonome cold.
3. **WhatsApp cold interdit** par Meta -> opt-in + templates approuvés ; canal warm-only (Click-to-WhatsApp en entrée).

### Rollout recommandé
1. **LinkedIn d'abord (via Unipile)** : plus gros différenciateur, reply 10%+. Caps conservateurs + proxy/compte + warming + branching conditionnel.
2. **Messages vocaux LinkedIn** (clone voix consentie) : ~2× reply, **pas de TCPA** (in-app, pas un appel).
3. **Phone : dialing assisté IA** (Twilio ou Orum/Aircall, humain sur l'appel) + DNC + local presence.
4. **WhatsApp en dernier, warm/consenti uniquement**.

**Ton moat = le séquenceur cross-canal** (cadence, timing, fallback de canal, throttling, governor de sécurité par compte, inbox unifiée). Le transport (Unipile/Twilio) est commodité.

---

## Synthèse : le produit cible complet

En empilant les 8 veilles, le produit le plus pertinent en 2026 :
- **Data waterfall EU** (qualité leads) -> **signaux d'intent EU-safe** (bon moment) -> **SDR IA durable + HITL** (exécution sûre) -> **infra mailboxes + rotation + garde-fous délivrabilité** (protège les domaines) -> **multicanal via Unipile** (LinkedIn+email) -> métré **contacts actifs** + tier agence (monétisation à marge).
- **Positionnement** : « décrocher des RDV sans cramer ses domaines », vendu au résultat, sous une facture.
- **Garde-fous transverses** : grounding anti-hallucination, anti-injection, circuit-breakers délivrabilité, conformité EU country-aware (FR opt-out / DE consentement).

---

## Sources principales
- **SDR IA** : Anthropic *Building Effective Agents* / *Writing tools for agents* · Inngest AgentKit + Durable Execution · Mastra (suspend/resume, evals) · Vercel AI SDK v5 · MCP · OWASP LLM01 / PromptArmor · LangSmith/Braintrust trajectory evals · 11x (TechCrunch, action légale) · Artisan (bans LinkedIn) · Salesforge Agent Frank (co-pilot/autopilot).
- **Monétisation** : Monetizely/MindStudio (per-seat is dead, hybride) · Salesforge/Instantly/Reply/11x pricing · Stripe Billing Meters (mars 2026) · Orb/Metronome/Lago · ICONIQ 2026 marges · Growth Unhinged (reverse-trial, free-to-paid) · Pavilion/Benchmarkit (NRR/LTV:CAC).
- **Multicanal** : Unipile (API LinkedIn/WhatsApp/email, pricing) · HeyReach/PhantomBuster/Expandi/LGM · limites LinkedIn 2026 (PhantomBuster/Wandify/LGM) · hiQ v. LinkedIn (Wikipedia/Farella/ZwillGen) · FCC TCPA AI-voice · Meta WhatsApp policy · benchmarks multicanal (Sproutworth/Outreaches).
