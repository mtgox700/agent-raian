/**
 * Comparison pages ("Alternative à …").
 *
 * Every statement about a competitor comes from its own public page or a
 * named source, read on VERIFIED_ON (War Room study, domains/07). Nothing is
 * stated that the source does not say: when a point could not be checked it
 * is simply left out. Statements about Phantera come from the code (plans,
 * sending engine). Fair comparison only: no disparagement, and each page says
 * when the competitor is the better choice.
 */

import { PLAN_CONFIG } from '@/lib/stripe/plans'

export const VERIFIED_ON = '6 octobre 2026'

export interface ComparisonRow {
  label: string
  competitor: string
  phantera: string
}

export interface Comparison {
  slug: string
  name: string
  /** One-line positioning of the competitor, neutral. */
  summary: string
  rows: ComparisonRow[]
  chooseCompetitor: string[]
  choosePhantera: string[]
  faqs: Array<{ question: string; answer: string }>
  sources: Array<{ label: string; url: string }>
}

const pro = PLAN_CONFIG.PRO
const business = PLAN_CONFIG.BUSINESS
const PHANTERA_PRICE = `${pro.name} ${pro.price} € HT/mois · ${business.name} ${business.price} € HT/mois · formule gratuite pour essayer`
const PHANTERA_CHANNELS = `E-mail (toutes formules payantes), LinkedIn (formule ${business.name}) et SMS (depuis votre propre compte Brevo)`
const PHANTERA_AI = `Scoring des leads, rédaction des séquences avec auto-critique (formules payantes), classement des réponses (formule ${business.name})`
const PHANTERA_SENDING = 'Depuis vos propres boîtes (Gmail, Outlook, SMTP) et votre compte LinkedIn'
const PHANTERA_SAFETY = 'Un message à la fois par boîte, plafond quotidien réglable, arrêt automatique dès que le prospect répond, désinscription en un clic'

/** What Phantera does not do: stated on every page so nobody buys it by mistake. */
export const PHANTERA_LIMITS = [
  'Pas d\'appels ni d\'envoi WhatsApp automatique. Les SMS automatiques partent de votre propre compte Brevo, que vous connectez : leur coût et leur expéditeur sont les vôtres.',
  `LinkedIn passe par un connecteur tiers (Unipile) et n'est inclus qu'à partir de la formule ${business.name}. LinkedIn encadre l'automatisation : Phantera plafonne à 25 actions par jour et par compte.`,
  'Pas de synchronisation CRM native : les leads chauds s\'exportent en CSV.',
  'Pas de garantie de rendez-vous ni de taux de réponse : Phantera publie ce qu\'il mesure, pas des promesses.',
]

