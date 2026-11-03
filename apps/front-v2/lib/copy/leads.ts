/**
 * Texts of the Leads screen (/dashboard/leads), word for word from body n°1
 * (apps/front/components/dashboard: LeadsPageClient, LeadsTable,
 * LeadDetailDrawer, LeadPhoneTouch, PhoneRevealButton, AddLeadModal,
 * AssignCampaignModal, LeadSearchDrawer, LeadSearchProgress, UpgradeModal).
 */
import type { BadgeTone } from '@/components/ui'
import { PLAN_CONFIG } from '@/lib/stripe/plans'

const s = (n: number) => (n > 1 ? 's' : '')
const fr = (n: number) => n.toLocaleString('fr-FR')
// A literal U+00A0 is refused by the linter; built once instead.
const NBSP = String.fromCharCode(160)

/** Lead status -> tone and French label (body n°1's LEAD_STATUS, tones of body n°2). */
export const LEAD_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  new:       { tone: 'neutral', label: 'Nouveau' },
  queued:    { tone: 'neutral', label: 'En file' },
  contacted: { tone: 'accent',  label: 'Contacté' },
  replied:   { tone: 'signal',  label: 'A répondu' },
  qualified: { tone: 'signal',  label: 'Qualifié' },
  converted: { tone: 'success', label: 'Converti' },
  lost:      { tone: 'danger',  label: 'Perdu' },
}

/** "queued" is not contacted yet: shown, filtered and edited as "Nouveau". */
export function leadStatus(status: string) {
  if (status === 'queued') return LEAD_STATUS.new!
  return LEAD_STATUS[status] ?? LEAD_STATUS.new!
}

/** Priority badge: label and tone (same tones as the campaign screen). */
export const SCORE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  FAST_TRACK: { label: 'Fast Track', tone: 'success' },
  NORMAL:     { label: 'Normal',     tone: 'accent' },
  NURTURE:    { label: 'Nurture',    tone: 'warning' },
  SKIP:       { label: 'Écarté',     tone: 'danger' },
  UNSCORED:   { label: 'Non scoré',  tone: 'neutral' },
}

export const leadsCopy = {
  title: 'Base de Leads',
  /** « 1 234 leads (500 affichés) • 12 prêts à contacter » */
  description: (opts: { realTotal: number; shown: number; capped: boolean; found: number | null; ready: number }) =>
    `${fr(opts.realTotal)} lead${opts.realTotal !== 1 ? 's' : ''}` +
    (opts.found !== null
      ? ` · ${fr(opts.found)} trouvé${s(opts.found)} dans toute la base`
      : opts.capped ? ` (${opts.shown} affichés)` : '') +
    ` • ${opts.ready} prêt${opts.ready !== 1 ? 's' : ''} à contacter`,
  exportCsv: 'Exporter CSV',
  exportTitle: 'Exporter les leads en CSV',
  exportLockedTitle: 'Export CSV : réservé aux offres payantes',
  add: 'Ajouter',
  addTitle: 'Ajouter un lead manuellement (test email)',
  prospect: 'Prospecter IA',
  prospecting: 'Prospection en cours...',
  stats: {
    total: 'Total leads',
    totalCaption: (shown: number, total: number, capped: boolean) =>
      capped ? `${shown} affichés (les mieux scorés)` : `sur ${total} leads`,
    ready: 'Prêts à contacter',
    readyCaption: (shown: number, capped: boolean) =>
      capped ? `Fast Track et Normal, sur les ${shown} affichés` : 'priorité Fast Track ou Normal',
    verified: 'E-mail vérifié',
    converted: 'Convertis',
    shownCaption: (shown: number) => `sur ${shown} affichés`,
  },
  bulk: {
    label: 'Actions sur la sélection',
    selected: 'sélectionné(s)',
    enrich: 'Enrichir',
    enriching: 'Enrichissement...',
    score: 'Scorer IA',
    scoring: 'Calcul des scores...',
    assign: 'Assigner à campagne',
    exportSelection: 'Exporter sélection',
    clear: 'Désélectionner',
  },
  scoreToasts: {
    tooMany: (max: number, n: number) => `Sélectionnez ${max} leads au plus à scorer (${n} sélectionnés).`,
    failed: 'Le scoring n’a pas abouti. Réessayez.',
    distribution: [['FAST_TRACK', 'Fast Track'], ['NORMAL', 'Normal'], ['NURTURE', 'Nurture'], ['SKIP', 'Écarté'], ['UNSCORED', 'non scoré']] as const,
    done: (n: number, parts: string[]) => `${n} lead${s(n)} scoré${s(n)}${parts.length ? ` : ${parts.join(', ')}` : ''}.`,
    unscored: (n: number) => `${n} lead${s(n)} n’ont pas pu être scorés : relancez le scoring.`,
    network: 'Connexion perdue pendant le scoring. Réessayez.',
  },
  csv: {
    filename: (date: string) => `leads-phantera-${date}.csv`,
    headers: ['Prénom', 'Nom', 'Email', 'Entreprise', 'Titre', 'Secteur', 'Score', 'Badge', 'Statut'],
    status: {
      new: 'Nouveau', queued: 'En file', contacted: 'Contacté', qualified: 'Qualifié', converted: 'Converti', lost: 'Perdu',
    } as Record<string, string>,
  },
  pipelineStartFailed: 'La prospection n’a pas démarré. Réessayez.',
  close: 'Fermer',
} as const

