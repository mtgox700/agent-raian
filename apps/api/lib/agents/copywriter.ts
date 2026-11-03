/**
 * Phantera — Copywriter Agent
 *
 * Generates hyper-personalized B2B email sequences using Claude.
 * Features a self-critique loop: generates → scores → regenerates until score ≥ 75/100.
 *
 * Architecture:
 *   1. Build rich context prompt from ICP + campaign data
 *   2. Generate email draft (Claude streaming)
 *   3. Self-critique: score the draft on 5 dimensions
 *   4. If score < 75 → regenerate with critique as context (max 3 attempts)
 *   5. Stream final approved content to client
 */

import type { WizardChannel } from '@/lib/types/channels'
import { chat, chatStream, extractJson, llmModel } from '@/lib/llm/client'
import { untrustedLine } from '@/lib/security/prompt-guard'
import { humanPunctuation } from '@/lib/text/human-punctuation'
import { brand } from '@/lib/brand'
import { checkGrounding, groundingNote } from '@/lib/agents/grounding'
import {
  INVITE_NOTE_TARGET_MIN,
  INVITE_NOTE_TARGET_MAX,
  estimateRenderedLength,
  fitText,
} from '@/lib/multichannel/linkedin-limits'
import type { EmailTone } from '@/lib/types/campaign-wizard'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CopywriterInput {
  campaignName: string
  goal: string
  industry: string
  targetTitles: string[]
  targetGeos: string[]
  tone: EmailTone
  valueProposition: string
  emailIndex: number      // 0-based position in sequence
  totalEmails: number
  dayOffset: number
  /** Outreach channel — 'linkedin' switches to the dedicated DM prompt
   *  (short, no subject, conversational). Default: 'email'. */
  channel?: WizardChannel
  /** Phone steps (WhatsApp/SMS): who sends, to introduce them in the first line. */
  senderName?: string
  senderCompany?: string
  /** Output language for subject + body. ONE language per campaign —
   *  never bilingual (mass-mail signal). Default: 'fr'. */
  language?: 'fr' | 'en'
}

export interface GeneratedEmail {
  subject: string
  body: string
  score: number
  critiqueNotes: string
  attempts: number
}

