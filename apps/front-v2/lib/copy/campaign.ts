/**
 * Texts of /dashboard/campaigns/[campaignId], word for word from body n°1
 * (CampaignDetailClient, StepComparisonTable, StepDetailDrawer,
 * SendStatusBanner, CampaignSenderCard, SequenceTimeline, LeadSearchDrawer,
 * LeadSearchProgress, LeadDetailDrawer, LeadPhoneTouch, PhoneRevealButton).
 */
import type { BadgeTone } from '@/components/ui'

const s = (n: number) => (n > 1 ? 's' : '')

/** Lead status → tone and label (body n°1's LEAD_STATUS, tones of body n°2). */
export const LEAD_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  new:       { tone: 'neutral', label: 'Nouveau' },
  queued:    { tone: 'neutral', label: 'En file' },
  contacted: { tone: 'accent',  label: 'Contacté' },
  replied:   { tone: 'signal',  label: 'A répondu' },
  qualified: { tone: 'signal',  label: 'Qualifié' },
  converted: { tone: 'success', label: 'Converti' },
  lost:      { tone: 'danger',  label: 'Perdu' },
}

/** Score badge: same names as body n°1's LeadScoreBadge, a tone instead of a colour. */
export const SCORE_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  FAST_TRACK: { tone: 'success', label: 'Fast Track' },
  NORMAL:     { tone: 'accent',  label: 'Normal' },
  NURTURE:    { tone: 'warning', label: 'Nurture' },
  SKIP:       { tone: 'danger',  label: 'Écarté' },
  UNSCORED:   { tone: 'neutral', label: 'Non scoré' },
}

export const campaignCopy = {
  back: 'Retour',
  draftStatus: 'Brouillon',
  goals: { LEADS: 'Génération de leads', DEMOS: 'Démonstrations', SALES: 'Ventes directes', AWARENESS: 'Notoriété' } as Record<string, string>,
  justNow: "à l'instant",
  ago: (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
    if (mins < 1) return "à l'instant"
    if (mins < 60) return `${mins}min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}j`
  },
  leadsCount: (n: number) => `${n} lead${n !== 1 ? 's' : ''}`,
  sentSuffix: (breakdown: string, sent: number) => `${breakdown} envoyé${s(sent)}`,
  noneSent: '0 message envoyé',
  retrying: 'Relance…',
  inFlight: (n: number) => `${n} en cours d'envoi`,
  retryTitle: "Les messages partent un par un, au rythme sûr de votre boîte, jusqu'à son plafond quotidien",
  retried: (n: number) => `Envoi relancé : ${n} message${s(n)} partent au rythme de votre boîte`,
  retryPaused: 'Campagne en pause : réactivez-la pour reprendre les envois',
  retryError: 'Erreur de relance',
  networkError: 'Erreur réseau',
  error: 'Erreur',
  why: 'Pourquoi ces chiffres ?',
  whyHref: (name: string) => `/dashboard/analyst?q=${encodeURIComponent(`Pourquoi la campagne « ${name} » a ces chiffres, et que changer ?`)}`,
  draftTitle: 'Brouillon : rien ne part tant que vous ne le lancez pas.',
  draftStep1: 'Trouvez les leads du nouveau segment avec « Lancer la prospection IA » ci-dessous : choisissez d’autres postes, secteurs ou tailles.',
  draftStep2Before: 'Lancez-le depuis la ',
  draftStep2Link: 'liste des campagnes',
  draftStep2After: ', bouton « Lancer ».',
  prospecting: 'Prospection IA en cours…',
  collected: (n: number) => `${n} lead${s(n)} déjà collecté${s(n)}`,
  prospectingBody: 'Recherche, vérification des e-mails et score se font en arrière-plan. Les leads apparaissent ici d\'eux-mêmes : pas besoin de rafraîchir.',
  uncertain: (n: number) => `${n} lead${s(n)} avec un e-mail incertain`,
  uncertainBody: 'Leur adresse n\'a pas pu être vérifiée : ils n\'ont pas été contactés, pour protéger votre délivrabilité. Les contacter quand même ?',
  contacting: 'Envoi…',
  contactAnyway: 'Contacter quand même',
  contacted: (n: number) => `${n} e-mail${s(n)} en cours d'envoi`,
  tabsLabel: 'Vues de la campagne',
  tabs: { resume: 'Résumé', steps: 'Étapes', leads: 'Leads' },
  settingsBilling: '/dashboard/settings?tab=billing',
} as const