export const tableCopy = {
  caption: 'Base de Leads',
  search: 'Rechercher un lead...',
  searchLabel: 'Rechercher un lead',
  filterLabel: 'Filtrer par statut',
  all: 'Tous',
  filters: ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const,
  searching: 'Recherche dans toute la base…',
  count: (n: number) => `${n} lead${n !== 1 ? 's' : ''}`,
  selectAll: 'Sélectionner tous les leads',
  select: (name: string) => `Sélectionner ${name}`,
  open: (name: string) => `Ouvrir la fiche de ${name}`,
  linkedin: 'Profil LinkedIn',
  linkedinOf: (name: string) => `Profil LinkedIn de ${name}`,
  website: 'Site web',
  websiteOf: (name: string) => `Site web de ${name}`,
  columns: { lead: 'Lead', company: 'Entreprise', industry: 'Secteur', score: 'Score IA', status: 'Statut', email: 'E-mail', source: 'Source' },
  verified: 'Vérifié',
  uncertain: 'Incertain',
  percent: (n: number) => `${n}${NBSP}%`,
  sources: { APOLLO: 'Apollo', CSV_IMPORT: 'CSV', MANUAL: 'Manuel', AI_PROSPECTING: 'IA', LINKEDIN: 'LinkedIn' } as Record<string, string>,
  emptyTitle: 'Aucun lead trouvé',
  emptyBody: 'Lancez « Prospecter IA » pour sourcer vos premiers leads.',
  paginationLabel: 'Pagination des leads',
  range: (a: number, b: number, total: number) => `${a}-${b} sur ${total} lead${s(total)}`,
  first: 'Première page',
  previous: 'Page précédente',
  next: 'Page suivante',
  last: 'Dernière page',
  page: (n: number) => `Page ${n}`,
} as const