export interface CritiqueResult {
  score: number               // 0-100 global
  mentionsRealFact: boolean   // cite un fait vérifiable sur l'entreprise/industrie
  connectsPainPoint: boolean  // adresse une douleur concrète
  peerTone: boolean           // ton peer-to-peer, pas vendeur
  underFiftyWords: boolean    // corps court et dense
  hasOpenQuestion: boolean    // se termine par une question ouverte
  notes: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToneInstruction(tone: EmailTone): string {
  const instructions: Record<EmailTone, string> = {
    professional: 'Ton professionnel et structuré. Phrases complètes, vocabulaire B2B soutenu. Crédible et direct.',
    casual: 'Ton décontracté et humain. Comme si tu écrivais à un ami professionnel. Court, conversationnel, authentique.',
    bold: 'Ton audacieux et disruptif. Commence par une affirmation surprenante ou un chiffre choc. Mémorable et provocateur.',
    consultative: 'Ton consultatif et expert. Partage un insight sectoriel précis avant de proposer de l\'aide. Valeur avant pitch.',
  }
  return instructions[tone]
}

function getGoalContext(goal: string): string {
  const contexts: Record<string, string> = {
    leads: 'Objectif: identifier si le prospect est une bonne fit et ouvrir la conversation. NE PAS pitcher le produit directement.',
    demos: 'Objectif: obtenir un RDV de 20-30min. Proposer une démo concrète avec une valeur claire.',
    sales: 'Objectif: réactiver ou closer. Mentionner ROI concret et créer l\'urgence subtilement.',
    awareness: 'Objectif: partager un insight pertinent et se positionner comme expert. Pas de call-to-action commercial.',
  }
  return contexts[goal] ?? contexts.leads
}

/**
 * Hard language directive injected in every generation prompt. Kept blunt and
 * repeated because language drift is the most common LLM failure here (the
 * prompt scaffolding itself is French, so English output needs strong anchors).
 */
function getLanguageInstruction(language: 'fr' | 'en' = 'fr'): string {
  if (language === 'en') {
    return `LANGUE DE SORTIE : ANGLAIS UNIQUEMENT.
L'objet ET le corps doivent être écrits en anglais natif business
(niveau natif US/UK, pas de traduction littérale du français).
INTERDIT : tout mot français dans le message final, tout message
bilingue (français + traduction). UNE langue, l'anglais.`
  }
  return `LANGUE DE SORTIE : FRANÇAIS UNIQUEMENT.
L'objet ET le corps doivent être écrits en français naturel.
INTERDIT : tout message bilingue (français + traduction anglaise).
UNE langue, le français.`
}

function getEmailPositionContext(index: number, total: number, dayOffset: number): string {
  if (index === 0) return `Premier contact (Jour ${dayOffset}). Établir le contexte, créer la curiosité. Pas de relance mentionnée.`
  if (index === total - 1) return `Dernière relance (Jour ${dayOffset}). Ton plus direct. Mentionner que c'est le dernier message. Clore avec élégance si pas de réponse.`
  return `Relance ${index + 1}/${total} (Jour ${dayOffset}). Apporter une nouvelle information ou angle. Ne pas répéter le précédent.`
}

// ─── Core Prompts ─────────────────────────────────────────────────────────────

// ─── LinkedIn DM generation (dedicated elite prompt) ─────────────────────────
// A LinkedIn DM is NOT a short email: no subject, read on mobile in a chat UI,
// competing with real conversations. The rules below encode what top SDRs do
// (Benchmarks: 20-35% de réponse sur DM bien exécutés vs 5-15% en email).

function buildLinkedInDmPrompt(input: CopywriterInput, previousCritique?: CritiqueResult): string {
  const { campaignName, goal, industry, targetTitles, targetGeos, tone, valueProposition, emailIndex, totalEmails, dayOffset } = input

  const critiqueSection = previousCritique
    ? `\n───────────────────────────────────────────────────────────────────
CRITIQUE DU BROUILLON PRÉCÉDENT (score: ${previousCritique.score}/100)
───────────────────────────────────────────────────────────────────
${previousCritique.notes}
Corrige ces points précisément. Ne répète pas les mêmes erreurs.\n`
    : ''

  return `═══════════════════════════════════════════════════════════════════
PHANTERA : LINKEDIN DM GENERATION ENGINE
Mission : obtenir une RÉPONSE dans une conversation LinkedIn, pas vendre.
Benchmark cible : top 5% des SDR LinkedIn (20-35% de réponse) : atteint
uniquement par des messages courts, humains, contextuels.
═══════════════════════════════════════════════════════════════════
${critiqueSection}
CONTEXTE DE LA CAMPAGNE
- Nom de la campagne       : ${campaignName}
- Objectif                 : ${getGoalContext(goal)}
- Secteur cible            : ${industry || 'B2B général'}
- Titres visés             : ${targetTitles.slice(0, 8).join(', ') || 'décideurs'}
- Zones                    : ${targetGeos.join(', ') || 'France'}
- Ton                      : ${getToneInstruction(tone)}
- Proposition de valeur    : ${valueProposition || 'À déduire du contexte métier'}
- Position dans la séquence: ${getEmailPositionContext(emailIndex, totalEmails, dayOffset)}

${getLanguageInstruction(input.language)}

RÈGLES ABSOLUES DU DM LINKEDIN (non négociables)
1. LONGUEUR : 250-400 caractères MAX. Un DM se lit en 5 secondes sur
   mobile. Chaque mot au-delà divise le taux de réponse.
2. ZÉRO structure d'email : pas de "Bonjour Monsieur X,", pas de
   signature, pas de "Cordialement", pas de paragraphes formels.
   C'est un MESSAGE DE CHAT : commence par "{{firstName}}," ou une
   accroche directe.
3. ZÉRO lien au premier contact (déclencheur spam LinkedIn + tue la
   confiance). Relances : un lien seulement si demandé implicitement.
4. UNE seule idée, UNE seule question. La question finale doit être
   facile à répondre en une ligne (jamais "seriez-vous disponible pour
   un call de 30 minutes" en premier message).
5. CONTEXTUEL, PAS FLATTEUR : référence son rôle/secteur ({{title}},
   {{company}}, {{industry}}) de façon spécifique. INTERDIT :
   "j'ai vu votre profil", "votre parcours impressionnant".
6. Sauts de ligne : 2-3 blocs courts max (lisibilité mobile).
7. LIGNE ROUGE ÉTHIQUE : zéro mensonge, zéro fausse familiarité
   ("suite à notre échange" alors qu'il n'y en a pas eu), zéro fausse
   urgence. On joue la crédibilité long terme du compte de l'utilisateur.
8. Variables disponibles : {{firstName}}, {{company}}, {{title}},
   {{industry}} : utilise-en 2 minimum, naturellement intégrées.

ANTI-PATTERNS (rejet immédiat)
✗ "Je me permets de vous contacter…" (préambule inutile)
✗ Pitch produit complet au premier message
✗ Plus de 450 caractères
✗ Toute formule de politesse d'email (Cordialement, Bien à vous…)
✗ Emoji > 1 (zéro de préférence, ton = ${tone})

FORMAT DE SORTIE : JSON STRICT :
{"subject": "", "body": "<le message LinkedIn>"}
Le champ subject reste VIDE (un DM n'a pas de sujet).`
}

// ─── LinkedIn INVITATION NOTE (first contact, lead not connected) ────────────
// A different exercise from a DM, not a shortened one. LinkedIn caps the note
// at 300 chars on every plan, and the reader has NOT accepted yet: they cannot
// reply, they can only accept or ignore. So the note sells the CONNECTION, not
// the product. Measured sweet spot: 120-180 chars.

function buildLinkedInInvitePrompt(
  input: CopywriterInput,
  previousProblem?: string,
): string {
  const { campaignName, goal, industry, targetTitles, targetGeos, tone, valueProposition } = input

  const retrySection = previousProblem
    ? `\n───────────────────────────────────────────────────────────────────
LE BROUILLON PRÉCÉDENT A ÉTÉ REJETÉ
───────────────────────────────────────────────────────────────────
${previousProblem}
Corrige ce point. La contrainte de longueur est ABSOLUE.\n`
    : ''

  return `═══════════════════════════════════════════════════════════════════
PHANTERA : LINKEDIN INVITATION NOTE ENGINE
Mission : obtenir l'ACCEPTATION d'une invitation. Rien d'autre.
═══════════════════════════════════════════════════════════════════
${retrySection}
CONTEXTE DE LA CAMPAGNE
- Campagne              : ${campaignName}
- Objectif final        : ${getGoalContext(goal)}
- Secteur cible         : ${industry || 'B2B général'}
- Titres visés          : ${targetTitles.slice(0, 8).join(', ') || 'décideurs'}
- Zones                 : ${targetGeos.join(', ') || 'France'}
- Ton                   : ${getToneInstruction(tone)}
- Proposition de valeur : ${valueProposition || 'À déduire du contexte métier'}

${getLanguageInstruction(input.language)}

CE QUE TU ÉCRIS EXACTEMENT
Une note jointe à une demande de connexion LinkedIn. Le destinataire ne
te connaît pas et n'a PAS encore accepté. Il ne peut donc pas te
répondre : il peut seulement accepter ou ignorer. Ta note doit donner
UNE raison crédible d'accepter, pas vendre quoi que ce soit.

RÈGLES ABSOLUES (non négociables)
1. LONGUEUR : ${INVITE_NOTE_TARGET_MIN} à ${INVITE_NOTE_TARGET_MAX} caractères, espaces et
   sauts de ligne compris. LinkedIn coupe à 300 et nous gardons une
   marge pour la substitution des variables. Vise ${INVITE_NOTE_TARGET_MIN}-180 : les
   notes courtes sont MIEUX acceptées que celles qui remplissent tout.
2. AUCUNE QUESTION. Il ne peut pas répondre avant d'accepter : une
   question sonne faux et trahit l'automatisation.
3. ZÉRO LIEN, ZÉRO pièce jointe, ZÉRO numéro de téléphone.
4. ZÉRO PITCH PRODUIT. Pas de fonctionnalités, pas de bénéfices
   chiffrés, pas d'offre. Tu ouvres une porte, tu ne vends pas.
5. UNE seule idée : pourquoi ce contact a du sens entre vous deux.
6. Variables : {{firstName}} obligatoire, plus AU MAXIMUM une autre
   parmi {{company}}, {{title}}, {{industry}}. Chaque variable coûte
   des caractères au rendu final : n'en abuse pas.
7. Pas de formule d'email : ni "Cordialement", ni signature, ni objet.
8. ZÉRO flatterie et ZÉRO mensonge : pas de "votre profil m'a
   impressionné", pas de "suite à notre échange" s'il n'y en a pas eu.
9. Une seule phrase ou deux phrases courtes. Pas de saut de ligne
   multiple : la note s'affiche dans une petite fenêtre.

ANTI-PATTERNS (rejet immédiat)
✗ "Je me permets de vous contacter…"
✗ "J'aimerais échanger 15 minutes avec vous" (c'est un pitch déguisé)
✗ "J'ai vu votre profil et…"
✗ Toute question finale
✗ Plus de ${INVITE_NOTE_TARGET_MAX} caractères

FORMAT DE SORTIE : JSON STRICT :
{"note": "<la note d'invitation>"}`
}

/**
 * WhatsApp / SMS step: a short message the user sends from their own phone.
 * The number is unknown to the prospect, so the sender introduces themself
 * first; SMS gets its STOP line added at send time.
 */
function buildPhoneMessagePrompt(input: CopywriterInput, previousCritique?: CritiqueResult): string {
  const { goal, industry, targetTitles, tone, valueProposition, emailIndex, totalEmails, dayOffset } = input
  const isSms = input.channel === 'sms'
  const sender = [input.senderName, input.senderCompany].filter(Boolean).join(' de ') || 'l’expéditeur'

  const critiqueSection = previousCritique
    ? `\nCRITIQUE DU BROUILLON PRÉCÉDENT (score: ${previousCritique.score}/100)\n${previousCritique.notes}\nCorrige ces points précisément.\n`
    : ''

  return `PHANTERA : MESSAGE ${isSms ? 'SMS (ENVOYÉ AUTOMATIQUEMENT OU DEPUIS LE TÉLÉPHONE DE L’UTILISATEUR)' : 'WHATSAPP ENVOYÉ PAR L’UTILISATEUR DEPUIS SON TÉLÉPHONE'}
Mission : obtenir une réponse courte, en relance d'un email ou d'un message LinkedIn déjà envoyé.
${critiqueSection}
CONTEXTE
- Expéditeur              : ${sender}
- Objectif                : ${getGoalContext(goal)}
- Secteur cible           : ${industry || 'B2B général'}
- Titres visés            : ${targetTitles.slice(0, 8).join(', ') || 'décideurs'}
- Ton                     : ${getToneInstruction(tone)}
- Proposition de valeur   : ${valueProposition}
- Position dans la séquence: ${getEmailPositionContext(emailIndex, totalEmails, dayOffset)}

${getLanguageInstruction(input.language)}

RÈGLES ABSOLUES
1. LONGUEUR : ${isSms ? '220 caractères MAX (la mention STOP est ajoutée ensuite)' : '350 caractères MAX'}.
2. Première phrase : « {{firstName}}, ${sender} » : le prospect ne connaît pas ce numéro.
3. Fais référence au message déjà envoyé, sans prétendre à un échange qui n'a pas eu lieu.
4. UNE seule question, répondable en un mot ou une ligne.
${isSms ? "4b. Le SMS peut partir d'un expéditeur qui ne reçoit pas de réponse : invite à répondre à l'email déjà envoyé (jamais « répondez à ce SMS »).\n" : ''}5. ZÉRO lien, ZÉRO emoji, ZÉRO formule d'email (Cordialement, signature…).
6. N'invente rien sur l'offre : utilise uniquement la proposition de valeur fournie.
7. Variables disponibles : {{firstName}}, {{company}}, {{title}}, {{industry}}.

FORMAT DE SORTIE : JSON STRICT :
{"subject": "", "body": "<le message>"}`
}

function buildGenerationPrompt(input: CopywriterInput, previousCritique?: CritiqueResult): string {
  if (input.channel === 'linkedin') return buildLinkedInDmPrompt(input, previousCritique)
  if (input.channel === 'whatsapp' || input.channel === 'sms') return buildPhoneMessagePrompt(input, previousCritique)

  const { campaignName, goal, industry, targetTitles, targetGeos, tone, valueProposition, emailIndex, totalEmails, dayOffset } = input

  const critiqueSection = previousCritique
    ? `\n───────────────────────────────────────────────────────────────────
CRITIQUE DU BROUILLON PRÉCÉDENT (score: ${previousCritique.score}/100)
───────────────────────────────────────────────────────────────────
${previousCritique.notes}
Corrige ces points précisément dans ce nouveau brouillon. Ne répète
  pas les mêmes erreurs.\n`
    : ''

  return `═══════════════════════════════════════════════════════════════════
PHANTERA : COLD EMAIL GENERATION ENGINE
Mission : maximiser le taux de réponse positive qualifiée
Benchmark cible : top 5% du marché B2B cold email (15-25% réponse totale,
                  5-10% réponse positive qualifiée)
═══════════════════════════════════════════════════════════════════

Tu es un copywriter B2B cold email senior, 15 ans d'expérience,
ayant écrit des séquences pour des SaaS qui ont scalé de 0 à 8 chiffres
d'ARR. Tu connais la psychologie de la persuasion (Cialdini), la
deliverability email, et tu sais que le cold email a un plafond
réel : ton métier est de s'en approcher, pas de prétendre le dépasser.

NOTE DE CALIBRAGE HONNÊTE :
Aucun cold email, peu importe sa qualité, n'obtient >30% de réponse
positive. Le marché converge vers 8-15% de réponse totale pour les
meilleures séquences. Ton objectif : viser le haut de cette fourchette
par la pertinence et la spécificité, jamais par des promesses
exagérées ou des techniques de manipulation qui détruisent la
réputation de domaine de ${brand.name} sur le long terme.

───────────────────────────────────────────────────────────────────
CONTEXTE DE LA CAMPAGNE
───────────────────────────────────────────────────────────────────
- Nom de la campagne       : ${campaignName}
- Objectif                 : ${getGoalContext(goal)}
- Secteur cible             : ${industry}
- Titres ciblés             : ${targetTitles.join(', ') || 'Décideurs B2B'}
- Zones géographiques       : ${targetGeos.join(', ') || 'France'}
- Ton                       : ${getToneInstruction(tone)}
- Proposition de valeur     : ${valueProposition || 'À déduire du contexte métier'}
- Position dans la séquence : ${getEmailPositionContext(emailIndex, totalEmails, dayOffset)}

${getLanguageInstruction(input.language)}

Données disponibles par lead : {{firstName}}, {{company}}, {{title}},
{{industry}}. AUCUNE autre donnée n'est disponible : pas d'actualité
entreprise, pas de signal d'intention, pas de stack technique détectée.

───────────────────────────────────────────────────────────────────
RÈGLE D'OR : NE JAMAIS FAUSSE-PERSONNALISER
───────────────────────────────────────────────────────────────────
Comme tu n'as QUE firstName/company/title/industry, tu n'as PAS le
droit d'inventer ou de feindre une connaissance précise du lead.

INTERDIT (détecté instantanément comme faux par le destinataire) :
✗ "J'ai vu que {{company}} vient de lever des fonds..."
✗ "J'ai remarqué votre récent post sur..."
✗ "Félicitations pour votre nouvelle fonction de {{title}}..."
   (sauf si la séquence cible explicitement les nouveaux entrants
   au poste : à vérifier dans l'objectif)

AUTORISÉ ET PUISSANT : personnalisation par inférence métier :
✓ Articuler un problème spécifique au {{title}} dans {{industry}}
  que toi, expert depuis 15 ans, sais être réel et douloureux
✓ Utiliser {{industry}} pour calibrer le vocabulaire et les
  exemples (un CFO en SaaS n'a pas les mêmes priorités qu'un
  CFO en industrie manufacturière)
✓ Nommer une conséquence métier précise plutôt qu'un bénéfice vague
✓ Référencer un pattern observable dans {{industry}} sans prétendre
  l'avoir observé spécifiquement chez {{company}}

La personnalisation ne vient pas de "je sais des choses sur toi"
mais de "je comprends ton métier mieux que 95% des gens qui
t'écrivent."

───────────────────────────────────────────────────────────────────
ARCHITECTURE PSYCHOLOGIQUE DE L'EMAIL
───────────────────────────────────────────────────────────────────
Avant d'écrire, raisonne en silence sur ces 4 points (ne les
affiche JAMAIS dans le JSON final, ils guident uniquement ta rédaction) :

1. DOULEUR SPÉCIFIQUE : Quel est LE problème le plus probable et le
   plus coûteux qu'un {{title}} dans {{industry}} vit aujourd'hui, en
   lien avec la proposition de valeur ? Pas générique : LE problème
   qui le fait dire "ah merde, oui" en lisant la phrase.

2. PATTERN INTERRUPT : La première ligne casse le pattern du cold
   email générique. Pas de compliment vide, pas de "J'espère que vous
   allez bien". Soit une observation métier pointue, soit une question
   qui présuppose une réalité qu'il vit vraiment.

3. CRÉDIBILITÉ SANS PREUVE SOCIALE LOURDE : Sans logos clients à citer,
   la crédibilité vient de la précision du langage. Parler EXACTEMENT
   le jargon et les enjeux du métier du lead rend instantanément plus
   crédible qu'un message vague, même sans case study.

4. FRICTION MINIMALE DE LA CTA : La question finale demande le minimum
   d'engagement. "15 min cette semaine ?" engage plus que "Êtes-vous
   intéressé par une démo ?". Une question à faible coût psychologique
   convertit mieux. Ouverte = "qui n'est pas un simple oui/non
   réflexe", PAS "qui demande un effort de réponse long".

───────────────────────────────────────────────────────────────────
LEVIERS DE PERSUASION (Cialdini) : appliqués avec finesse
───────────────────────────────────────────────────────────────────
Intègre UN à DEUX de ces leviers maximum par email, de façon
invisible et naturelle. Jamais empilés, jamais explicites. Le lecteur
ne doit pas sentir la technique, juste avoir envie de répondre.

- AUTORITÉ : démontre-la par la précision du diagnostic métier, jamais
  par l'auto-proclamation ("nous sommes leaders"). Connaître le vrai
  problème du {{title}} EST la preuve d'autorité.

- PREUVE SOCIALE par inférence : "la plupart des {{title}} en
  {{industry}} que je croise ont ce même angle mort" : vrai, vérifiable,
  crée un effet de norme sans citer de faux clients.

- AVERSION À LA PERTE > attrait du gain : un decision maker réagit plus
  fort au coût de l'inaction ("ce que ça coûte de ne rien faire")
  qu'au bénéfice promis. Cadre la douleur, pas le rêve.

- RÉCIPROCITÉ : offre une micro-valeur GRATUITE dans le mail même (un
  insight, une observation utile) avant toute demande. Donner d'abord.

- COHÉRENCE / micro-engagement : la CTA demande un OUI minuscule et
  facile, qui ouvre la porte à un engagement plus grand ensuite.

- EFFET DE CADRAGE : positionne ton offre comme la suite logique d'un
  problème déjà admis, pas comme une nouveauté à évaluer.

LIGNE ROUGE ÉTHIQUE (non négociable) : persuasion ≠ manipulation.
Zéro mensonge, zéro fausse rareté, zéro fausse preuve sociale, zéro
pretexting (se faire passer pour ce qu'on n'est pas). Ces tactiques
boostent peut-être un mail isolé mais détruisent la réputation de
domaine de ${brand.name} et exposent au RGPD. On joue le long terme.

───────────────────────────────────────────────────────────────────
ADAPTATION SELON POSITION DANS LA SÉQUENCE
───────────────────────────────────────────────────────────────────
1er contact :
- Pure pertinence métier. Aucune mention qu'on a déjà écrit. But
  unique : obtenir une réponse, même un "pas le bon moment".

Relance intermédiaire :
- JAMAIS répéter l'angle du mail précédent. Apporter un NOUVEL angle
  (stat métier, question différente, changement de cadrage). Une ligne
  reconnaît implicitement l'absence de réponse SANS culpabiliser
  ("je sais que ça part vite" plutôt que "vous n'avez pas répondu").

Dernière relance :
- Technique du "breakup email" : ton calme, on referme la porte
  proprement : ce qui génère souvent la meilleure réponse car ça
  retire toute pression perçue. Ex : "je n'insisterai pas plus, mais
  si {pain point} devient prioritaire, je reste disponible."
${critiqueSection}
───────────────────────────────────────────────────────────────────
RÈGLES ABSOLUES DE FORMAT (violation = rejet immédiat)
───────────────────────────────────────────────────────────────────
1. Corps : maximum 5 phrases. Pas une de plus.
2. Objet : max 8 mots, pas de majuscules marketing, pas de ponctuation
   excessive (!!! ou ???). Ressemble à un email d'un collègue, pas à
   une newsletter.
3. Variables autorisées : {{firstName}}, {{company}}, {{title}},
   {{industry}} : uniquement celles-ci, jamais d'autres inventées.
4. Commencer par le prénom. JAMAIS "Je me permets de...", "J'espère
   que vous allez bien", "Je voulais prendre contact".
5. Terminer par UNE seule question, à faible coût de réponse (pas un
   oui/non réflexe, mais courte à répondre).
6. Zéro jargon corporate : synergie, solution, valeur ajoutée,
   accompagner, disruptif, levier, optimiser (sauf si {{industry}}
   rend le mot naturel et non-marketing dans ce contexte précis).
7. Pas de pièce jointe, pas de lien dans le 1er contact.
8. NE SIGNE JAMAIS l'email. Aucun bloc signature, aucun nom ou rôle
   d'expéditeur (tu ne les connais pas : tout nom serait INVENTÉ, donc
   un mensonge). La signature professionnelle réelle de l'expéditeur
   est ajoutée automatiquement à l'envoi. Termine le corps directement
   sur la question finale.
9. Aucune fausse urgence ("offre limitée", "derniers jours"), signal
   #1 de spam pour un decision maker B2B.
10. Aucune affirmation chiffrée non vérifiable ("on aide à économiser
    40%") sauf si la proposition de valeur la fournit explicitement.
11. INTERDIT : le tiret cadratin (—) et le tiret demi-cadratin (–).
    Ces caractères sont LE signal #1 qu'un message est généré par IA : un humain ne les tape jamais au clavier. Utilise à la place une
    virgule, un point, deux-points, ou des parenthèses. Idem : pas de
    "..." excessifs, pas de listes à puces dans le corps. Écris comme
    un humain tape dans Gmail, pas comme un modèle qui formate.

───────────────────────────────────────────────────────────────────
AUTO-CRITIQUE AVANT DE LIVRER (silencieuse, jamais affichée)
───────────────────────────────────────────────────────────────────
- Puis-je envoyer ça à 1000 personnes du même {{title}}/{{industry}}
  et que ça sonne toujours pertinent et pas générique ?
- Si je recevais ce mail en tant que {{title}}, le lirais-je jusqu'au
  bout ?
- Ai-je inventé un fait que je ne peux pas connaître sur ce lead ?
  Si oui, réécrire.
- Ça ressemble à un template à variables, ou à un message écrit par
  un humain qui comprend le métier du lead ?

───────────────────────────────────────────────────────────────────
FORMAT DE SORTIE : JSON strict, rien d'autre
───────────────────────────────────────────────────────────────────
{
  "subject": "objet de l'email ici",
  "body": "corps de l'email, terminé par la question finale : SANS signature"
}`
}

function buildCritiquePrompt(subject: string, body: string, input: CopywriterInput): string {
  // LinkedIn DMs are judged on DM criteria: no subject line exists, and the
  // length ceiling is characters-in-chat, not email words.
  // Phone messages are judged like LinkedIn DMs: short chat messages.
  if (input.channel === 'linkedin' || input.channel === 'whatsapp' || input.channel === 'sms') {
    return `Tu es un expert en prospection LinkedIn B2B. Évalue ce MESSAGE DIRECT (DM) avec une notation stricte.

## Message à évaluer (DM LinkedIn : pas d'objet)
${body}

## Contexte
- Secteur: ${input.industry}
- Titres ciblés: ${input.targetTitles.join(', ') || 'Décideurs B2B'}
- Ton demandé: ${input.tone}
- Objectif: ${input.goal}
- Langue attendue: ${input.language === 'en' ? 'ANGLAIS uniquement' : 'FRANÇAIS uniquement'} (message dans une autre langue ou bilingue = score < 50 et peerTone false)

## Critères d'évaluation (20 points chacun)
1. **mentionsRealFact** : compréhension métier précise du {{title}} dans {{industry}}. PÉNALISER toute fausse-personnalisation ou fausse familiarité.
2. **connectsPainPoint** : douleur réelle et spécifique au métier.
3. **peerTone** : ton conversationnel de chat, égal-à-égal. PÉNALISER toute structure d'email (formule de politesse, signature) et tout pitch produit complet.
4. **underFiftyWords** : ici : corps ≤ 450 caractères ET aucun lien (true seulement si les deux).
5. **hasOpenQuestion** : se termine par UNE question à FAIBLE friction, répondable en une ligne.

## Format de réponse OBLIGATOIRE (JSON strict)
{
  "score": <0-100>,
  "mentionsRealFact": <true|false>,
  "connectsPainPoint": <true|false>,
  "peerTone": <true|false>,
  "underFiftyWords": <true|false>,
  "hasOpenQuestion": <true|false>,
  "notes": "<feedback actionnable en 2-3 phrases>"
}`
  }

  return `Tu es un expert en cold email B2B. Évalue cet email de prospection avec une notation stricte.

## Email à évaluer
Objet: ${subject}
---
${body}

## Contexte
- Secteur: ${input.industry}
- Titres ciblés: ${input.targetTitles.join(', ') || 'Décideurs B2B'}
- Ton demandé: ${input.tone}
- Objectif: ${input.goal}
- Langue attendue: ${input.language === 'en' ? 'ANGLAIS uniquement' : 'FRANÇAIS uniquement'} (email dans une autre langue ou bilingue = score < 50 et peerTone false)

## Critères d'évaluation (20 points chacun)
1. **mentionsRealFact** : montre une compréhension métier précise du {{title}} dans {{industry}}
   (jargon juste, conséquence concrète). PÉNALISER toute fausse-personnalisation : prétendre
   connaître une actu/levée/post du lead = faux et rédhibitoire (mettre false).
2. **connectsPainPoint** : adresse une douleur réelle et spécifique au métier (pas générique)
3. **peerTone** : ton égal-à-égal, jamais suppliant/vendeur. Se lit comme un collègue expérimenté.
   PÉNALISER fausse urgence, jargon corporate, et TOUTE signature ou nom d'expéditeur inventé
   ("Thomas", "Enterprise Partnerships"…) : l'email doit se terminer sur la question, sans signature
   (elle est ajoutée automatiquement à l'envoi).
4. **underFiftyWords** : corps < 50 mots (compter hors signature)
5. **hasOpenQuestion** : se termine par UNE question à FAIBLE FRICTION. "Ouverte" = pas un oui/non
   réflexe ET courte à répondre. Une question type "15 min cette semaine ?" est VALIDE (true).
   Une question vague/longue ("seriez-vous intéressé par découvrir comment...") = false.

## Format de réponse OBLIGATOIRE (JSON strict)
{
  "score": <0-100>,
  "mentionsRealFact": <true|false>,
  "connectsPainPoint": <true|false>,
  "peerTone": <true|false>,
  "underFiftyWords": <true|false>,
  "hasOpenQuestion": <true|false>,
  "notes": "<feedback actionnable en 2-3 phrases pour améliorer>"
}`
}

/** Source facts the copy is allowed to draw on (for the grounding guard). */
function buildSourceFacts(input: CopywriterInput): string[] {
  return [
    input.campaignName,
    input.goal,
    input.industry,
    input.valueProposition,
    ...input.targetTitles,
    ...input.targetGeos,
  ].filter((s): s is string => !!s && s.trim().length > 0)
}

/**
 * Applies the hallucination grounding guard to a critique: if the body invents
 * specific figures not in the source facts, force the score below threshold (so
 * the loop regenerates) and append the reason to the notes.
 */
function applyGroundingGuard(critique: CritiqueResult, body: string, input: CopywriterInput): CritiqueResult {
  const grounding = checkGrounding({ body, sourceFacts: buildSourceFacts(input) })
  if (grounding.ok) return critique
  return {
    ...critique,
    mentionsRealFact: false,
    score: Math.min(critique.score, MIN_SCORE - 1),
    notes: `${critique.notes}\n${groundingNote(grounding)}`.trim(),
  }
}

// ─── Anti-AI-tell sanitizer ───────────────────────────────────────────────────

/**
 * Strips the dead giveaways that a message was AI-generated. The em-dash (—) and
 * en-dash (–) are the #1 tell — humans almost never type them. We replace them
 * with human punctuation as a defense-in-depth layer (the prompt also forbids
 * them, but models slip). Applied to every generated subject + body before the
 * critique loop and before persistence.
 */
function stripAiTells(text: string): string {
  return humanPunctuation(text)
    // Three dots or more: another tell, a single period instead.
    .replace(/\.{3,}/g, '.')
}

// ─── Untrusted input, untrusted output ────────────────────────────────────────

/**
 * Campaign fields reach the prompt from the wizard, and the value proposition
 * may have been read from a website by campaign-from-url: each becomes one
 * capped line without delimiter markers, so none can open a new section of
 * the prompt (« NOUVELLES INSTRUCTIONS : … »).
 */
export function sanitizeCopywriterInput(input: CopywriterInput): CopywriterInput {
  return {
    ...input,
    campaignName:     untrustedLine(input.campaignName, 120),
    industry:         untrustedLine(input.industry, 120),
    targetTitles:     input.targetTitles.slice(0, 20).map((t) => untrustedLine(t, 80)).filter(Boolean),
    targetGeos:       input.targetGeos.slice(0, 20).map((g) => untrustedLine(g, 60)).filter(Boolean),
    valueProposition: input.valueProposition ? untrustedLine(input.valueProposition, 1200) : input.valueProposition,
  }
}

export const SUBJECT_MAX = 200
export const BODY_MAX = 5000

/** A subject is one line: a CR/LF from the model could add a mail header. */
export function cleanSubject(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim() : ''
  return stripAiTells(s || fallback).slice(0, SUBJECT_MAX)
}

export function cleanBody(value: unknown, fallback = ''): string {
  const s = typeof value === 'string' ? value : fallback
  return stripAiTells(s).slice(0, BODY_MAX)
}

/** The critique decides whether a draft ships: only numbers and booleans it can really mean. */
export function cleanCritique(value: unknown): CritiqueResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.max(0, Math.min(100, Math.round(raw.score))) : null
  if (score === null) return null
  return {
    score,
    mentionsRealFact:  raw.mentionsRealFact === true,
    connectsPainPoint: raw.connectsPainPoint === true,
    peerTone:          raw.peerTone === true,
    underFiftyWords:   raw.underFiftyWords === true,
    hasOpenQuestion:   raw.hasOpenQuestion === true,
    notes:             typeof raw.notes === 'string' ? raw.notes.slice(0, 500) : '',
  }
}

