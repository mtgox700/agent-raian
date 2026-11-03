/**
 * Blog articles, kept as typed data like the comparison pages: rendered
 * statically, no Markdown parser, no HTML injection. Every figure in an
 * article must come from the product, the War Room journal or a cited source.
 */

import { AYOUB } from './blog-authors'
import { rulesArticles } from './blog-rules'

export type ArticleBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; title: string; text: string }

export interface ArticleSource {
  label: string
  url: string
}

export interface ArticleFaq {
  question: string
  answer: string
}

export type Topic = 'delivrabilite' | 'reglementation' | 'multicanal' | 'coulisses'

export const TOPIC_LABELS: Record<Topic, string> = {
  delivrabilite:  'Délivrabilité',
  reglementation: 'Règles de la prospection',
  multicanal:     'Multicanal',
  coulisses:      'Coulisses',
}

export interface Article {
  slug: string
  title: string
  description: string
  publishedOn: string
  /** Last substantive update, when it differs from the publication date. */
  updatedOn?: string
  author: { name: string; url: string }
  topics: Topic[]
  blocks: ArticleBlock[]
  /** Short questions and answers, also published as FAQPage data for search and AI answers. */
  faq?: ArticleFaq[]
  sources: ArticleSource[]
}


const WORDS_PER_MINUTE = 220