export const comparisons: Comparison[] = [
  {
    slug: 'lemlist',
    name: 'lemlist',
    summary: 'Outil français de prospection multicanale (e-mail, LinkedIn, SMS, WhatsApp, appels) avec agents IA.',
    rows: [
      { label: 'Prix d\'entrée', competitor: 'Email 55 $/mois ; Multichannel 87 $/utilisateur/mois (page tarifs officielle)', phantera: PHANTERA_PRICE },
      { label: 'Canaux', competitor: 'E-mail, LinkedIn, SMS, WhatsApp (option), appels', phantera: PHANTERA_CHANNELS },
      { label: 'IA', competitor: 'lemAgent : agents Signal, Enrichissement et Messages, détection d\'intérêt, réponses générées', phantera: PHANTERA_AI },
      { label: 'Données de contact', competitor: 'Crédits de données vendus en option', phantera: `Recherche de décideurs incluse : ${pro.leadsLimit.toLocaleString('fr-FR')} leads/mois en ${pro.name}, ${business.leadsLimit.toLocaleString('fr-FR')} en ${business.name}` },
      { label: 'Hébergement des données', competitor: 'En France chez OVH, rien hors de l\'EEE (déclaration de l\'éditeur)', phantera: 'Prestataires et localisation listés dans la politique de confidentialité' },
      { label: 'Envoi', competitor: 'Non comparé', phantera: PHANTERA_SENDING },
    ],
    chooseCompetitor: [
      'Vous avez besoin de WhatsApp ou des appels dans la même séquence.',
      'L\'hébergement des données en France est un critère éliminatoire pour vous ou vos clients.',
      'Vous voulez une très grande communauté et beaucoup de ressources de formation.',
    ],
    choosePhantera: [
      'Vous voulez que la recherche des décideurs soit incluse dans l\'abonnement, sans crédits de données à acheter à part.',
      'Vous voulez que l\'IA note chaque lead avant le premier message, pour contacter d\'abord les meilleurs.',
      'Vous préférez un outil simple, pensé pour une petite équipe qui prospecte elle-même.',
    ],
    faqs: [
      {
        question: 'Phantera est-il moins cher que lemlist ?',
        answer: `Pas forcément sur l'envoi seul : lemlist affiche 55 $/mois pour l'e-mail (en dollars, taxes non précisées sur la page lue) et Phantera ${pro.price} € HT/mois en ${pro.name}. La différence vient des données : chez Phantera, la recherche de décideurs est incluse (${pro.leadsLimit.toLocaleString('fr-FR')} leads/mois en ${pro.name}), alors que lemlist vend ses crédits de données en option. Comparez le coût total pour votre volume.`,
      },
      {
        question: 'Puis-je passer de lemlist à Phantera sans perdre ma réputation d\'envoi ?',
        answer: 'Phantera envoie depuis vos propres boîtes, avec vos domaines : un message à la fois, jusqu\'au plafond quotidien que vous réglez, et arrêt dès que le prospect répond. La délivrabilité dépend aussi de la configuration de votre domaine (SPF, DKIM, DMARC) et de la qualité de votre liste : aucun outil ne peut la garantir.',
      },
    ],
    sources: [
      { label: 'Tarifs lemlist', url: 'https://www.lemlist.com/pricing' },
      { label: 'lemlist et le RGPD (aide officielle)', url: 'https://help.lemlist.com/en/articles/10213761-how-lemlist-handles-gdpr-compliance' },
    ],
  },
  {
    slug: 'waalaxy',
    name: 'Waalaxy',
    summary: 'Outil français de prospection LinkedIn pour indépendants et TPE, avec l\'e-mail à froid dans sa formule Business.',
    rows: [
      { label: 'Prix d\'entrée', competitor: 'Pro 19 €/mois (LinkedIn seul) ; l\'e-mail à froid arrive avec Business 69 €/mois (page tarifs officielle)', phantera: PHANTERA_PRICE },
      { label: 'Canaux', competitor: 'LinkedIn ; e-mail à partir de la formule Business', phantera: PHANTERA_CHANNELS },
      { label: 'IA', competitor: 'Détection des réponses', phantera: PHANTERA_AI },
      { label: 'Canal principal', competitor: 'LinkedIn', phantera: 'E-mail, LinkedIn en appoint' },
      { label: 'Envoi', competitor: 'Non comparé', phantera: PHANTERA_SENDING },
      { label: 'Garde-fous', competitor: 'Non comparé', phantera: PHANTERA_SAFETY },
    ],
    chooseCompetitor: [
      'Vous prospectez uniquement sur LinkedIn et cherchez le prix le plus bas (19 €/mois).',
      'Vous voulez un outil centré sur les invitations et messages LinkedIn en volume.',
    ],
    choosePhantera: [
      'L\'e-mail est votre canal principal et LinkedIn un complément.',
      'Vous voulez que les décideurs soient trouvés, vérifiés et notés par l\'IA avant tout contact.',
      'Vous voulez limiter la dépendance à LinkedIn, qui restreint régulièrement les outils d\'automatisation.',
    ],
    faqs: [
      {
        question: 'Waalaxy ou Phantera pour une petite équipe ?',
        answer: `Si LinkedIn suffit, Waalaxy Pro à 19 €/mois est moins cher. Si vous prospectez surtout par e-mail, comparez Waalaxy Business (69 €/mois) avec Phantera ${pro.name} (${pro.price} € HT/mois, e-mail) ou ${business.name} (${business.price} € HT/mois, e-mail et LinkedIn).`,
      },
      {
        question: 'Phantera protège-t-il mon compte LinkedIn ?',
        answer: 'Phantera plafonne à 25 actions LinkedIn par jour et par compte et les espace d\'une à deux minutes. Aucun outil ne peut garantir l\'absence de restriction : LinkedIn encadre l\'automatisation dans ses conditions d\'utilisation.',
      },
    ],
    sources: [
      { label: 'Tarifs Waalaxy', url: 'https://www.waalaxy.com/pricing' },
    ],
  },
  {
    slug: 'la-growth-machine',
    name: 'La Growth Machine',
    summary: 'Outil français de prospection multicanale (LinkedIn, e-mail, appels, X), facturé par identité.',
    rows: [
      { label: 'Prix d\'entrée', competitor: 'Basic 60 €/identité/mois ; Pro 120 €/identité/mois (page tarifs officielle)', phantera: PHANTERA_PRICE },
      { label: 'Canaux', competitor: 'LinkedIn, e-mail, appels, X', phantera: PHANTERA_CHANNELS },
      { label: 'IA', competitor: 'Rédaction IA, messages vocaux IA', phantera: PHANTERA_AI },
      { label: 'RGPD', competitor: 'Accord de traitement (DPA) publié', phantera: 'Désinscription en un clic dans chaque e-mail, opposition propagée à toutes les campagnes, prestataires listés' },
      { label: 'Envoi', competitor: 'Non comparé', phantera: PHANTERA_SENDING },
    ],
    chooseCompetitor: [
      'Vous voulez les appels, X et les messages vocaux dans vos séquences.',
      'Vous orchestrez plusieurs identités commerciales avec des scénarios multicanaux avancés.',
    ],
    choosePhantera: [
      'Vous êtes une petite équipe et voulez un prix par espace de travail plutôt que par identité.',
      'Vous voulez que la recherche et le scoring des décideurs soient inclus.',
      `Vous voulez démarrer vite : en ${business.name}, la Campagne express transforme votre site en campagne prête à relire.`,
    ],
    faqs: [
      {
        question: 'Quelle différence de prix entre La Growth Machine et Phantera ?',
        answer: `La Growth Machine facture par identité (60 €/mois en Basic). Phantera facture par espace de travail : ${pro.price} € HT/mois en ${pro.name}, ${business.price} € HT/mois en ${business.name}. L'écart dépend du nombre de personnes qui prospectent.`,
      },
    ],
    sources: [
      { label: 'Tarifs La Growth Machine', url: 'https://lagrowthmachine.com/pricing/' },
    ],
  },
  {
    slug: 'instantly',
    name: 'Instantly',
    summary: 'Outil américain d\'e-mail à froid en volume, avec des agents IA et une base de leads vendue séparément.',
    rows: [
      { label: 'Prix d\'entrée', competitor: 'Growth 47 $/mois pour l\'envoi ; crédits de leads vendus à part, à partir de 47 $/mois (page tarifs officielle)', phantera: PHANTERA_PRICE },
      { label: 'Canaux', competitor: 'E-mail', phantera: PHANTERA_CHANNELS },
      { label: 'IA', competitor: 'AI Sales Agent, Reply Agent, Web Researcher, rédaction', phantera: PHANTERA_AI },
      { label: 'Approche', competitor: 'Envoi en volume, comptes et warm-up illimités', phantera: 'Envoi mesuré : un message à la fois par boîte, plafond quotidien réglable' },
      { label: 'Langue et marché', competitor: 'Éditeur américain', phantera: 'Produit et support en français' },
    ],
    chooseCompetitor: [
      'Vous envoyez de très gros volumes sur de nombreuses boîtes et domaines dédiés.',
      'Vous avez déjà une équipe qui gère domaines, warm-up et rotation de boîtes.',
    ],
    choosePhantera: [
      'Vous prospectez depuis vos vraies boîtes et voulez protéger leur réputation.',
      'Vous voulez un seul abonnement qui inclut la recherche des décideurs.',
      'Vous voulez ajouter LinkedIn à vos séquences.',
    ],
    faqs: [
      {
        question: 'Phantera envoie-t-il autant qu\'Instantly ?',
        answer: 'Non, et c\'est voulu : Phantera envoie depuis vos propres boîtes, un message à la fois, jusqu\'au plafond quotidien que vous choisissez (50 par défaut, 500 au maximum). Pour des dizaines de milliers d\'e-mails par jour sur des domaines dédiés, un outil de volume est plus adapté.',
      },
    ],
    sources: [
      { label: 'Tarifs Instantly', url: 'https://instantly.ai/pricing' },
    ],
  },
]

export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((c) => c.slug === slug)
}
