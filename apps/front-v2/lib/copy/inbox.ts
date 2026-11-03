/**
 * Texts of /dashboard/inbox, word for word from body n°1
 * (app/(dashboard)/dashboard/inbox/page.tsx, components/dashboard/inbox/*).
 */
import type { BadgeTone } from '@/components/ui'

const s = (n: number) => (n > 1 ? 's' : '')

/** A person said yes: signal. A person said no: danger. Everything else: neutral. */
export const CLASSIF: Record<string, { label: string; tone: BadgeTone; dot: string }> = {
  POSITIVE:        { label: 'Positive',      tone: 'signal',  dot: 'bg-signal' },
  MEETING_REQUEST: { label: 'Rendez-vous',   tone: 'signal',  dot: 'bg-signal' },
  NEGATIVE:        { label: 'Négative',      tone: 'danger',  dot: 'bg-danger' },
  NOT_INTERESTED:  { label: 'Pas intéressé', tone: 'neutral', dot: 'bg-quiet' },
  NEUTRAL:         { label: 'Neutre',        tone: 'neutral', dot: 'bg-quiet' },
}

export const inboxCopy = {
  title: 'Réponses',
  /** After the figure: « 12 » + « réponses ». */
  countWord: (n: number) => ` réponse${s(n)}`,
  sorted: ' · classées automatiquement',
  filtersLabel: 'Filtrer les réponses',
  filters: [
    { key: 'all', label: 'Toutes' },
    { key: 'positive', label: 'Positives' },
    { key: 'meeting', label: 'Rendez-vous' },
    { key: 'negative', label: 'Négatives' },
    { key: 'unread', label: 'Non lues' },
  ] as const,
  ago: (iso: string) => {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
    if (min < 1) return "à l'instant"
    if (min < 60) return `il y a ${min} min`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `il y a ${hr} h`
    const days = Math.floor(hr / 24)
    if (days < 7) return `il y a ${days} j`
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  },
  unread: 'Non lue. ',
  placeholderTitle: 'Sélectionnez une réponse pour la lire en entier',
  placeholderBody: 'Chaque réponse est classée automatiquement',
  empty: {
    all: { title: 'Aucune réponse pour le moment', subtitle: 'Lancez une campagne : les réponses arriveront ici, classées automatiquement.' },
    positive: { title: 'Aucune réponse positive', subtitle: 'Les réponses positives apparaîtront ici.' },
    meeting: { title: 'Aucune demande de rendez-vous', subtitle: 'Quand un prospect propose un échange, il apparaît ici.' },
    negative: { title: 'Aucune réponse négative', subtitle: 'Les refus et les « pas intéressé » apparaîtront ici.' },
    unread: { title: 'Tout est lu', subtitle: 'Aucune réponse non lue.' },
  },
  pagination: 'Pagination des réponses',
  prev: 'Page précédente',
  next: 'Page suivante',
  page: 'Page',
  close: 'Fermer',
} as const

export const replyCopy = {
  linkedinReply: 'Réponse LinkedIn',
  close: 'Fermer la réponse',
  aiScore: 'Score IA',
  inReplyTo: 'En réponse à',
  replyEmail: 'Répondre par e-mail',
  seeCampaign: 'Voir la campagne',
  campaign: (name: string) => `Campagne : ${name}`,
  mailSubjectDefault: 'Re: votre réponse',
  wrote: (when: string, firstName: string) => `Le ${when}, ${firstName} a écrit :`,
  replyLinkedin: 'Répondre via LinkedIn',
  linkedinVia: 'Réponse LinkedIn : via votre compte connecté',
  closeLinkedin: 'Fermer la réponse LinkedIn',
  yourReply: (name: string) => `Votre réponse à ${name}`,
  yourReplyPh: (name: string) => `Votre réponse à ${name}…`,
  sendFailed: 'Envoi impossible',
  network: 'Erreur réseau : réessayez',
  sent: 'Message envoyé dans la conversation LinkedIn',
  sending: 'Envoi…',
  send: 'Envoyer',
} as const

export const lockedCopy = {
  plan: 'Formule Business',
  title: 'Réponses',
  body: 'Toutes les réponses de vos prospects au même endroit, classées automatiquement (positive, rendez-vous, négative, pas intéressé). Chaque réponse s\'ouvre avec le prospect, sa campagne et le message auquel il répond.',
  perks: [
    'Réponses e-mail et LinkedIn réunies',
    "Classement par l'IA avec indice de confiance",
    "Réponse préparée dans votre messagerie, message d'origine cité",
    'Filtres : positives, rendez-vous, négatives, non lues',
  ],
  upgradeHref: '/dashboard/settings?tab=billing',
  upgrade: 'Passer à Business : ',
  perMonth: '/mois',
  annual: (discount: number) => (discount > 0 ? `-${discount} % en annuel, ` : ''),
  noCommitment: 'sans engagement',
} as const