export const detailCopy = {
  close: 'Fermer',
  sizes: {
    XS: '1 à 10 employés', S: '11 à 50 employés', M: '51 à 200 employés', L: '201 à 1000 employés', XL: '1000+ employés',
  } as Record<string, string>,
  sources: {
    APOLLO: 'Apollo', CSV_IMPORT: 'Import CSV', MANUAL: 'Manuel', AI_PROSPECTING: 'Prospection IA', LINKEDIN: 'LinkedIn',
  } as Record<string, string>,
  copy: 'Copier',
  copyEmail: 'Copier l’adresse e-mail',
  copied: 'Adresse copiée',
  followUp: 'Suivi',
  status: 'Statut',
  doNotContact: 'Ne plus contacter',
  doNotContactNote: 'Aucune campagne ne lui écrira : désinscription, rebond ou choix manuel.',
  updateFailed: 'Mise à jour impossible',
  contact: 'Contact',
  verified: 'Vérifié',
  uncertain: 'Incertain',
  percent: (n: number) => ` ${n}${NBSP}%`,
  outOf100: (n: number) => `${n}/100`,
  company: 'Entreprise',
  title: 'Poste',
  industry: 'Secteur',
  size: 'Taille',
  location: 'Localisation',
  about: "À propos de l'entreprise",
  stack: 'Stack technique',
  added: (date: string) => `Ajouté le ${date}`,
  sendEmail: 'Envoyer un email',
  viewLinkedin: 'Voir le profil LinkedIn',
  viewLinkedinLabel: 'Voir le profil LinkedIn (nouvel onglet)',
  linkedin: {
    open: 'Envoyer un message LinkedIn',
    heading: 'Message LinkedIn : via votre compte connecté',
    close: 'Fermer le message LinkedIn',
    label: (first: string) => `Message LinkedIn pour ${first}`,
    placeholder: (first: string) => `Message pour ${first}… (si pas encore en relation, il partira en note d'invitation)`,
    failed: 'Envoi impossible',
    network: 'Erreur réseau : réessayez',
    sentDm: 'Message envoyé',
    sentInvitation: 'Invitation de connexion envoyée avec votre message en note',
    count: (n: number) => `${n}/1500`,
    send: 'Envoyer',
    sending: 'Envoi…',
  },
} as const

export const phoneCopy = {
  title: 'WhatsApp & SMS',
  channel: { WHATSAPP: 'WhatsApp', SMS: 'SMS' } as const,
  phoneLabel: 'Numéro professionnel du lead',
  phonePlaceholder: '+33 6 12 34 56 78',
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  saveFailed: 'Enregistrement impossible',
  saved: 'Numéro enregistré',
  removed: 'Numéro retiré',
  doNotContact: 'Ce lead ne doit plus être contacté.',
  prepare: (channel: string) => `Préparer un ${channel}`,
  drafting: 'Rédaction du message…',
  draftFailed: 'Rédaction impossible',
  message: (channel: string) => `Message ${channel}`,
  remaining: (n: number) => `${n} envoi${s(n)} restant${s(n)} aujourd'hui`,
  openWhatsapp: 'Ouvrir WhatsApp',
  openSms: 'Ouvrir les SMS',
  cancel: 'Annuler',
  note: "Le message s'ouvre sur votre téléphone : c'est vous qui l'envoyez. Si le prospect répond STOP, cochez « Ne plus contacter ».",
  notRecorded: 'Envoi non enregistré',
  opened: (channel: string) => `${channel} ouvert : envoyez le message depuis votre téléphone`,
  reveal: {
    pending: 'Recherche du numéro en cours : la réponse arrive en quelques minutes.',
    notFound: 'Aucun numéro joignable trouvé pour ce lead.',
    find: 'Trouver son numéro',
    remaining: (n: number) => `· ${n} restante${s(n)} ce mois`,
    failed: 'Recherche impossible',
  },
} as const