export const articles: Article[] = [
  {
    slug: '1000-e-mails-depuis-une-seule-boite',
    title: '1 000 e-mails depuis une seule boîte : le calcul honnête',
    description:
      'Pourquoi envoyer 1 000 e-mails de prospection d\'un coup depuis votre boîte grille votre domaine, ce que Gmail et Outlook exigent depuis 2024 et 2025, et le rythme réel qu\'il faut prévoir.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['delivrabilite'],
    blocks: [
      { type: 'p', text: 'Quand on a une liste de 1 000 prospects, l\'envie est de tout envoyer ce matin. J\'ai moi-même demandé à Phantera de le faire, depuis une seule boîte mail. Nous avons dit non. Voici pourquoi, chiffres à l\'appui.' },
      { type: 'h2', text: 'Ce que voient Gmail et Outlook' },
      { type: 'p', text: 'Pour un fournisseur de messagerie, une boîte qui envoie soudain des centaines de messages à des inconnus ressemble à une boîte piratée. Les filtres regardent trois choses : qui vous êtes (votre domaine est-il authentifié ?), comment vous envoyez (volume, régularité) et comment les destinataires réagissent (plaintes, désinscriptions, réponses).' },
      { type: 'p', text: 'Le domaine qui en pâtit, c\'est celui de votre société : celui de vos devis, de vos factures et de vos échanges avec vos clients.' },
      { type: 'h2', text: 'Les règles écrites en 2024 et 2025' },
      { type: 'ul', items: [
        'Gmail demande à tous les expéditeurs d\'authentifier leurs e-mails avec SPF et DKIM.',
        'À partir de 5 000 messages par jour vers Gmail, il exige en plus DMARC, un désabonnement en un clic et un taux de plaintes sous 0,30 % (0,10 % recommandé). Yahoo a adopté des règles comparables en février 2024.',
        'Depuis le 5 mai 2025, Microsoft impose SPF, DKIM et DMARC aux gros expéditeurs vers Outlook.com.',
      ] },
      { type: 'p', text: 'À 30 e-mails par jour, vous n\'êtes pas un gros expéditeur. Mais l\'authentification vous concerne déjà, et ces règles montrent ce que les filtres valorisent : un expéditeur identifiable, un rythme régulier, des destinataires qui ne se plaignent pas.' },
      { type: 'h2', text: 'Le calcul' },
      { type: 'p', text: 'Phantera envoie un e-mail à la fois par boîte, avec un écart de 20 à 45 secondes entre deux envois. C\'est au maximum 80 à 180 e-mails par heure. Le plafond quotidien, c\'est vous qui le choisissez : 50 par défaut, 500 au maximum, avec un avertissement au-delà de 50.' },
      { type: 'ul', items: [
        '1 000 e-mails au plafond maximum (500 par jour) : au moins 2 jours.',
        '1 000 e-mails au réglage par défaut (50 par jour) : 20 jours.',
      ] },
      { type: 'p', text: 'Au lancement, la campagne passe en file en moins d\'une seconde et Phantera affiche une estimation de durée. Vous n\'attendez pas devant l\'écran : l\'envoi se fait en arrière-plan.' },
      { type: 'h2', text: 'Ce que fait Phantera quand ça coince' },
      { type: 'ul', items: [
        'Si votre fournisseur commence à refuser le volume, la boîte est mise en pause automatiquement et vous êtes prévenu.',
        'Dès que Phantera détecte la réponse d\'un prospect, ou sa désinscription, sa séquence s\'arrête.',
        'Pour une adresse neuve, une montée progressive du volume est proposée en option.',
      ] },
      { type: 'h2', text: 'Et si vous voulez vraiment aller plus vite ?' },
      { type: 'p', text: 'Les outils pensés pour le volume multiplient les boîtes et les domaines d\'envoi, puis les chauffent pendant des semaines. C\'est un métier à part entière. Pour un fondateur qui contacte quelques dizaines de décideurs bien choisis, nous pensons que cela complique plus que cela n\'aide. Si votre modèle exige des milliers d\'envois par jour, un autre outil vous conviendra mieux : nos comparatifs disent lesquels, et pourquoi.' },
      { type: 'callout', title: 'À retenir', text: 'Authentifiez votre domaine avant le premier envoi. Envoyez à un rythme humain. Surveillez rebonds et plaintes. Arrêtez dès qu\'on vous répond. Plus lent, oui. Mais c\'est la différence entre une campagne et un domaine grillé.' },
    ],
    sources: [
      { label: 'Google, Email sender guidelines (consulté le 11 octobre 2026)', url: 'https://support.google.com/a/answer/81126' },
      { label: 'Next, Outlook.com durcit ses exigences pour les gros expéditeurs', url: 'https://next.ink/brief_article/spf-dkim-dmarc-outlook-com-dope-ses-exigences-pour-les-gros-expediteurs/' },
      { label: 'Insider One, les nouvelles exigences de Gmail et Yahoo pour les expéditeurs', url: 'https://insiderone.com/gmail-and-yahoos-new-sender-requirements/' },
    ],
  },
  {
    slug: 'campagne-muette-tests-verts',
    title: '100 prospects, zéro e-mail, des tests tous verts : ce que notre panne nous a appris',
    description:
      'Une campagne Phantera lancée sans qu\'aucun e-mail ne parte, alors que tous les tests passaient. La cause, le correctif, et la règle que tout utilisateur d\'outil de prospection devrait appliquer.',
    publishedOn: '2026-10-12',
    author: AYOUB,
    topics: ['coulisses', 'delivrabilite'],
    blocks: [
      { type: 'p', text: 'Le 7 octobre, une campagne de 100 prospects est lancée sur Phantera. Aucun e-mail ne part. Nos tests automatisés sont tous verts. Voici ce qui s\'est passé, sans rien enjoliver.' },
      { type: 'h2', text: 'Premier diagnostic, premier correctif' },
      { type: 'p', text: 'Le bouton de lancement faisait tout l\'envoi pendant le clic. Notre hébergeur coupe une requête au bout de 60 secondes : la campagne n\'avait pas le temps de démarrer. Nous avons séparé les deux. Le lancement met la campagne en file en moins d\'une seconde, et l\'envoi se fait en arrière-plan, un e-mail à la fois par boîte.' },
      { type: 'p', text: 'Sauf que rien ne partait toujours.' },
      { type: 'h2', text: 'La vraie cause' },
      { type: 'p', text: 'Les tâches de fond de Phantera (envois, relances, lecture des réponses) tournent sur un service d\'exécution séparé. Pour fonctionner, ce service doit pouvoir joindre chaque nouvelle version de notre application après sa mise en ligne. Or nos adresses de déploiement étaient protégées. Depuis le 14 juillet, la synchronisation échouait en silence : les fonctions ajoutées depuis, dont celle qui envoie les e-mails en file, n\'étaient tout simplement pas enregistrées.' },
      { type: 'p', text: 'Nous l\'avons trouvé le 9 octobre, en testant en production avec mes propres adresses.' },
      { type: 'h2', text: 'Pourquoi aucun test ne l\'a vu' },
      { type: 'p', text: 'Les tests vérifient le code. Ici, le code était juste : c\'est ce que la production avait réellement chargé qui ne l\'était pas. Le même jour, ce test réel a trouvé six autres défauts invisibles des tests, parmi lesquels un assistant de campagne bloqué sur une étape et une connexion impossible depuis un nouvel appareil.' },
      { type: 'h2', text: 'Ce que nous avons changé' },
      { type: 'ul', items: [
        'La synchronisation est rétablie et se refait automatiquement après chaque mise en ligne.',
        'Après chaque ajout de tâche de fond, nous vérifions la date de dernière synchronisation et le nombre de fonctions actives.',
        'Chaque parcours important est testé en production, sur nos propres adresses, avant d\'être annoncé.',
      ] },
      { type: 'p', text: 'Le 9 octobre après-midi, le même test a montré cinq e-mails partis en trois à quatre minutes, conformément à l\'estimation affichée, une désinscription prise en compte, et une réponse détectée, classée positive, qui a arrêté la séquence.' },
      { type: 'h2', text: 'La règle qui vaut pour n\'importe quel outil' },
      { type: 'ol', items: [
        'Ouvrez le dossier « Envoyés » de votre boîte : c\'est la seule preuve qu\'un e-mail est parti.',
        'Avant une vraie campagne, envoyez-la à deux ou trois adresses à vous.',
        'Répondez depuis une autre adresse que celle qui envoie, et vérifiez que la séquence s\'arrête.',
      ] },
      { type: 'callout', title: 'Pourquoi nous publions ça', text: 'Au 12 octobre 2026, Phantera n\'a pas encore de client payant. C\'est le meilleur moment pour trouver ces pannes, et le seul moyen honnête de vendre un outil de prospection : montrer ce qui marche, et ce qui a cassé.' },
    ],
    sources: [],
  },
  ...rulesArticles,
]