export const resumeCopy = {
  sent: 'Messages envoyés',
  openRate: "Taux d'ouverture",
  openSub: (onlyEmails: boolean, opened: number, emails: number) => `Indicatif, ${onlyEmails ? 'e-mails uniquement, ' : ''}${opened} sur ${emails}`,
  notMeasurable: 'Non mesurable hors e-mail',
  replyRate: 'Taux de réponse',
  replySub: (replied: number, contacted: number, low: string, high: string) =>
    `${replied} lead${s(replied)} sur ${contacted} contacté${s(contacted)} · IC 95 % ${low}-${high}`,
  conversions: 'Conversions',
  convSub: (converted: number, leads: number) => `${converted} lead${s(converted)} converti${s(converted)} sur ${leads}`,
  stopped: (n: number) => `${n} séquence${s(n)} arrêtée${s(n)} automatiquement dès la réponse du prospect : aucune relance ne lui a été envoyée ensuite.`,
  sequence: 'Séquence',
  industry: 'Industrie cible',
  goal: 'Objectif',
  created: 'Créée le',
  completed: 'Terminée le',
  lastRun: 'Dernier passage',
  channelWords: {
    EMAIL: ['e-mail', 'e-mails'],
    LINKEDIN: ['message LinkedIn', 'messages LinkedIn'],
    WHATSAPP: ['WhatsApp', 'WhatsApp'],
    SMS: ['SMS', 'SMS'],
  } as Record<string, [string, string]>,
} as const

export const leadsTabCopy = {
  stages: [['new', 'Nouveaux'], ['contacted', 'Contactés'], ['qualified', 'Qualifiés'], ['converted', 'Convertis'], ['lost', 'Perdus']] as const,
  total: (n: number) => `${n} leads au total`,
  searching: 'Recherche en cours…',
  find: 'Trouver des leads',
  emptyTitle: 'Aucun lead dans cette campagne',
  emptyBody: 'Lancez une recherche : les comptes trouvés sont enrichis, leurs e-mails vérifiés, puis chaque lead reçoit un score.',
  emptySteps: [
    { n: '1', label: 'Recherche des comptes', desc: 'selon votre ciblage' },
    { n: '2', label: 'Vérification des e-mails', desc: 'avant tout envoi' },
    { n: '3', label: "Score d'adéquation", desc: 'de 0 à 100' },
  ],
  launchAi: 'Lancer la prospection IA',
  open: (name: string) => `Ouvrir la fiche de ${name}`,
  replied: 'Répondu',
  pagination: 'Pagination des leads',
  range: (a: number, b: number, n: number) => `${a}-${b} sur ${n} lead${s(n)}`,
  first: 'Première page',
  prev: 'Page précédente',
  next: 'Page suivante',
  last: 'Dernière page',
  page: (n: number) => `Page ${n}`,
} as const

export const stepsCopy = {
  best: 'meilleure',
  notMeasuredTitle: 'Non mesurable hors e-mail',
  notMeasured: 'n.d.',
  linkedinMessage: 'Message LinkedIn',
  phoneChannel: (channel: 'SMS' | 'WhatsApp') => `${channel} · depuis votre téléphone`,
  empty: 'Lancez la campagne pour voir les statistiques par étape',
  step: 'Étape',
  subject: 'Objet ou message',
  sent: 'Envoyés',
  open: 'Ouverture',
  clicks: 'Clics',
  replies: 'Réponses',
  failures: 'Échecs',
  viewEmail: "Voir l'email",
  replyCount: (n: number) => `${n} réponse${s(n)}`,
  openStep: (sent: boolean, n: number) => `${sent ? 'Voir' : 'Modifier'} l'étape ${n}`,
  caption: 'Statistiques par étape de la séquence',
} as const

export const stepDrawerCopy = {
  title: (n: number) => `Étape ${n}`,
  close: 'Fermer',
  immediate: 'Envoi immédiat',
  sentN: (n: number) => `${n} envoyé${s(n)}`,
  sentBadge: 'Envoyé',
  upcoming: 'À venir',
  sendAfter: 'Envoyer après',
  dayLess: 'Un jour de moins',
  dayMore: 'Un jour de plus',
  daysAfter: (d: number) => `jour${s(d)} après le premier e-mail`,
  from: 'De',
  fromValue: 'votre boîte connectée',
  to: 'À',
  subject: 'Objet',
  subjectPlaceholder: "Objet de l'e-mail…",
  bodyLabel: "Corps de l'e-mail",
  bodyPlaceholder: "Corps de l'e-mail…",
  variables: 'Variables :',
  alreadySent: (sent: number, queued: number) =>
    `Déjà envoyé à ${sent} lead${s(sent)} : cette version partira aux ${queued} lead${s(queued)} encore en attente.`,
  varsNoteBefore: 'Les variables comme ',
  varsNoteAfter: ' sont automatiquement remplacées par les données de chaque lead à l\'envoi.',
  locked: 'E-mail envoyé à tous les leads : non modifiable',
  edit: 'Modifier cet e-mail',
  cancel: 'Annuler',
  saving: 'Enregistrement…',
  save: 'Enregistrer',
  failed: 'Échec de la mise à jour',
} as const

