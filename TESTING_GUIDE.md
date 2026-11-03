# 🧪 Guide de Test : Phantera Phase 2 : AI Lead Pipeline

> **Prérequis** : Avoir un compte sur https://phantera.vercel.app et être connecté.

---

## 📋 Table des matières

1. [Mode Mock (sans clé API)](#1-mode-mock-sans-clé-api)
2. [Test du Pipeline Complet (UI)](#2-test-du-pipeline-complet-ui)
3. [Test des API avec cURL](#3-test-des-api-avec-curl)
4. [Test avec vraies clés API](#4-test-avec-vraies-clés-api)
5. [Test de l'envoi d'emails (Campaign Launch)](#5-test-de-lenvoi-demails-campaign-launch)
6. [Test des Webhooks](#6-test-des-webhooks)
7. [Vérification base de données](#7-vérification-base-de-données)
8. [Checklist complète](#8-checklist-complète)

---

## 1. Mode Mock (sans clé API)

Tous les services (Apollo, Hunter, IA, Resend) fonctionnent **sans clé API réelle**.  
En l'absence de clé, ils retournent des données réalistes simulées.

### Ce qui est mocké

| Service | Quand mock | Ce qu'il retourne |
|---------|-----------|-------------------|
| Apollo | `APOLLO_API_KEY` absent | 15 leads français B2B fictifs |
| Hunter | `HUNTER_API_KEY` absent | Vérification email simulée (80% valid) |
| Claude AI | `ANTHROPIC_API_KEY` absent | Scores IA aléatoires 40-90 |
| Resend | `RESEND_API_KEY` absent | `console.log` + mock ID retourné |

** -> Tu peux tester toute la Phase 2 avec 0 clé API configurée.**

---

## 2. Test du Pipeline Complet (UI)

### Étape 1 : Ouvre la page Leads

1. Va sur https://phantera.vercel.app/dashboard/leads
2. Tu vois la page avec le tableau vide (0 leads) et les stats à zéro

### Étape 2 : Lance la recherche de leads

1. Clique sur le bouton **"Prospecter avec IA"** (bouton cyan en haut à droite)
2. Le **drawer de recherche** s'ouvre sur la droite
3. Remplis le formulaire :
   - **Titres de poste** : Tape `CEO` puis Entrée -> tape `CTO` puis Entrée
   - **Secteur** : `SaaS`
   - **Taille d'entreprise** : Coche `1-10`, `11-50`
   - **Pays** : `France`
   - **Nombre de leads** : 25 (slider)
4. Clique sur **"Lancer le pipeline IA"**

### Étape 3 : Observe le progress widget

En bas à droite, un widget de progression apparaît en temps réel :

```
● Phase 1/3 : Sourcing Apollo...
  Recherche en cours...

● Phase 2/3 : Enrichissement Hunter...
  3/25 emails vérifiés

● Phase 3/3 : Scoring IA...
  10/25 leads scorés

✅ Pipeline terminé !
  🟢 5 FAST_TRACK  🔵 12 NORMAL  🟡 6 NURTURE  ⬛ 2 SKIP
```

### Étape 4 : Explore le tableau

Après le pipeline, les leads apparaissent dans le tableau :

| Colonne | Ce que tu vois |
|---------|---------------|
| Lead | Photo initiales + prénom/nom + email |
| Entreprise | Nom + titre du poste |
| Secteur | Badge arrondi |
| Score IA | Jauge circulaire 0-100 + badge coloré |
| Statut | Badge coloré (Nouveau/Contacté/etc.) |
| Email | ✓ Vérifié (vert) ou ~ Incertain (amber) + confiance % |
| Source | Apollo / CSV / Manuel / IA / LinkedIn |

### Étape 5 : Tester les filtres

- **Barre de recherche** : Tape un nom ou une entreprise -> le tableau se filtre en temps réel
- **Filtres statut** : Clique sur "Contacté", "Qualifié", etc.
- **Tri** : Clique sur l'en-tête de colonne "Score IA" -> tri descendant/ascendant

### Étape 6 : Sélectionner des leads

1. Clique sur les **checkboxes** pour sélectionner des leads
2. La barre d'actions bulk apparaît en bas :
   - **Enrichir les emails** -> Lance Hunter sur la sélection
   - **Scorer avec IA** -> Lance Claude Haiku sur la sélection
   - **Exporter CSV** -> Télécharge un fichier CSV
3. La checkbox d'en-tête sélectionne/désélectionne tout

---

## 3. Test des API avec cURL

> Remplace `YOUR_SESSION_TOKEN` par le cookie de session Clerk depuis les DevTools.

### Obtenir le cookie de session

1. Ouvre https://phantera.vercel.app dans le navigateur
2. F12 -> Application -> Cookies -> `__session`
3. Copie la valeur

### 3.1 : GET /api/leads

```bash
curl -s "https://phantera.vercel.app/api/leads?workspaceId=YOUR_WORKSPACE_ID" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" | jq '.data | length'
# → Retourne le nombre de leads
```

### 3.2: POST /api/leads/search (sans SSE)

```bash
curl -s -X POST "https://phantera.vercel.app/api/leads/search" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "jobTitles": ["CEO", "Founder"],
    "industry": "SaaS",
    "companySizes": ["1_10", "11_50"],
    "country": "France",
    "limit": 10
  }' | jq '.'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "leads": [...],
    "total": 10,
    "saved": 10,
    "duplicates": 0
  }
}
```

### 3.3: POST /api/leads/enrich (batch)

```bash
curl -s -X POST "https://phantera.vercel.app/api/leads/enrich" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "leadIds": ["LEAD_ID_1", "LEAD_ID_2"]
  }' | jq '.'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "enriched": 2,
    "failed": 0,
    "results": [...]
  }
}
```

### 3.4: POST /api/leads/score

```bash
curl -s -X POST "https://phantera.vercel.app/api/leads/score" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "leadIds": ["LEAD_ID_1", "LEAD_ID_2", "LEAD_ID_3"]
  }' | jq '.'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "scored": 3,
    "results": [
      { "leadId": "...", "score": 85, "badge": "FAST_TRACK", "reason": "CEO of a SaaS company..." }
    ]
  }
}
```

### 3.5: GET /api/leads/enrich/[leadId] (single)

```bash
curl -s "https://phantera.vercel.app/api/leads/enrich/LEAD_ID" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" | jq '.'
```

### 3.6: SSE Pipeline (stream)

```bash
curl -s -N -X POST "https://phantera.vercel.app/api/leads/search/stream" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" \
  -d '{
    "workspaceId": "YOUR_WORKSPACE_ID",
    "jobTitles": ["CEO"],
    "limit": 5
  }'
```

**Tu verras le stream SSE en temps réel :**
```
data: {"type":"search_start","message":"Sourcing leads Apollo..."}

data: {"type":"search_done","leads":5,"saved":5}

data: {"type":"enrich_start","total":5}

data: {"type":"enrich_progress","current":1,"total":5,"lead":"Jean Dupont"}

data: {"type":"enrich_done","enriched":5}

data: {"type":"score_start","total":5}

data: {"type":"score_progress","current":5,"total":5}

data: {"type":"score_done","distribution":{"FAST_TRACK":2,"NORMAL":2,"NURTURE":1,"SKIP":0}}

data: {"type":"pipeline_done"}
```

---

## 4. Test avec vraies clés API

### Ajouter les clés dans Vercel

1. Va sur https://vercel.com/ayoubhm07s-projects/phantera/settings/environment-variables
2. Ajoute chaque variable :

| Variable | Où l'obtenir |
|----------|-------------|
| `APOLLO_API_KEY` | https://app.apollo.io -> Settings -> API Keys |
| `HUNTER_API_KEY` | https://hunter.io -> Dashboard -> API |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com -> API Keys |
| `RESEND_API_KEY` | https://resend.com -> API Keys |
| `RESEND_WEBHOOK_SECRET` | Resend -> Webhooks -> (après config) |
| `RESEND_FROM_EMAIL` | `noreply@ton-domaine.com` (domaine vérifié) |

3. Après chaque ajout, clique **Save**
4. Redéploie : `vercel --prod --yes` (depuis `apps/web`)

### Test Apollo réel

Avec `APOLLO_API_KEY` configuré, la recherche utilise la vraie API Apollo.io.
- Vérifie que les leads retournés sont des vrais professionnels
- Check que les `apolloId` sont des strings uniques
- Vérifie la déduplication (relancer la même recherche -> `duplicates > 0`)

### Test Hunter réel

Avec `HUNTER_API_KEY` configuré :
- Lance l'enrichissement sur un lead avec email
- Vérifie que `emailVerified` est `true` pour les emails valides
- Vérifie que `emailConfidence` est entre 0-100

### Test Claude IA réel

Avec `ANTHROPIC_API_KEY` configuré :
- Lance le scoring sur 5 leads
- Vérifie que `scoreReason` est une vraie phrase explicative (pas un mock)
- Vérifie que `badge` correspond bien au score (`>= 80 -> FAST_TRACK`)

---

## 5. Test de l'envoi d'emails (Campaign Launch)

### Prérequis

- Avoir au moins une **campagne en brouillon** (`status: draft`)
- La campagne doit avoir au moins **1 email step**
- Avoir des leads avec `scoreBadge: FAST_TRACK` ou `NORMAL`

### Étape 1 : Créer une campagne test

1. Va sur `/dashboard/campaigns/new`
2. Crée une campagne "Test Phase 2"
3. Ajoute un email step :
   - Sujet : `Bonjour {{firstName}}, votre solution SaaS`
   - Corps : `Bonjour {{firstName}},\n\nJ'ai vu que {{company}} cherche à optimiser sa prospection...`

### Étape 2 : Lancer la campagne

1. Va sur `/dashboard/campaigns`
2. Sur la carte de la campagne draft, **passe la souris dessus**
3. Le bouton **"Lancer"** (rocket icon) apparaît en bas à droite de la carte
4. Clique dessus -> la **dialog de confirmation** s'ouvre

La dialog affiche :
- Nombre de leads qualifiés (FAST_TRACK + NORMAL)
- Emails restants dans ton quota
- Avertissement : action irréversible

5. Clique sur **"Lancer la campagne"**

### Ce qui se passe en backend

```
1. Vérifie le quota d'emails (plan actuel)
2. Récupère les leads qualifiés (FAST_TRACK + NORMAL)
3. Récupère le premier email step de la campagne
4. Pour chaque lead :
   - Rend le template (remplace {{firstName}}, {{company}}, etc.)
   - Envoie via Resend (ou mock si pas de clé)
   - Crée un enregistrement EmailSend en DB
5. Met le status de la campagne à "active"
```

### Test cURL du launch

```bash
curl -s -X POST "https://phantera.vercel.app/api/campaigns/CAMPAIGN_ID/launch" \
  -H "Content-Type: application/json" \
  -H "Cookie: __session=YOUR_SESSION_TOKEN" \
  -d '{"workspaceId": "YOUR_WORKSPACE_ID"}' | jq '.'
```

**Réponse attendue :**
```json
{
  "success": true,
  "data": {
    "sent": 17,
    "failed": 0,
    "campaignId": "..."
  }
}
```

---

## 6. Test des Webhooks

### Webhook Resend (tracking email)

1. Installe ngrok : `npm install -g @ngrok/ngrok`
2. Lance ton app localement : `npm run dev`
3. Expose avec ngrok : `ngrok http 3000`
4. Va sur https://resend.com -> Webhooks -> Add Endpoint
5. URL : `https://ton-tunnel.ngrok.io/api/webhooks/resend`
6. Événements à activer : `email.opened`, `email.clicked`, `email.bounced`, `email.delivered`
7. Copie le **webhook secret** -> ajoute `RESEND_WEBHOOK_SECRET` dans `.env.local`

### Simuler un événement webhook (test local)

```bash
# Simule un "email ouvert"
curl -X POST http://localhost:3000/api/webhooks/resend \
  -H "Content-Type: application/json" \
  -H "svix-id: test_123" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,PLACEHOLDER" \
  -d '{
    "type": "email.opened",
    "data": {
      "message_id": "RESEND_MESSAGE_ID",
      "email_id": "RESEND_MESSAGE_ID"
    }
  }'
```

> Note : En test local sans vrai secret, la vérification de signature est bypassée (erreur 400 attendue).  
> Pour tester proprement, utilise ngrok + vrai secret Resend.

---

## 7. Vérification base de données

### Accès Railway

1. Va sur https://railway.app -> ton projet
2. Clique sur le service PostgreSQL
3. Onglet **"Data"** ou connecte-toi via :

```bash
# Dans apps/web
npx prisma studio
```

### Tables à vérifier

| Table | Ce qui doit exister |
|-------|-------------------|
| `Lead` | Leads sourcés par Apollo |
| `LeadEnrichment` | 1 par lead enrichi par Hunter |
| `EmailSend` | 1 par email envoyé via Resend |

### Requêtes Prisma Studio

Dans Prisma Studio (http://localhost:5555) :

1. **Leads** -> Filtre `scoreBadge = FAST_TRACK` -> vois les meilleurs leads
2. **LeadEnrichment** -> Filtre `emailVerified = true` -> emails vérifiés
3. **EmailSend** -> Filtre `status = SENT` -> emails envoyés

### Run la migration (si DB vierge)

Si tu deploy sur une nouvelle DB Railway :

```bash
cd apps/web
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

---

## 8. Checklist complète

### ✅ Setup de base
- [ ] App accessible sur https://phantera.vercel.app
- [ ] Connexion Clerk fonctionne (sign-in / sign-up)
- [ ] Workspace créé après onboarding
- [ ] Dashboard charge sans erreur

### ✅ Lead Pipeline (Mode Mock)
- [ ] Bouton "Prospecter avec IA" visible sur `/dashboard/leads`
- [ ] Drawer de recherche s'ouvre (animation slide-in)
- [ ] Formulaire de recherche accepte les champs
- [ ] Pipeline SSE se lance -> widget de progression en bas à droite
- [ ] 3 phases affichées : Sourcing -> Enrichissement -> Scoring
- [ ] Leads apparaissent dans le tableau après pipeline
- [ ] Distribution des badges visible à la fin (FAST_TRACK/NORMAL/NURTURE/SKIP)

### ✅ Tableau des Leads
- [ ] Colonnes : Lead, Entreprise, Secteur, Score IA, Statut, Email, Source
- [ ] Jauge de score circulaire s'affiche
- [ ] Badge coloré correspond au score
- [ ] Filtre par statut fonctionne
- [ ] Recherche texte fonctionne (nom, email, entreprise)
- [ ] Tri par colonne fonctionne (clic sur en-tête)
- [ ] Sélection checkbox fonctionne (individuel + tout sélectionner)
- [ ] Barre d'actions bulk apparaît quand leads sélectionnés

### ✅ Bulk Actions
- [ ] "Enrichir les emails" lance Hunter sur la sélection
- [ ] "Scorer avec IA" lance Claude sur la sélection
- [ ] "Exporter CSV" télécharge un fichier CSV valide

### ✅ Campaign Launch
- [ ] Bouton "Lancer" visible au survol des campagnes draft
- [ ] Dialog de confirmation s'ouvre avec infos quota
- [ ] Lancement envoie les emails (ou mock si pas de clé)
- [ ] Campagne passe à status "active" après lancement

### ✅ API (cURL)
- [ ] GET /api/leads retourne les leads
- [ ] POST /api/leads/search retourne et sauvegarde les leads
- [ ] POST /api/leads/enrich enrichit les emails
- [ ] POST /api/leads/score score les leads avec IA
- [ ] GET /api/leads/search/stream retourne un flux SSE valide

### ✅ Sécurité
- [ ] Routes API retournent 401 sans session
- [ ] Routes API retournent 404 si workspaceId ne m'appartient pas
- [ ] Quota respecté (trop de leads -> erreur 402)

---

## 🐛 Problèmes courants

### "Workspace introuvable"
-> L'utilisateur n'a pas de workspace. Va sur `/onboarding` pour en créer un.

### Pipeline SSE bloqué à "Sourcing..."
-> Vérifier les logs Vercel : `vercel logs phantera.vercel.app`  
-> Timeout de 60s dépassé ? Réduire `limit` à 5 leads pour test.

### Leads ne s'affichent pas après pipeline
-> Vider le cache navigateur, rafraîchir la page. Le refetch auto devrait se déclencher.

### "QUOTA_EXCEEDED"
-> Plan FREE limité à 500 leads. Upgrade ou utiliser un workspace test.

### Email non reçu (avec vraie clé Resend)
-> Vérifier que le domaine d'envoi est vérifié dans Resend.  
-> Check la boîte spam.  
-> Vérifier `RESEND_FROM_EMAIL` est un email de domaine vérifié.

---

## 📊 Données Mock de référence

Les leads Apollo mockés incluent :
```
Jean Dupont — CEO, TechVision SaaS, Paris
Marie Martin — CTO, CloudPilot, Lyon
Alexandre Dubois — Founder, DataStream, Bordeaux
Sophie Bernard — VP Sales, SalesForce FR, Paris
Thomas Petit — Head of Growth, GrowthLabs, Nantes
... (15 leads au total)
```

Les scores IA mockés sont aléatoires entre 40-90, avec une distribution réaliste :
- ~20% FAST_TRACK (score ≥ 80)
- ~40% NORMAL (score 50-79)
- ~30% NURTURE (score 25-49)
- ~10% SKIP (score < 25)