export const addLeadCopy = {
  title: 'Ajouter un lead',
  description: 'Un contact que vous connaissez déjà',
  close: 'Fermer',
  firstName: 'Prénom',
  lastName: 'Nom',
  email: 'E-mail',
  company: 'Entreprise',
  jobTitle: 'Poste',
  linkedin: 'URL LinkedIn',
  website: 'Site web',
  placeholders: {
    firstName: 'Camille', lastName: 'Martin', email: 'camille.martin@entreprise.fr', company: 'Entreprise',
    title: 'Directrice commerciale', linkedin: 'linkedin.com/in/camille-martin', website: 'entreprise.com',
  },
  linkedinOn: 'Messages LinkedIn activés pour ce lead',
  campaign: 'Associer à une campagne',
  noCampaign: 'Sans campagne',
  campaignStatus: { active: 'active', paused: 'en pause', draft: 'brouillon' } as Record<string, string>,
  campaignNoteNurture: 'Lié à la campagne. En Nurture, elle ne lui écrit pas.',
  campaignNote: 'Campagne active : son premier message part aussitôt. Sinon, au lancement.',
  priority: 'Priorité',
  badges: [
    { value: 'FAST_TRACK', label: 'Fast Track', tone: 'success' },
    { value: 'NORMAL',     label: 'Normal',     tone: 'accent' },
    { value: 'NURTURE',    label: 'Nurture',    tone: 'warning' },
  ] as const,
  priorityNote: 'Fast Track et Normal sont contactés par la campagne ; Nurture est gardé de côté.',
  submit: 'Ajouter le lead',
  submitting: 'Ajout en cours...',
  unknownError: 'Erreur inconnue',
  network: 'Erreur réseau : vérifiez votre connexion',
  added: 'Lead ajouté',
  successNoCampaign: 'Lead ajouté à votre base. Associez-le à une campagne pour qu’il soit contacté.',
  successNurture: 'Le lead est lié à votre campagne, en Nurture : il ne sera pas contacté.',
  successActive: 'Le lead est lié à votre campagne en cours : son premier message partira avec la séquence.',
  successInactive: 'Le lead est lié à votre campagne. Lancez-la pour qu’il soit contacté.',
} as const

export const assignCopy = {
  title: 'Assigner à une campagne',
  description: (n: number) => `${n} lead${s(n)} sélectionné${s(n)}`,
  close: 'Fermer',
  campaigns: 'Campagnes',
  noneTitle: 'Aucune campagne disponible',
  noneBody: "Créez une campagne d'abord pour assigner des leads.",
  or: 'ou',
  unassign: 'Désassigner de toute campagne',
  assigning: 'Assignation en cours...',
  confirmUnassign: (n: number) => `Désassigner ${n} lead(s)`,
  confirmAssign: (n: number) => `Assigner ${n} lead(s) à cette campagne`,
  pick: 'Sélectionnez une campagne ci-dessus pour confirmer',
  assigned: 'Leads assignés',
  unassigned: 'Leads désassignés',
  unassignedBody: 'Les leads ne sont plus liés à aucune campagne.',
  queued: (n: number) => `${n} premier${s(n)} message${s(n)} mis en file : ils partent au rythme de votre boîte.`,
  nothingQueued: 'Aucun nouveau lead à contacter (déjà contactés ou non qualifiés).',
  onLaunch: 'Ils partiront quand vous lancerez la campagne.',
  unknownError: 'Erreur inconnue',
  network: 'Erreur réseau : vérifiez votre connexion',
} as const

const planName = (plan: string) => (plan === 'FREE' ? 'gratuite' : (PLAN_CONFIG[plan as keyof typeof PLAN_CONFIG]?.name ?? plan))