export const sendStatusCopy = {
  at: (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (d.toDateString() === new Date().toDateString()) return `vers ${time}`
    if (d.toDateString() === tomorrow.toDateString()) return `demain vers ${time}`
    return `le ${d.toLocaleDateString('fr-FR', { weekday: 'long' })} vers ${time}`
  },
  resume: (at: string) => `, reprise automatique ${at}`,
  mailboxCap: (sent: number, limit: number, resume: string) => `Plafond quotidien de la boîte atteint (${sent}/${limit} sur 24 h)${resume}.`,
  raiseCap: 'Augmenter le plafond',
  sharedCap: (sent: number, limit: number, resume: string) => `Plafond quotidien de l'adresse Phantera atteint (${sent}/${limit} sur 24 h)${resume}. Connectez votre boîte pour envoyer davantage.`,
  connect: 'Connecter une boîte',
  mailboxPaused: (resume: string) => `Votre fournisseur e-mail a demandé une pause${resume}. Aucun message n'est perdu.`,
  quota: (current: number, limit: number | null) => `Quota mensuel du forfait atteint (${current}/${limit ?? '∞'} envois ce mois-ci).`,
  changePlan: 'Changer de forfait',
  disconnected: 'Votre boîte e-mail est déconnectée : les envois attendent sa reconnexion.',
  reconnect: 'Reconnecter',
  noSender: 'Aucune boîte d’envoi pour cette campagne : les envois attendent que son responsable connecte sa boîte, ou qu’un admin en partage une.',
  campaignPaused: 'Campagne en pause : les messages en file partiront à sa réactivation.',
  mailboxesHref: '/dashboard/settings?tab=mailboxes',
  billingHref: '/dashboard/settings?tab=billing',
  sending: (n: number, sender: string | null, sent: number, limit: number) =>
    `${n} message${s(n)} en cours d'envoi${sender ? ` depuis ${sender}` : ''}, un à la fois (${sent}/${limit} envoyés sur 24 h).`,
  waiting: (n: number) => `${n} message${s(n)} en attente. `,
} as const

export const senderCardCopy = {
  label: 'Expéditeur de la campagne',
  lost: 'La boîte d’envoi de cette campagne a été supprimée. Choisissez un expéditeur et enregistrez-le : la campagne ne peut pas repartir avant.',
  saving: 'Enregistrement…',
  confirm: 'Confirmer cet expéditeur',
  save: 'Enregistrer l’expéditeur',
  cancel: 'Annuler',
  saved: 'Expéditeur enregistré : il s’applique dès le prochain e-mail',
  failed: 'Enregistrement impossible',
} as const

export const timelineCopy = {
  title: 'Aperçu de la séquence',
  linkedin: 'Message LinkedIn',
  whatsapp: 'WhatsApp · depuis votre téléphone',
  sms: 'SMS · depuis votre téléphone',
  immediate: 'Envoi immédiat',
  channelName: { EMAIL: 'E-mail', LINKEDIN: 'LinkedIn', WHATSAPP: 'WhatsApp', SMS: 'SMS' } as Record<string, string>,
  summary: (emails: number, dms: number, wa: number, sms: number, total: number) => {
    const parts: string[] = []
    if (emails > 0) parts.push(`${emails} e-mail${s(emails)}`)
    if (dms > 0) parts.push(`${dms} message${s(dms)} LinkedIn`)
    if (wa > 0) parts.push(`${wa} WhatsApp`)
    if (sms > 0) parts.push(`${sms} SMS`)
    return parts.join(' + ') || `${total} étapes`
  },
  duration: 'durée totale',
  immediateTotal: 'immédiate',
  days: (n: number) => `${n} jours`,
} as const