// ─── Core generation (non-streaming, used internally for critique loop) ───────

async function generateEmailDraft(
  input: CopywriterInput,
  previousCritique?: CritiqueResult
): Promise<{ subject: string; body: string }> {
  const prompt = buildGenerationPrompt(input, previousCritique)

  const text = await chat({ prompt, model: llmModel('copy'), maxTokens: 600, temperature: 0.7, json: true })

  try {
    const jsonMatch = extractJson(text)
    if (!jsonMatch) throw new Error('No JSON found in response')
    const parsed = JSON.parse(jsonMatch) as { subject?: unknown; body?: unknown }
    return {
      subject: cleanSubject(parsed.subject, `Email ${input.emailIndex + 1}`),
      body:    cleanBody(parsed.body),
    }
  } catch {
    // Fallback: try to extract subject/body manually
    const subjectMatch = text.match(/"subject"\s*:\s*"([^"]+)"/)
    const bodyMatch = text.match(/"body"\s*:\s*"([\s\S]+?)"\s*\}/)
    return {
      subject: cleanSubject(subjectMatch?.[1], `Email ${input.emailIndex + 1}`),
      body:    cleanBody(bodyMatch?.[1]?.replace(/\\n/g, '\n') ?? text),
    }
  }
}

async function critiqueEmail(
  subject: string,
  body: string,
  input: CopywriterInput
): Promise<CritiqueResult> {
  const prompt = buildCritiquePrompt(subject, body, input)

  const text = await chat({ prompt, model: llmModel('score'), maxTokens: 300, temperature: 0.2, json: true })

  try {
    const jsonMatch = extractJson(text)
    if (!jsonMatch) throw new Error('No JSON in critique')
    const critique = cleanCritique(JSON.parse(jsonMatch))
    if (!critique) throw new Error('Critique without a numeric score')
    return critique
  } catch {
    return {
      score: 60,
      mentionsRealFact: false,
      connectsPainPoint: true,
      peerTone: true,
      underFiftyWords: true,
      hasOpenQuestion: true,
      notes: 'Critique parsing failed: using default score.',
    }
  }
}