export const searchCopy = {
  planName,
  title: 'Prospecter avec IA',
  description: (plan: string) => `Recherche des comptes, vérification des e-mails, score · offre ${planName(plan)}`,
  close: 'Fermer',
  sizes: [
    { value: 'XS', label: '1-10 emp.' },
    { value: 'S',  label: '11-50 emp.' },
    { value: 'M',  label: '51-200 emp.' },
    { value: 'L',  label: '201-1000 emp.' },
    { value: 'XL', label: '1000+ emp.' },
  ] as const,
  counts: [10, 25, 50, 100] as const,
  campaignBanner: 'Ciblage pré-rempli depuis votre campagne. Modifiez si besoin.',
  titles: 'Titres de poste',
  titlesPlaceholder: 'Rechercher ou taper un titre personnalisé...',
  addCustom: 'Ajouter',
  addCustomTitle: 'Ajouter ce titre personnalisé',
  chosenTitles: 'Titres choisis',
  remove: (v: string) => `Retirer ${v}`,
  suggestions: 'Suggestions de titres',
  noSuggestion: (q: string) => `Aucune suggestion : appuyez sur Entrée ou cliquez « Ajouter » pour utiliser « ${q} ».`,
  tip: "Astuce : tapez n'importe quel titre (français, anglais ou personnalisé) puis Entrée.",
  industry: "Secteur d'activité",
  allIndustries: 'Tous les secteurs',
  companySize: "Taille d'entreprise",
  geography: 'Géographie',
  world: 'Monde entier',
  addTo: (label: string) => `Ajouter à : ${label}`,
  locked: (plan: string | null) => (plan ? `Offre ${planName(plan)}` : 'Offre supérieure'),
  people: {
    title: 'Filtres avancés Personne',
    seniority: 'Séniorité',
    jobFunction: 'Fonction métier',
    emailStatus: 'Statut email',
    countries: 'Pays additionnels',
    countriesPlaceholder: 'ex : Belgium, Switzerland...',
  },
  company: {
    title: 'Filtres Entreprise',
    keywords: 'Mots-clés entreprise',
    keywordsPlaceholder: 'ex : AI, B2B, marketplace...',
    exclude: 'Exclure domaines (concurrents)',
    excludeLabel: 'Exclure domaines',
    excludePlaceholder: 'ex : lemlist.com, instantly.ai...',
  },
  finance: {
    title: 'Profil financier (Business)',
    funding: 'Levée de fonds',
    revenue: "Chiffre d'affaires annuel (USD)",
    min: 'Min',
    max: 'Max',
    revenueMin: "Chiffre d'affaires minimum (USD)",
    revenueMax: "Chiffre d'affaires maximum (USD)",
    founded: 'Année de fondation',
    foundedMinPlaceholder: 'ex : 2015',
    foundedMaxPlaceholder: 'ex : 2024',
    foundedMin: 'Fondée au plus tôt en',
    foundedMax: 'Fondée au plus tard en',
    hq: "Siège de l'entreprise",
    hqPlaceholder: 'ex : France, Germany...',
    excludeCountries: 'Exclure pays',
    excludeCountriesPlaceholder: 'ex : Russia, Iran...',
  },
  intent: {
    title: "Signaux d'intention (Enterprise)",
    recentlyJoined: "Vient d'arriver dans l'entreprise (90 derniers jours)",
    recentNews: 'A reçu de la presse récemment',
    recentFunding: 'Levée de fonds récente',
    usingTech: 'Utilise ces technologies',
    usingTechPlaceholder: 'ex : Hubspot, Salesforce...',
    notUsingTech: "N'utilise pas ces technologies (opportunité)",
    notUsingTechLabel: "N'utilise pas ces technologies",
    notUsingTechPlaceholder: 'ex : Pipedrive, Lemlist...',
  },
  leadCount: 'Nombre de leads',
  whatItDoes: 'Ce que fait la prospection',
  steps: [
    { step: '1', label: 'Recherche des comptes',    desc: 'contacts B2B qui correspondent au ciblage' },
    { step: '2', label: 'Vérification des e-mails', desc: 'adresse trouvée puis contrôlée' },
    { step: '3', label: 'Score de priorité',        desc: 'note de 0 à 100 selon votre cible' },
  ],
  launch: 'Lancer la prospection',
  launching: 'Prospection en cours...',
  needTitle: 'Sélectionnez au moins 1 titre de poste',
} as const

