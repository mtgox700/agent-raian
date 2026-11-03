# 🔎 Veille critique : Data, Signaux d'intent, Infra d'envoi (2026)

> Complément au [PRODUCT_BLUEPRINT_2026.md](./PRODUCT_BLUEPRINT_2026.md).
> Les 3 sujets qui rendent le produit **meilleur** (pas juste mieux construit) :
> la qualité des leads, le bon moment (signaux), et la délivrabilité à l'échelle.
> Reco actionnables + flags conformité EU. Sources en bas.

---

## 1. Sourcing data & qualité des leads

### Verdict : **ne pas rester mono-source Apollo -> construire un waterfall**

Apollo vérifie ses emails à **~73%** et sa data EU/mobile se dégrade fortement hors UK. Le waterfall (chaîner plusieurs providers, s'arrêter au 1er hit vérifié) fait passer le match email de **~55-70% (mono) à 80-93%**, en ne payant que le provider le moins cher qui réussit (**pay-on-success**).

### Stack EU recommandé (ordre du waterfall)

| Étage | Provider | Pourquoi | Conformité EU |
|---|---|---|---|
| 1. Ancre GDPR | **Dropcontact** (FR) | #1 bench indépendant : **54.9% effectif, 0.9% bounce** ; **pas de base perso** (calcul algorithmique) | 🟢 GDPR-native, FR-hosted |
| 2. Premium EU + mobile | **Cognism** (ou **Kaspr** budget) | Meilleur **mobile EU vérifié**, scrubbing DNC 14 pays, workflow consent DE | 🟢 LIA/PIA, ISO 27701, SOC 2 |
| 3. Fillers volume | **LeadMagic** + **Findymail** | Long tail à **~$0.01-0.017/email**, pay-on-success ; Findymail 1.1% bounce | 🟢 pay-on-success |
| 4. Catch-all (option) | **Prospeo** | Résolution catch-all, vérif 5 étapes | 🟡 |
| Orchestration | **FullEnrich** / **Surfe** (clé en main) ou **Clay** (programmable, attention +30-50% de coût réel) | Gère le routage du waterfall | inherite |

**Apollo reste pertinent** pour le **sourcing/firmographics + recherche ICP** (sa force) ; on route juste la **résolution email/phone** par le waterfall.

⚠️ **Country-aware obligatoire** : **France permissive** (B2B opt-out OK), **Allemagne (UWG §7) = consentement préalable requis**. La base « intérêt légitime » n'est pas un blanc-seing EU.

*Bench indépendant Dropcontact 20K contacts ; vendor-claims (96-98%) = best-case, à re-tester sur seed-list EU.*

---

## 2. Signaux d'intent / triggers

### Verdict : **commencer par les signaux niveau-entreprise (non-personnels) = EU-safe + fort ROI**

| Signal | Meilleur provider | Prix d'entrée | EU |
|---|---|---|---|
| **Funding** (budget + croissance) | **Specter** (build-friendly, API) ; Crunchbase/PitchBook | ~$500/mo | 🟢 non-personnel |
| **Hiring / jobs** (timestamp de budget, 60-90j d'avance) | **TheirStack** (transparent) / **PredictLeads** | free ->$169/mo | 🟢 non-personnel |
| **Technographics** (displacement) | **Wappalyzer** (cheap API) / BuiltWith / PredictLeads | $250/mo | 🟢 non-personnel |
| **Visiteurs web : niveau entreprise** | **Snitcher** / Dealfront / Albacross (EU-hosted) | €49/mo | 🟢 EU-safe |
| **Job change** (ancien champion qui bouge : +114% win-rate) | **UserGems** / Champify | ~$2.7K/mo | 🟡 PII LinkedIn -> DPA + LIA |
| **Intent agrégé** (ta catégorie) | **G2 / TrustRadius** | ~$30K/an | 🟡 co-op OK |
| **Visiteurs web : niveau personne** | RB2B / Vector / Warmly | $79/mo | 🔴 **PAS EU-légal** sur individus EU (CJEU *Breyer*) : US-only |
| **Engagement LinkedIn** (scraping) | Trigify / PhantomBuster | $40/mo | 🔴 risqué (CNIL : KASPR €240K, Aware fermé) |

### Comment un signal déclenche le SDR IA
- **Levée de fonds détectée** -> enrichir -> séquence « félicitations + use-case croissance ».
- **Recrutement rôle X** -> mapper rôle ->douleur produit -> outreach sous 2-3 sem (fenêtre chaude), combiné technographics.
- **Ancien champion change de job** -> priorité max -> ré-intro « congrats nouveau poste ».
- **Visite page pricing (de-anon entreprise)** -> alerte temps réel -> outreach jour-même.
- Archi : un **signal-router** score/dédoublonne les events et dispatche le template au SDR IA avec le payload du signal comme contexte de perso.

### Build vs Buy
**Buy** quasi tout (funding, hiring, technographics, job-change, de-anon : l'identity graph est le moat du vendor). **Build uniquement le first-party intent** (ton propre site/produit) : c'est le moat durable et **GDPR-clean** qui évite à la fois le coût co-op et l'exposition légale.

⚠️ **Reco EU** : démarrer sur les 🟢 (funding, hiring, technographics, de-anon entreprise, review-intent) : ils couvrent l'essentiel de la valeur à risque légal minimal. Person-level de-anon & scraping LinkedIn = US-only ou après validation juridique.

---

## 3. Infra d'envoi & provisioning de mailboxes

### Verdict : **modèle « beaucoup d'inbox pas chères + rotation », et ACHETER le provisioning (API), pas construire du SMTP**

Les APIs transactionnelles (**Resend/Postmark/SES/SendGrid/Mailgun**) **interdisent le cold email en pratique** (Postmark/SES bannissent -> suspensions). Elles servent au **transactionnel** (notifs, reset, réponses) : **pas au cold-send**.

L'industrie (Instantly/Smartlead/Salesforge) ne fait **pas** tourner ses propres IP pour le cold : elle connecte **beaucoup de vraies mailboxes Google Workspace / M365** (ou SMTP propriétaire), **2-3 par domaine**, réparties sur des dizaines/centaines de domaines, chacune **plafonnée ~30-50 envois/jour**, avec rotation + warmup + monitoring.

### Économie (per-mailbox/mois)

| Provider | $/mailbox/mo | API | Note |
|---|---|---|---|
| **Maildoso** | **$3-3.49** | ✅ **API complète** | **Hybride** (SMTP propriétaire OU Google Workspace), DNS auto. **Meilleur choix build-vs-buy.** |
| Mailforge | $2-3 | ❌ pas d'API | Disqualifié pour un SaaS (besoin programmatique) |
| Primeforge / InboxKit | $2.50-3.90 | ✅ | Revendeurs GW/M365 |
| Google Workspace direct | ~$8.40 | Reseller API | Cher en direct ; ~$2.50 en revendeur |
| Microsoft 365 direct | ~$6 | Graph API | Filtrage plus agressif, cap Azure ACS 96k |

### Dédié vs pool vs many-mailboxes
**Many-mailboxes gagne** : la réputation 2026 est **niveau domaine/sender**, pas juste IP. Une IP dédiée ($50-90/mo) a besoin de volume constant que le cold (30-50/inbox/jour) **affame**. Étaler sur beaucoup d'identités à faible volume isole le blast radius : si une inbox/domaine crame, on la **rotate** (~$50-200/trimestre de remplacement de domaines).

### DNS automation
**API Cloudflare** = standard : MX, SPF `v=spf1 include:<provider> ~all`, DKIM, DMARC `p=none` ->`quarantine`, CNAME tracking. ⚠️ Règle Cloudflare juin 2025 : SPF **ou** DKIM obligatoire. Les providers d'infra automatisent déjà ça en ~5 min/domaine.

### Archi de rotation (à répliquer)
- 2-3 mailboxes/domaine ; cap **30-50/inbox/jour** ; ramp à la création.
- Moteur round-robin biaisé vers les inbox saines.
- 6 métriques santé/jour : bounce (inbox), plaintes (domaine), **Google Postmaster** rep, open-rate, pass DKIM/SPF/DMARC, volume.
- **Auto-pause** : inbox qui dérive -> bascule son volume vers les saines **sans pauser la campagne** -> re-warm.

### Reco build-vs-buy
**Path A (lancer vite)** : intégrer **l'API Maildoso** (provisioning + DNS) et **construire uniquement la couche à valeur** (rotation, health, auto-pause, orchestration) : là où est la différenciation. Garder **Resend (région EU)** pour le transactionnel/réponses.
**Path B (marge long terme)** : devenir **revendeur Google Workspace** (Reseller API + Admin SDK, ~$2.50/mailbox) + Cloudflare API DNS. Meilleure délivrabilité (vraies inbox GW), meilleures unit economics, mais lift conformité/ops.
**Ne PAS** construire sa propre flotte SMTP/IP dédiées pour le cold.

---

## Synthèse : impact produit

Ces 3 chantiers transforment Phantera de « séquenceur email-only » en **plateforme outbound pertinente** :
1. **Data waterfall** -> +25-40 pts de match email, bounce <2%, GDPR-défendable -> le scoring IA devient enfin utile (garbage out -> quality out).
2. **Signaux d'intent** -> on touche au **bon moment** -> c'est ce qui transforme « SDR IA » de slogan en produit.
3. **Infra mailboxes + rotation** -> on **protège les domaines des clients** = le **#1 driver d'achat** du marché.

**Priorité d'intégration** : (1) infra mailboxes Maildoso + garde-fous délivrabilité, (2) data waterfall EU (Dropcontact+Cognism+fillers), (3) signaux funding+hiring+technographics.

---

## Sources principales
- **Data** : Dropcontact Email Finder Benchmark 2025 (20K) · Cognism compliance/vs-Apollo · FullEnrich/Surfe/LeadMagic waterfall · Kaspr vs Cognism · PDL/Lusha pricing · GDPR FR/DE (UWG §7).
- **Signaux** : UserGems/Champify (job change) · Specter/Crunchbase (funding) · TheirStack/PredictLeads (hiring) · Wappalyzer/BuiltWith (tech) · Snitcher/Dealfront (de-anon EU) · CJEU *Breyer* C-582/14 · IAB Europe (Bruxelles 14/05/2025) · CNIL KASPR €240K · G2/Bombora.
- **Infra** : Maildoso/Mailforge API · Google Reseller API + Admin SDK · Cloudflare DNS API (règle juin 2025) · Postmark EU privacy / SES AUP · Instantly/Smartlead/Salesforge infra teardowns · Litemail inbox-health metrics 2026.