// ─── Public API: generate with self-critique loop ────────────────────────────

const MAX_ATTEMPTS = 3
const MIN_SCORE = 75

export async function generateEmailWithCritique(
  rawInput: CopywriterInput
): Promise<GeneratedEmail> {
  const input = sanitizeCopywriterInput(rawInput)
  let attempts = 0
  let lastCritique: CritiqueResult | undefined

  while (attempts < MAX_ATTEMPTS) {
    attempts++

    // 1. Generate draft
    const { subject, body } = await generateEmailDraft(input, lastCritique)

    // 2. Critique
    const critique = applyGroundingGuard(await critiqueEmail(subject, body, input), body, input)
    lastCritique = critique

    // 3. Accept if score ≥ MIN_SCORE or last attempt
    if (critique.score >= MIN_SCORE || attempts === MAX_ATTEMPTS) {
      return {
        subject,
        body,
        score: critique.score,
        critiqueNotes: critique.notes,
        attempts,
      }
    }
    // Otherwise loop with critique context
  }

  throw new Error('Failed to generate email after max attempts')
}

// ─── Public API: LinkedIn invitation note ────────────────────────────────────

export interface GeneratedInviteNote {
  /** The note TEMPLATE (still contains {{variables}}), guaranteed to fit. */
  note: string
  attempts: number
  /** True when the server had to clamp the model's output to fit the cap. */
  clamped: boolean
}