/** Other articles sharing the most topics with this one, newest first. */
export function relatedArticles(article: Article, limit = 3): Article[] {
  const shared = (other: Article) => other.topics.filter((t) => article.topics.includes(t)).length
  return sortedArticles()
    .filter((other) => other.slug !== article.slug)
    .map((other) => ({ other, score: shared(other) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ other }) => other)
}

export const TOPIC_DESCRIPTIONS: Record<Topic, string> = {
  delivrabilite:  'Faire arriver vos e-mails de prospection en boîte de réception : authentification, rythme d’envoi, plafonds, réputation du domaine.',
  reglementation: 'Ce que la loi et les plateformes autorisent en prospection B2B, canal par canal : e-mail, SMS, WhatsApp. Sources officielles citées.',
  multicanal:     'Combiner e-mail, LinkedIn, SMS et WhatsApp dans une séquence qui respecte le prospect.',
  coulisses:      'Comment nous construisons Phantera : pannes, correctifs et décisions, sans rien enjoliver.',
}

export const TOPICS = Object.keys(TOPIC_LABELS) as Topic[]

export function isTopic(value: string): value is Topic {
  return (TOPICS as string[]).includes(value)
}

export function articlesForTopic(topic: Topic): Article[] {
  return sortedArticles().filter((article) => article.topics.includes(topic))
}

/**
 * A publication day as the full date-time with time zone that Google's
 * Article data expects ("2026-10-12" alone is reported as invalid). Articles
 * are dated by day, so the time is fixed at 09:00 UTC.
 */
export function toIsoDateTime(isoDate: string): string {
  return `${isoDate}T09:00:00+00:00`
}

export function lastModified(article: Article): string {
  return article.updatedOn ?? article.publishedOn
}

export function getArticle(slug: string): Article | undefined {
  return articles.find((article) => article.slug === slug)
}

/** Newest first; on the same day, the article added last comes first. */
export function sortedArticles(): Article[] {
  return articles
    .map((article, index) => ({ article, index }))
    .sort((a, b) => b.article.publishedOn.localeCompare(a.article.publishedOn) || b.index - a.index)
    .map(({ article }) => article)
}

function blockText(block: ArticleBlock): string {
  switch (block.type) {
    case 'ul':
    case 'ol':
      return block.items.join(' ')
    case 'callout':
      return `${block.title} ${block.text}`
    default:
      return block.text
  }
}

export function readingMinutes(article: Article): number {
  const words = article.blocks.map(blockText).join(' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
}

/** « 12 octobre 2026 » from an ISO date, without depending on the server time zone. */
export function formatFrenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
