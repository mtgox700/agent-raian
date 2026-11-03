/**
 * Texts of /dashboard/campaigns and of the launch dialog, word for word from
 * body n°1 (apps/front/components/dashboard/CampaignsPageClient.tsx,
 * CampaignLaunchDialog.tsx).
 */

const s = (n: number) => (n > 1 ? 's' : '')

export const campaignsCopy = {
  title: 'Campagnes',
  description: 'Gérez vos séquences de prospection',
  activeCount: (n: number) => `${n} active${s(n)}`,
  newCampaign: 'Nouvelle campagne',
  newHref: '/dashboard/campaigns/new',
  filtersLabel: 'Filtrer les campagnes par statut',
  filters: [
    { key: 'all', label: 'Toutes' },
    { key: 'active', label: 'Actives' },
    { key: 'paused', label: 'En pause' },
    { key: 'draft', label: 'Brouillons' },
    { key: 'completed', label: 'Terminées' },
  ] as const,
  kpi: {
    open: 'Ouvertures',
    openCaption: (opened: number, sent: number) => `${opened} sur ${sent} e-mails, depuis le début, mesure indicative`,
    openNone: 'aucun e-mail envoyé',
    reply: 'Taux de réponse',
    replyCaption: (replied: number, contacted: number) => `${replied} sur ${contacted} leads contactés`,
    replyNone: 'aucun lead contacté',
    sent: 'Messages envoyés',
    sentCaption: 'tous canaux, depuis le début',
    active: 'Campagnes actives',
    activeCaption: 'en ce moment',
  },
  emptyAll: 'Aucune campagne pour l\'instant',
  emptyFiltered: 'Aucune campagne dans cette catégorie',
  emptyAllBody: 'Créez une séquence : la cible, les étapes, puis le lancement.',
  emptyFilteredBody: 'Changez de filtre ou créez une nouvelle campagne.',
  create: 'Créer une campagne',
  createHint: 'Cible, étapes, lancement',
  pause: 'Pause',
  resume: 'Reprendre',
  launch: 'Lancer',
  relaunch: 'Relancer',
  showMore: 'Afficher plus',
  remaining: (n: number) => `${n} restante${s(n)}`,
  paused: 'Campagne mise en pause : les séquences s\'arrêtent',
  resumed: 'Campagne relancée : les séquences reprennent',
  statusError: 'Erreur lors du changement de statut',
  networkError: 'Erreur réseau : réessayez',
} as const

export const launchCopy = {
  titleLaunch: 'Lancer la campagne',
  titleLaunched: 'Campagne lancée',
  close: 'Fermer',
  cancel: 'Annuler',
  launching: 'Lancement…',
  launchN: (n: number) => `Lancer · ${n} message${s(n)}`,
  qualified: 'Leads qualifiés',
  qualifiedHint: 'Fast Track + Normal',
  linkedinUnit: 'Messages LinkedIn',
  emailUnit: 'E-mails à envoyer',
  linkedinCap: '25 par jour au plus (protection du compte)',
  remainingMonth: (n: number) => `${n.toLocaleString('fr-FR')} restants ce mois`,
  unlimited: 'Illimité',
  irreversible: 'Action irréversible.',
  linkedinBody: 'L\'envoi démarre tout de suite via votre compte LinkedIn connecté, un message à la fois pour protéger votre compte.',
  linkedinNote: 'Prospects hors de votre réseau : une invitation avec une note courte part à la place du message ; les étapes LinkedIn suivantes leur arrivent en message une fois l\'invitation acceptée.',
  emailBody: 'L\'envoi démarre tout de suite : un e-mail à la fois, au rythme de votre boîte, pour protéger votre délivrabilité. Vous pouvez fermer cette fenêtre, tout continue en arrière-plan.',
  failed: 'Erreur lors du lancement',
  unexpected: 'Erreur inattendue',
  unit: (n: number, linkedIn: boolean) => (linkedIn ? `message${s(n)} LinkedIn` : `e-mail${s(n)}`),
  inProgress: (unit: string) => ` ${unit} en cours d'envoi`,
  duration: (minutes: number) => {
    if (minutes < 1) return "moins d'une minute"
    if (minutes < 60) return `${minutes} min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
  },
  paused: (at: string) => `Votre fournisseur a demandé une pause : les envois reprennent seuls vers ${at}. Aucun message n'est perdu.`,
  from: (sender: string | null) => (sender ? ` depuis ${sender}` : ''),
  allToday: (from: string, duration: string) => `Tout part aujourd'hui${from}, en ${duration} environ, un message à la fois.`,
  linkedinLimit: (n: number) => `LinkedIn limite à ${n} messages par jour pour protéger votre compte.`,
  emailLimit: (n: number) => `Plafond de ${n} e-mails par jour pour protéger votre délivrabilité, réglable dans Paramètres, onglet E-mails et canaux.`,
  split: (today: number, queued: number, from: string, duration: string, days: number, limit: string) =>
    `${today} sur ${queued} partent aujourd'hui${from} (${duration} environ), le reste sur ${days} jours. ${limit}`,
} as const