const INVITE_MAX_ATTEMPTS = 3

/**
 * Deterministic guard rails. The LLM is asked to respect the cap, but we never
 * TRUST it to: the model proposes, the schema disposes. Returns a human-readable
 * problem to feed back into the retry, or null when the note is acceptable.
 */
function validateInviteNote(note: string): string | null {
  const trimmed = note.trim()
  const rendered = estimateRenderedLength(trimmed)

  if (rendered > INVITE_NOTE_TARGET_MAX) {
    return `La note fait environ ${rendered} caractères une fois les variables remplacées, soit ${rendered - INVITE_NOTE_TARGET_MAX} de trop. Raccourcis-la franchement.`
  }
  if (trimmed.length < 40) {
    return 'La note est trop courte pour être crédible. Développe légèrement.'
  }
  if (trimmed.includes('?')) {
    return "La note contient une question. Le prospect ne peut PAS répondre avant d'avoir accepté l'invitation : supprime la question."
  }
  if (/https?:\/\/|www\./i.test(trimmed)) {
    return 'La note contient un lien, ce qui est interdit dans une invitation. Supprime-le.'
  }
  if (!trimmed.includes('{{firstName}}')) {
    return 'La note doit contenir la variable {{firstName}}.'
  }
  return null
}

function stripLinksAndQuestions(note: string): string {
  return note
    .replace(/(https?:\/\/|www\.)\S+/gi, '')
    .replace(/\?/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseInviteNote(raw: string): string {
  try {
    const json = extractJson(raw)
    if (json) {
      const parsed = JSON.parse(json) as { note?: string }
      if (parsed.note) return parsed.note
    }
  } catch {
    // fall through to the regex fallback
  }
  const match = raw.match(/"note"\s*:\s*"([\s\S]+?)"\s*\}/)
  return match?.[1]?.replace(/\\n/g, '\n') ?? raw
}

/**
 * Generate the ≤300-char note attached to a LinkedIn connection request.
 *
 * Used for the FIRST LinkedIn step only: when the lead is not a 1st-degree
 * relation, Phantera sends an invitation instead of a DM, and LinkedIn allows
 * only 300 characters there. Previously the full DM was reused and truncated
 * mid-word (founder report, 2026-09-03).
 *
 * Never throws on length: after MAX attempts the best draft is clamped on a
 * word boundary, so the caller always receives a usable note.
 */
export async function generateInviteNote(
  rawInput: CopywriterInput,
): Promise<GeneratedInviteNote> {
  const input = sanitizeCopywriterInput(rawInput)
  let problem: string | undefined
  let lastDraft = ''

  for (let attempt = 1; attempt <= INVITE_MAX_ATTEMPTS; attempt++) {
    const prompt = buildLinkedInInvitePrompt(input, problem)
    const raw = await chat({
      prompt,
      model: llmModel('copy'),
      maxTokens: 300,
      temperature: 0.7,
      json: true,
    })

    const note = stripAiTells(parseInviteNote(raw)).trim()
    lastDraft = note || lastDraft

    const issue = validateInviteNote(note)
    if (!issue) return { note, attempts: attempt, clamped: false }
    problem = issue
  }

  // Every attempt failed a rule. Links and questions are removed, length is
  // fitted: a clean short note beats no note at all, and the model never gets
  // a link through by failing on purpose.
  return {
    note: fitText(stripLinksAndQuestions(lastDraft), INVITE_NOTE_TARGET_MAX),
    attempts: INVITE_MAX_ATTEMPTS,
    clamped: true,
  }
}

// ─── Streaming version for real-time UI ──────────────────────────────────────

/**
 * Streams the generation process as Server-Sent Events.
 * Emits events: { type: 'status' | 'chunk' | 'done' | 'error', ... }
 */
export async function* generateEmailStream(
  rawInput: CopywriterInput
): AsyncGenerator<string> {
  const input = sanitizeCopywriterInput(rawInput)
  let attempts = 0
  let lastCritique: CritiqueResult | undefined

  while (attempts < MAX_ATTEMPTS) {
    attempts++

    // Emit status
    yield `data: ${JSON.stringify({ type: 'status', message: attempts === 1 ? 'Analyse du contexte ICP...' : `Optimisation (tentative ${attempts})... Score précédent: ${lastCritique?.score}/100` })}\n\n`

    // Build prompt
    const prompt = buildGenerationPrompt(input, lastCritique)

    // Stream the draft
    let fullText = ''
    yield `data: ${JSON.stringify({ type: 'status', message: 'Rédaction de l\'email...' })}\n\n`

    for await (const delta of chatStream({ prompt, model: llmModel('copy'), maxTokens: 600, temperature: 0.7, json: true })) {
      fullText += delta
      yield `data: ${JSON.stringify({ type: 'chunk', text: delta })}\n\n`
    }

    // Parse result
    let subject = ''
    let body = ''
    try {
      const jsonMatch = extractJson(fullText)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch) as { subject?: unknown; body?: unknown }
        subject = cleanSubject(parsed.subject, `Email de prospection ${input.emailIndex + 1}`)
        body = cleanBody(parsed.body)
      }
    } catch {
      subject = cleanSubject(null, `Email de prospection ${input.emailIndex + 1}`)
      body = cleanBody(fullText)
    }

    // Critique phase
    yield `data: ${JSON.stringify({ type: 'status', message: 'Auto-critique en cours...' })}\n\n`
    const critique = applyGroundingGuard(await critiqueEmail(subject, body, input), body, input)
    lastCritique = critique

    yield `data: ${JSON.stringify({ type: 'critique', score: critique.score, notes: critique.notes, criteria: { mentionsRealFact: critique.mentionsRealFact, connectsPainPoint: critique.connectsPainPoint, peerTone: critique.peerTone, underFiftyWords: critique.underFiftyWords, hasOpenQuestion: critique.hasOpenQuestion } })}\n\n`

    if (critique.score >= MIN_SCORE || attempts === MAX_ATTEMPTS) {
      yield `data: ${JSON.stringify({ type: 'done', subject, body, score: critique.score, attempts })}\n\n`
      return
    }

    yield `data: ${JSON.stringify({ type: 'status', message: `Score ${critique.score}/100 < ${MIN_SCORE} : amélioration...` })}\n\n`
  }
}
