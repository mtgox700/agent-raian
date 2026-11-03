/**
 * Texts of the signed-in app (dashboard shell, home, onboarding), copied
 * word for word from body n°1 (apps/front). Kept in code for now: they are
 * structural labels, not marketing copy, and identical for every brand
 * (the brand name comes from `brand`). Components import them from here, so
 * moving them into @phantera/content later is one file.
 *
 * Next screens: add a section per screen below, with body n°1's exact strings.
 */
import { brand } from '@/lib/brand'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

const pro = PLAN_CONFIG.PRO
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one)

/** Sidebar entries. `badge` names the live counter shown beside the label. */
export const NAV_ITEMS = [
  { href: '/dashboard',            label: 'Accueil',      icon: 'home',      badge: null },
  { href: '/dashboard/campaigns',  label: 'Campagnes',    icon: 'campaigns', badge: null },
  { href: '/dashboard/leads',      label: 'Leads',        icon: 'leads',     badge: null },
  { href: '/dashboard/leads/hot',  label: 'Leads chauds', icon: 'hot',       badge: 'hot' },
  { href: '/dashboard/inbox',      label: 'Réponses',     icon: 'inbox',     badge: 'inbox' },
  { href: '/dashboard/a-envoyer',  label: 'À envoyer',    icon: 'send',      badge: 'phone' },
  { href: '/dashboard/analyst',    label: 'Analyste',     icon: 'analyst',   badge: null },
  { href: '/dashboard/analytics',  label: 'Analyses',     icon: 'analytics', badge: null },
  { href: '/dashboard/history',    label: 'Historique',   icon: 'history',   badge: null },
  { href: '/dashboard/settings',   label: 'Paramètres',   icon: 'settings',  badge: null },
] as const

export type NavIcon = (typeof NAV_ITEMS)[number]['icon']

export const shell = {
  defaultWorkspaceName: 'Mon espace',
  planLabel: { FREE: 'Formule gratuite', STARTER: 'Formule Starter', PRO: 'Formule Pro', BUSINESS: 'Formule Business', ENTERPRISE: 'Formule Entreprise' } as Record<string, string>,
  navLabel: 'Navigation de l’espace',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  expand: 'Déplier le menu',
  collapse: 'Replier le menu',
  unreadReplies: (n: number) => `${n} réponse${n > 1 ? 's' : ''} non lue${n > 1 ? 's' : ''}`,
  toSend: (n: number) => `${n} message${n > 1 ? 's' : ''} à envoyer`,
  // The upsell says what Pro really adds (lib/stripe/plans.ts), nothing more.
  upsellTitle: `Passer à ${pro.name}`,
  upsellBody: `${pro.leadsLimit.toLocaleString('fr-FR')} leads par mois, campagnes illimitées et rédaction par l’IA avec auto-critique.`,
  upsellCta: 'Voir les formules',
  upsellHref: '/dashboard/settings?tab=billing',
  switchWorkspace: 'Changer d’espace de travail',
  switchFailed: 'Impossible d’ouvrir cet espace.',
} as const

export const notificationsCopy = {
  title: 'Notifications',
  bellLabel: (n: number) => (n > 0 ? `Notifications, ${n} non lue${n > 1 ? 's' : ''}` : 'Notifications'),
  unreadSuffix: ' non lues',
  unreadPrefix: 'Non lue : ',
  readAll: 'Tout lire',
  readAllTitle: 'Tout marquer comme lu',
  close: 'Fermer les notifications',
  empty: 'Aucune notification',
  justNow: "à l'instant",
} as const

export const errorCopy = {
  eyebrow: 'Erreur de chargement',
  title: 'Cette page n’a pas pu se charger.',
  body: 'L’erreur a été signalée à notre équipe. Vos campagnes continuent de tourner normalement.',
  reference: 'Référence : ',
  retry: 'Réessayer',
  back: 'Retour au tableau de bord',
  loading: 'Chargement',
} as const

export const home = {
  hello: (firstName: string) => `Bonjour, ${firstName}`,
  newCampaign: 'Nouvelle campagne',
  newCampaignHref: '/dashboard/campaigns/new',
  snapshot: {
    newLeads: "Nouveaux leads aujourd'hui",
    emailsSent: "E-mails envoyés aujourd'hui",
    replies: "Réponses aujourd'hui",
  },
  campaigns: {
    title: 'Campagnes en cours',
    seeAll: 'Voir tout',
    emptyTitle: 'Aucune campagne active.',
    emptyBody: 'Décrivez votre client idéal : les agents trouvent les leads, écrivent la séquence, et vous la relisez avant l’envoi.',
    create: 'Créer une campagne',
  },
  metric: {
    noData: 'Pas encore de données',
    trendTitle: 'Comparé aux 30 jours précédents',
  },
  chart: {
    title: (days: number) => `Activité sur ${days} jours`,
    series: { leads: 'Leads', emails: 'E-mails', replies: 'Réponses' },
  },
  donut: {
    title: 'Réponses classées',
    period: '30 jours',
    emptyTitle: 'En attente de réponses',
    emptyBody: 'Chaque réponse reçue sera classée ici',
    replies: (n: number) => `${n.toLocaleString('fr-FR')} réponse${n > 1 ? 's' : ''}`,
    centre: (n: number) => plural(n, 'réponse classée', 'réponses classées'),
    interested: 'Positives ou rendez-vous',
    of: (a: number, b: number) => `${a.toLocaleString('fr-FR')} sur ${b.toLocaleString('fr-FR')}`,
  },
  funnel: {
    title: 'Entonnoir des leads',
    total: (n: number) => `${n.toLocaleString('fr-FR')} leads`,
    converted: 'Leads convertis',
  },
  emailHealth: {
    title: 'Santé des envois',
    period: '30 derniers jours',
    emptyTitle: 'Aucun e-mail envoyé',
    emptyBody: 'Les mesures apparaîtront après votre première campagne',
    delivery: 'Livraison',
    open: 'Ouverture',
    openNote: 'indicative, mesure par pixel',
    click: 'Clic',
    delivered: (n: number) => `${n.toLocaleString('fr-FR')} e-mail${n > 1 ? 's délivrés' : ' délivré'}`,
    sentOf: (n: number) => `sur ${n.toLocaleString('fr-FR')} envoyés`,
    on: 'sur',
    sent: 'Envoyés',
    bounces: 'Rebonds',
    bounceRate: 'Taux de rebond',
    noDataLabel: (label: string) => `${label} : pas encore de données`,
  },
  activity: {
    title: 'Activité réelle',
    refreshNote: 'mise à jour toutes les 30 s',
    refresh: 'Actualiser',
    loading: 'Chargement de l’activité',
    emptyTitle: 'Aucune activité récente',
    emptyBody: 'Lancez une campagne pour commencer',
    /** « il y a 5min », « il y a 3h », « il y a 2j » (body n°1's ActivityFeed). */
    ago: (iso: string) => {
      const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
      if (mins < 1) return 'à l\'instant'
      if (mins < 60) return `il y a ${mins}min`
      const hours = Math.floor(mins / 60)
      return hours < 24 ? `il y a ${hours}h` : `il y a ${Math.floor(hours / 24)}j`
    },
  },
} as const

