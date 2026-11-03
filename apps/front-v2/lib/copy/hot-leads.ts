/**
 * Texts of the Hot leads screen (/dashboard/leads/hot), word for word from
 * body n°1 (app/(dashboard)/dashboard/leads/hot, HotLeadsTable,
 * HotLeadsExportButton, FunnelWidget).
 */
import type { BadgeTone } from '@/components/ui'

const NBSP = String.fromCharCode(160)
const s = (n: number) => (n !== 1 ? 's' : '')

export const hotLeadsCopy = {
  title: 'Leads chauds',
  description: (n: number) => `${n} lead${s(n)} chaud${s(n)} : répondez maintenant`,
  /** Reply classification: label and tone (a person said yes = signal, no = danger). */
  classification: {
    POSITIVE:        { label: 'Positif',       tone: 'signal' },
    MEETING_REQUEST: { label: 'Rendez-vous',   tone: 'signal' },
    NEUTRAL:         { label: 'Neutre',        tone: 'neutral' },
    NEGATIVE:        { label: 'Négatif',       tone: 'danger' },
    NOT_INTERESTED:  { label: 'Pas intéressé', tone: 'neutral' },
  } as Record<string, { label: string; tone: BadgeTone }>,
  unknownClassification: { label: 'Inconnu', tone: 'neutral' } as { label: string; tone: BadgeTone },
  score: 'Score ',
  ago: (iso: string | null) => {
    if (!iso) return '-'
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
    if (mins < 1) return "à l'instant"
    if (mins < 60) return `il y a ${mins}min`
    const h = Math.floor(mins / 60)
    if (h < 24) return `il y a ${h}h`
    return `il y a ${Math.floor(h / 24)}j`
  },
  statusActions: [
    { status: 'contacted', label: 'Marquer contacté' },
    { status: 'qualified', label: 'Qualifier' },
    { status: 'converted', label: 'Deal gagné' },
    { status: 'lost',      label: 'Deal perdu' },
  ] as const,
  statusMenu: 'Changer le statut',
  statusButton: 'Statut',
  replyTitle: 'Répondre par e-mail',
  replyLabel: (name: string) => `Répondre par e-mail à ${name}`,
  listLabel: 'Leads chauds',
  emptyTitle: "Aucun lead chaud pour l'instant",
  emptyBody: "Dès qu'un prospect répond positivement, il apparaîtra ici",
  export: {
    label: 'Exporter pour CRM',
    title: 'Télécharger les leads chauds au format CSV prêt pour votre CRM',
    lockedTitle: 'Export CSV réservé aux plans payants',
    filename: (date: string) => `leads-chauds-crm-${date}.csv`,
    headers: [
      'Prénom', 'Nom', 'Email', 'Entreprise', 'Poste', 'Secteur',
      'LinkedIn', 'Site web', 'Score IA', 'Statut',
      'Classification réponse', 'Extrait de la réponse', 'Date de réponse', 'Campagne',
    ],
    classification: {
      POSITIVE:        'Intéressé',
      MEETING_REQUEST: 'Rendez-vous demandé',
      NEUTRAL:         'Neutre',
      NEGATIVE:        'Négatif',
      NOT_INTERESTED:  'Pas intéressé',
    } as Record<string, string>,
  },
  funnel: {
    title: 'Entonnoir de conversion',
    meta: 'leads, depuis le début',
    /** Reaching and delivering is the machine (accent), a reply and what follows is a person (signal). */
    tone: {
      'Contactés':        'accent',
      'Sans rebond':      'accent',
      'Ont répondu':      'signal',
      'Réponse positive': 'signal',
      'Qualifiés':        'signal',
    } as Record<string, 'accent' | 'signal'>,
    percent: (n: number) => `${n.toLocaleString('fr-FR')}${NBSP}%`,
  },
} as const