export const progressCopy = {
  label: 'Progression de la prospection',
  steps: [
    { id: 'search', label: 'Recherche des comptes', sublabel: 'Contacts qui correspondent à votre ciblage' },
    { id: 'enrich', label: 'Recherche des e-mails', sublabel: 'Adresse trouvée puis vérifiée' },
    { id: 'score',  label: 'Score de priorité',     sublabel: 'Note de 0 à 100 selon votre cible' },
  ] as const,
  done: 'Prospection terminée',
  failed: 'La prospection a échoué',
  running: 'Prospection en cours',
  stepsInOrder: (n: number) => `${n} étapes, dans l'ordre`,
  close: 'Fermer la progression',
  inProgress: 'en cours',
  percent: (n: number) => `${n}${NBSP}%`,
  found: (n: number) => `${n} trouvés`,
  emails: (n: number) => `${n} e-mails`,
  scored: (n: number) => `${n} scorés`,
  summary: (saved: number, enriched: number) => `${saved} leads enregistrés · ${enriched} adresses contrôlées`,
  distribution: 'Répartition des priorités',
  seeLeads: 'Voir les leads',
} as const

export type UpgradeReason = 'leads' | 'campaigns' | 'emails' | 'ai' | 'csv'

export const upgradeCopy = {
  close: 'Fermer',
  reasons: {
    leads: {
      title: 'Vous avez atteint votre limite de leads',
      description: 'Passez à la formule supérieure pour trouver plus de leads chaque mois.',
    },
    campaigns: {
      title: 'Limite de campagnes atteinte',
      description: 'Passez à la formule supérieure pour mener plusieurs campagnes en parallèle.',
    },
    emails: {
      title: "Limite mensuelle d'e-mails atteinte",
      description: 'Passez à la formule supérieure pour continuer vos envois ce mois-ci.',
    },
    ai: {
      title: 'La rédaction IA est incluse dès la formule Pro',
      description: 'Passez à Pro pour faire rédiger et relire vos messages par l’IA.',
    },
    csv: {
      title: "L'export CSV est inclus dès la formule Pro",
      description: 'Passez à Pro pour exporter vos leads vers vos autres outils.',
    },
  } satisfies Record<UpgradeReason, { title: string; description: string }>,
  offers: [
    {
      key: 'PRO',
      description: 'Pour les fondateurs qui lancent leur prospection.',
      perks: ['1 000 leads / mois', 'Campagnes illimitées', '5 e-mails par séquence', 'Rédaction IA et auto-critique', 'Export CSV'],
    },
    {
      key: 'BUSINESS',
      description: 'Pour les équipes commerciales qui passent à l’échelle.',
      badge: 'Recommandé',
      highlight: true,
      perks: ['5 000 leads / mois', '7 e-mails par séquence', 'Boîte de réponses et classification IA', 'Séquences e-mail et LinkedIn', 'Export des leads chauds pour votre CRM (CSV)'],
    },
    {
      key: 'ENTERPRISE',
      description: 'Pour les équipes qui veulent un accompagnement sur mesure.',
      perks: ['Leads et e-mails illimités', 'Séquences e-mail et LinkedIn', 'Export des leads chauds pour votre CRM (CSV)', 'Onboarding accompagné', 'Support prioritaire'],
    },
  ] as const,
  /** 1430 shows as "1 430 €": French grouping, a no-break space before the euro sign. */
  euros: (n: number) => `${fr(n)}${NBSP}€`,
  cycleLabel: 'Périodicité de facturation',
  monthly: 'Mensuel',
  annual: 'Annuel',
  bestPct: (n: number) => `-${n}${NBSP}%`,
  ai: 'IA',
  perMonthAnnual: '/mois, facturé à l’année',
  perMonth: '/mois',
  save: (amount: string, pct: number) => `Économisez ${amount} par an, soit ${pct}${NBSP}%`,
  choose: (name: string) => `Choisir ${name}`,
  billingHref: '/dashboard/settings?tab=billing',
  secure: 'Paiement sécurisé par Stripe',
  noCommitment: 'Sans engagement, résiliable à tout moment',
  refund: 'Satisfait ou remboursé 14 jours',
} as const