export const campaignCard = {
  status: {
    active:    { tone: 'accent',  label: 'Active' },
    paused:    { tone: 'warning', label: 'En pause' },
    draft:     { tone: 'neutral', label: 'Brouillon' },
    completed: { tone: 'neutral', label: 'Terminée' },
    archived:  { tone: 'neutral', label: 'Archivée' },
  } as Record<string, { tone: 'accent' | 'warning' | 'neutral'; label: string }>,
  linkedin: 'LinkedIn',
  email: 'E-mail',
  personalised: 'Personnalisée',
  open: (name: string) => `Voir la campagne ${name}`,
  contacted: 'leads contactés',
  contactedLabel: 'Leads contactés',
  openRate: 'Ouverture',
  openHint: 'indicative',
  replyRate: 'Réponse',
  conversion: 'Conversion',
  draft: 'Lancez la campagne pour voir les statistiques',
} as const

export const insightsCopy = {
  severity: { bloquant: 'Bloquant', alerte: 'Alerte', opportunite: 'Opportunité' },
  title: (n: number) => (n > 0 ? `À traiter (${n})` : 'À traiter'),
  snoozed: (n: number) => `${n} alerte${n > 1 ? 's' : ''} en silence`,
  none: 'Aucune alerte : rien ne bloque vos campagnes en ce moment.',
  todo: 'À faire : ',
  openCampaign: 'Ouvrir la campagne',
  since: (date: string) => `depuis le ${date}`,
  snooze: 'Mettre en silence',
  snoozing: 'Mise en silence en cours',
  snoozeFor: (d: number) => `Pendant ${d} jours`,
  snoozeFailed: 'L’alerte n’a pas pu être mise en silence.',
  retry: 'Réessayer',
  errors: {
    401: 'Votre session a expiré : rechargez la page pour voir vos alertes.',
    403: 'Vous n’avez pas accès aux alertes de cet espace.',
    other: (status: number) => `Les alertes n’ont pas pu être chargées (erreur ${status}).`,
    network: 'Les alertes n’ont pas pu être chargées : la connexion a été interrompue.',
  },
  actionFailed: 'L’action n’a pas pu être faite. Réessayez.',
  confirm: 'Confirmer',
  cancel: 'Annuler',
  no: 'Non',
  recentTitle: 'Actions récentes et leur effet',
  on: ' sur ',
  the: (date: string) => ` le ${date}`,
  effect: 'Effet : ',
} as const

export const senderCopy = {
  label: 'Envoyer depuis',
  loading: 'Chargement des boîtes…',
  unavailable: 'Boîtes indisponibles',
  none: `Aucune boîte connectée : les e-mails partiront du domaine partagé de ${brand.name}.`,
  connect: 'Connecter une boîte',
  connectHref: '/dashboard/settings?tab=mailboxes',
  defaultBox: (email?: string) => (email ? `Boîte par défaut (${email})` : 'Boîte par défaut'),
  disconnected: ' (déconnectée)',
  alias: 'Alias : ',
  aliasNote: (email?: string) => `L’alias partage le plafond quotidien et la réputation de ${email} ; les réponses arrivent dans cette boîte.`,
  replyNote: `Les réponses arrivent dans la boîte choisie, où ${brand.name} les lit et arrête la séquence.`,
  provider: { GMAIL: 'Gmail', OUTLOOK: 'Outlook', SMTP: 'SMTP' } as Record<string, string>,
} as const

export const onboarding = {
  title: `Bienvenue dans ${brand.name}`,
  subtitle: 'Nommez votre espace de travail. Le reste se règle dans votre première campagne.',
  label: "Nom de l'espace de travail",
  placeholder: 'ex: Acme Corp',
  tooShort: 'Le nom doit faire au moins 2 caractères',
  failed: 'Failed to save workspace settings. Please try again.',
  // What happens after this screen, said plainly.
  nextSteps: [
    'Décrivez votre client idéal : les agents trouvent et notent les leads.',
    'Écrivez ou relisez la séquence, avec les variables qui la personnalisent pour chaque lead.',
    'Lancez : la séquence s’arrête dès qu’un prospect répond.',
  ],
  launch: `Lancer ${brand.name}`,
  launching: 'Création de votre espace…',
  later: 'Vous pourrez tout configurer ensuite dans vos campagnes.',
} as const