export const leadSearchCopy = {
  title: 'Prospecter avec IA',
  description: (plan: string) => `Recherche des comptes, vérification des e-mails, score · offre ${plan}`,
  freePlan: 'gratuite',
  close: 'Fermer',
  sizes: [
    { value: 'XS', label: '1-10 emp.' },
    { value: 'S', label: '11-50 emp.' },
    { value: 'M', label: '51-200 emp.' },
    { value: 'L', label: '201-1000 emp.' },
    { value: 'XL', label: '1000+ emp.' },
  ] as const,
  addTo: (label: string) => `Ajouter à : ${label}`,
  remove: (v: string) => `Retirer ${v}`,
  offer: (plan: string) => `Offre ${plan}`,
  higherOffer: 'Offre supérieure',
  running: 'Prospection en cours...',
  launch: 'Lancer la prospection',
  needTitle: 'Sélectionnez au moins 1 titre de poste',
  prefilled: 'Ciblage pré-rempli depuis votre campagne. Modifiez si besoin.',
  titles: 'Titres de poste',
  titlePlaceholder: 'Rechercher ou taper un titre personnalisé...',
  addCustomTitle: 'Ajouter ce titre personnalisé',
  add: 'Ajouter',
  chosen: 'Titres choisis',
  suggestions: 'Suggestions de titres',
  noSuggestion: (q: string) => `Aucune suggestion : appuyez sur Entrée ou cliquez « Ajouter » pour utiliser « ${q} ».`,
  tip: 'Astuce : tapez n\'importe quel titre (français, anglais ou personnalisé) puis Entrée.',
  industry: 'Secteur d\'activité',
  allIndustries: 'Tous les secteurs',
  size: 'Taille d\'entreprise',
  geo: 'Géographie',
  world: 'Monde entier',
  personFilters: 'Filtres avancés Personne',
  seniority: 'Séniorité',
  jobFunction: 'Fonction métier',
  emailStatus: 'Statut email',
  moreCountries: 'Pays additionnels',
  moreCountriesPh: 'ex : Belgium, Switzerland...',
  companyFilters: 'Filtres Entreprise',
  keywords: 'Mots-clés entreprise',
  keywordsPh: 'ex : AI, B2B, marketplace...',
  excludeDomains: 'Exclure domaines (concurrents)',
  excludeDomainsLabel: 'Exclure domaines',
  excludeDomainsPh: 'ex : lemlist.com, instantly.ai...',
  finance: 'Profil financier (Business)',
  funding: 'Levée de fonds',
  revenue: 'Chiffre d\'affaires annuel (USD)',
  min: 'Min',
  max: 'Max',
  revenueMin: 'Chiffre d\'affaires minimum (USD)',
  revenueMax: 'Chiffre d\'affaires maximum (USD)',
  founded: 'Année de fondation',
  foundedMinPh: 'ex : 2015',
  foundedMaxPh: 'ex : 2024',
  foundedMin: 'Fondée au plus tôt en',
  foundedMax: 'Fondée au plus tard en',
  hq: 'Siège de l\'entreprise',
  hqPh: 'ex : France, Germany...',
  excludeCountries: 'Exclure pays',
  excludeCountriesPh: 'ex : Russia, Iran...',
  intent: 'Signaux d\'intention (Enterprise)',
  recentlyJoined: 'Vient d\'arriver dans l\'entreprise (90 derniers jours)',
  recentNews: 'A reçu de la presse récemment',
  recentFunding: 'Levée de fonds récente',
  usingTech: 'Utilise ces technologies',
  usingTechPh: 'ex : Hubspot, Salesforce...',
  notUsingTech: 'N\'utilise pas ces technologies (opportunité)',
  notUsingTechLabel: 'N\'utilise pas ces technologies',
  notUsingTechPh: 'ex : Pipedrive, Lemlist...',
  count: 'Nombre de leads',
  whatItDoes: 'Ce que fait la prospection',
  steps: [
    { step: '1', label: 'Recherche des comptes', desc: 'contacts B2B qui correspondent au ciblage' },
    { step: '2', label: 'Vérification des e-mails', desc: 'adresse trouvée puis contrôlée' },
    { step: '3', label: 'Score de priorité', desc: 'note de 0 à 100 selon votre cible' },
  ],
} as const

export const progressCopy = {
  notStarted: 'La prospection n’a pas démarré. Réessayez.',
  label: 'Progression de la prospection',
  done: 'Prospection terminée',
  failed: 'La prospection a échoué',
  running: 'Prospection en cours',
  stepsInOrder: (n: number) => `${n} étapes, dans l'ordre`,
  close: 'Fermer la progression',
  steps: [
    { id: 'search', label: 'Recherche des comptes', sublabel: 'Contacts qui correspondent à votre ciblage' },
    { id: 'enrich', label: 'Recherche des e-mails', sublabel: 'Adresse trouvée puis vérifiée' },
    { id: 'score', label: 'Score de priorité', sublabel: 'Note de 0 à 100 selon votre cible' },
  ] as const,
  inProgress: 'en cours',
  found: (n: number) => `${n} trouvés`,
  emails: (n: number) => `${n} e-mails`,
  scored: (n: number) => `${n} scorés`,
  summary: (saved: number, enriched: number) => `${saved} leads enregistrés · ${enriched} adresses contrôlées`,
  split: 'Répartition des priorités',
  seeLeads: 'Voir les leads',
} as const

export const leadDetailCopy = {
  close: 'Fermer',
  sizes: { XS: '1 à 10 employés', S: '11 à 50 employés', M: '51 à 200 employés', L: '201 à 1000 employés', XL: '1000+ employés' } as Record<string, string>,
  sources: { APOLLO: 'Apollo', CSV_IMPORT: 'Import CSV', MANUAL: 'Manuel', AI_PROSPECTING: 'Prospection IA', LINKEDIN: 'LinkedIn' } as Record<string, string>,
  copy: 'Copier',
  copied: 'Adresse copiée',
  copyEmail: 'Copier l’adresse e-mail',
  followUp: 'Suivi',
  status: 'Statut',
  doNotContact: 'Ne plus contacter',
  doNotContactNote: 'Aucune campagne ne lui écrira : désinscription, rebond ou choix manuel.',
  updateFailed: 'Mise à jour impossible',
  contact: 'Contact',
  verified: 'Vérifié',
  uncertain: 'Incertain',
  company: 'Entreprise',
  title: 'Poste',
  industry: 'Secteur',
  size: 'Taille',
  location: 'Localisation',
  about: 'À propos de l\'entreprise',
  stack: 'Stack technique',
  added: (date: string) => `Ajouté le ${date}`,
  sendEmail: 'Envoyer un email',
  viewLinkedin: 'Voir le profil LinkedIn',
  viewLinkedinNewTab: 'Voir le profil LinkedIn (nouvel onglet)',
  sendLinkedin: 'Envoyer un message LinkedIn',
  linkedinVia: 'Message LinkedIn : via votre compte connecté',
  closeLinkedin: 'Fermer le message LinkedIn',
  linkedinFor: (name: string) => `Message LinkedIn pour ${name}`,
  linkedinPh: (name: string) => `Message pour ${name}… (si pas encore en relation, il partira en note d'invitation)`,
  sendFailed: 'Envoi impossible',
  networkRetry: 'Erreur réseau : réessayez',
  sentDm: 'Message envoyé',
  sentInvite: 'Invitation de connexion envoyée avec votre message en note',
  sending: 'Envoi…',
  send: 'Envoyer',
  scoreTitle: (n: number) => `Score : ${n}/100`,
} as const

export const phoneCopy = {
  title: 'WhatsApp & SMS',
  channel: { WHATSAPP: 'WhatsApp', SMS: 'SMS' } as Record<string, string>,
  phonePh: '+33 6 12 34 56 78',
  phoneLabel: 'Numéro professionnel du lead',
  saving: 'Enregistrement…',
  save: 'Enregistrer',
  saved: 'Numéro enregistré',
  removed: 'Numéro retiré',
  saveFailed: 'Enregistrement impossible',
  doNotContact: 'Ce lead ne doit plus être contacté.',
  prepare: (c: string) => `Préparer un ${c}`,
  drafting: 'Rédaction du message…',
  draftFailed: 'Rédaction impossible',
  messageLabel: (c: string) => `Message ${c}`,
  remainingToday: (n: number) => `${n} envoi${s(n)} restant${s(n)} aujourd'hui`,
  openWhatsapp: 'Ouvrir WhatsApp',
  openSms: 'Ouvrir les SMS',
  cancel: 'Annuler',
  note: 'Le message s\'ouvre sur votre téléphone : c\'est vous qui l\'envoyez. Si le prospect répond STOP, cochez « Ne plus contacter ».',
  notRecorded: 'Envoi non enregistré',
  opened: (c: string) => `${c} ouvert : envoyez le message depuis votre téléphone`,
  revealPending: 'Recherche du numéro en cours : la réponse arrive en quelques minutes.',
  revealNotFound: 'Aucun numéro joignable trouvé pour ce lead.',
  reveal: 'Trouver son numéro',
  revealRemaining: (n: number) => `· ${n} restante${s(n)} ce mois`,
  revealFailed: 'Recherche impossible',
} as const
