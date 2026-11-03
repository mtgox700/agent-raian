// ─── Campaign Wizard Types ─────────────────────────────────────────────────────

import type { WizardChannel } from '@/lib/types/channels'

export type CampaignGoal = 'leads' | 'demos' | 'sales' | 'awareness'

export type CompanySize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type EmailTone = 'professional' | 'casual' | 'bold' | 'consultative'

export interface EmailStep {
  id: string
  dayOffset: number
  /** Canal d'envoi : 'email' (défaut) ou 'linkedin' (message direct). */
  channel?: WizardChannel
  subject: string
  body: string
  /** LinkedIn premier contact UNIQUEMENT : variante ≤300 caractères envoyée
   *  comme note de demande de connexion quand le prospect n'est pas encore en
   *  relation. `body` reste le DM complet, utilisé une fois l'invitation
   *  acceptée. Undefined sur les steps email et sur les relances. */
  inviteNote?: string
  isAiGenerated: boolean
}

/** Product profile: optional input for the AI ICP advisor (Step 1). */
export interface ProductProfile {
  enabled: boolean
  /** What the user sells, in their own words (drives the analysis). */
  description: string
  website: string
  /** Rough price point: sharpens company-size recommendations. */
  pricing: '' | 'low' | 'mid' | 'high'
}

/** AI-recommended ICP, applied to Step 2 (always user-editable). */
export interface IcpSuggestion {
  targetTitles: string[]
  targetCompanySizes: CompanySize[]
  targetGeos: string[]
  industry: string
  reasoning: string
  appliedAt: string
}

export interface WizardStep1 {
  name: string
  goal: CampaignGoal
  industry: string
  /** Optional AI ICP advisor inputs (undefined = module never opened). */
  product?: ProductProfile
  /** Last applied AI recommendation: shown as a banner on Step 2. */
  icpSuggestion?: IcpSuggestion | null
}

export interface WizardStep2 {
  targetTitles: string[]
  targetCompanySizes: CompanySize[]
  targetGeos: string[]
  excludedDomains: string
}

/** Language the sequence is written in. One language per campaign
 *  bilingual messages scream "mass mailing" and double the length. */
export type MessageLanguage = 'fr' | 'en'

/** Geos whose default outreach language is French. Anything else -> English. */
const FRENCH_SPEAKING_GEOS = new Set([
  'france', 'belgique', 'belgium', 'suisse', 'switzerland',
  'tunisie', 'tunisia', 'maroc', 'morocco', 'algérie', 'algerie', 'algeria',
  'luxembourg', 'monaco', 'québec', 'quebec', 'sénégal', 'senegal',
  "côte d'ivoire", 'cote d\'ivoire',
])

/**
 * Deduce the default sequence language from the campaign's target geos.
 * Majority French-speaking -> 'fr', otherwise 'en'. Used as the smart default
 * in the wizard; the user can always override.
 */
export function deduceLanguageFromGeos(geos: string[]): MessageLanguage {
  if (geos.length === 0) return 'fr'
  const frCount = geos.filter((g) => FRENCH_SPEAKING_GEOS.has(g.trim().toLowerCase())).length
  return frCount >= geos.length - frCount ? 'fr' : 'en'
}

/** One slot of the user-designed outreach pipeline (Jour + canal). */
export interface SequencePlanStep {
  dayOffset: number
  channel: WizardChannel
}

export interface WizardStep3 {
  tone: EmailTone
  valueProposition: string
  emailSteps: EmailStep[]
  /** Relance pipeline chosen BEFORE generation (drives AI channel + timing).
   *  Undefined = legacy goal-based defaults (all email). */
  sequencePlan?: SequencePlanStep[]
  /** Sequence language. Undefined = deduced from target geos at generation. */
  language?: MessageLanguage
}

export interface WizardStep4 {
  leadSource: 'ai' | 'csv' | 'manual'
  estimatedLeads: number
  uploadedFile?: string
  /** "Base existante": leads picked from the workspace, attached at creation. */
  leadIds?: string[]
  /** « Envoyer depuis »: null/absent = the workspace default mailbox. */
  mailboxId?: string | null
  /** Alias of that mailbox, null = the mailbox address. */
  fromAlias?: string | null
}

export interface CampaignWizardData {
  step1: WizardStep1
  step2: WizardStep2
  step3: WizardStep3
  step4: WizardStep4
}

/** The icon is a name: the component that shows a goal picks the drawing. */
export type GoalIcon = 'target' | 'calendar' | 'coins' | 'radio'

export const CAMPAIGN_GOALS: { key: CampaignGoal; label: string; desc: string; icon: GoalIcon; color: string }[] = [
  { key: 'leads', label: 'Générer des leads', desc: 'Identifier et qualifier des prospects froids', icon: 'target', color: 'var(--brand-primary)' },
  { key: 'demos', label: 'Décrocher des démos', desc: 'Convertir les leads en rendez-vous qualifiés', icon: 'calendar', color: 'var(--gold)' },
  { key: 'sales', label: 'Conclure des ventes', desc: 'Réactiver les prospects et accélérer le cycle', icon: 'coins', color: 'var(--gold)' },
  { key: 'awareness', label: 'Se faire connaître', desc: 'Notoriété et visibilité dans votre secteur', icon: 'radio', color: 'rgb(var(--c-muted))' },
]

/**
 * INDUSTRIES: broad B2B sector palette for campaign targeting.
 *
 * Used as the autocomplete option list (SearchableMultiSelect). Apollo matches
 * industry as free-text keywords, so users can also type any custom sector.
 * Kept deliberately wide so Phantera covers virtually any vertical.
 */
export const INDUSTRIES = [
  // ── Tech & Software ──────────────────────────────────────────────
  'SaaS B2B', 'SaaS B2C', 'Logiciel d\'entreprise', 'Cloud Computing',
  'Cybersécurité', 'IA / ML', 'Data & Analytics', 'DevOps & Infrastructure',
  'Développement Web', 'Développement Mobile', 'No-Code / Low-Code',
  'Open Source', 'API & Intégrations', 'IoT', 'Réalité Virtuelle / AR',
  'Blockchain & Web3', 'Gaming & Esport', 'Deep Tech',

  // ── Fintech & Finance ────────────────────────────────────────────
  'FinTech', 'Banque', 'Assurance', 'InsurTech', 'Paiements',
  'Crypto-monnaies', 'Gestion de patrimoine', 'Comptabilité', 'Prêt & Crédit',
  'Capital-risque', 'Private Equity', 'Trading & Marchés',

  // ── Commerce & Retail ────────────────────────────────────────────
  'E-commerce', 'Retail', 'Marketplace', 'D2C / DNVB', 'Mode & Textile',
  'Luxe', 'Beauté & Cosmétique', 'Alimentation & Boissons', 'FoodTech',
  'Grande distribution', 'Mobilier & Décoration',

  // ── Marketing & Media ────────────────────────────────────────────
  'MarTech', 'AdTech', 'Agence Marketing', 'Agence de communication',
  'Relations publiques', 'Média & Presse', 'Édition', 'Streaming & Divertissement',
  'Influence & Créateurs', 'Publicité', 'Design & Création',

  // ── Health & Bio ─────────────────────────────────────────────────
  'HealthTech', 'Santé', 'BioTech', 'Pharmaceutique', 'Dispositifs médicaux',
  'Bien-être & Fitness', 'Télémédecine', 'Recherche médicale',

  // ── Industry & Hard Tech ─────────────────────────────────────────
  'Industrie & Manufacturing', 'Automobile', 'Aéronautique & Spatial',
  'Énergie', 'CleanTech & Renouvelables', 'Construction', 'BTP & Génie civil',
  'Chimie', 'Agriculture & AgriTech', 'Mines & Métaux', 'Textile industriel',

  // ── Services & Pro ───────────────────────────────────────────────
  'Consulting', 'Conseil en stratégie', 'Cabinet d\'avocats', 'LegalTech',
  'Comptabilité & Audit', 'Ressources Humaines', 'RH & Recrutement', 'HRTech',
  'Services aux entreprises', 'Externalisation / BPO', 'Centre d\'appels',

  // ── Real Estate & Mobility ───────────────────────────────────────
  'PropTech', 'Immobilier', 'Immobilier commercial', 'Logistique',
  'Transport & Mobilité', 'Supply Chain', 'Livraison & Last-Mile',
  'Aviation', 'Maritime & Shipping',

  // ── Education & Public ───────────────────────────────────────────
  'EdTech', 'Éducation & Formation', 'Université & Recherche',
  'Secteur public', 'Gouvernement', 'ONG & Associations', 'Défense',

  // ── Travel & Hospitality ─────────────────────────────────────────
  'Tourisme & Voyage', 'TravelTech', 'Hôtellerie', 'Restauration',
  'Événementiel', 'Sport & Loisirs',

  // ── Other ────────────────────────────────────────────────────────
  'Télécommunications', 'Utilities', 'Environnement & Durabilité',
  'Services financiers', 'Conseil IT / ESN',
] as const

/**
 * JOB_TITLES: Comprehensive B2B job title list (FR + EN).
 *
 * Apollo's `person_titles[]` is free-text matching across 250M+ contacts.
 * This list is just the quick-pick UI palette: users can also add
 * any custom title via the "+ Add custom title" input.
 *
 * Organized by category for readability. Total: ~150 titles covering
 * 99% of B2B prospecting use cases.
 */
// Raw list: may contain duplicates across categories. Deduped on export below.
const RAW_JOB_TITLES = [
  // ── C-Suite & Founders ──────────────────────────────────────────────
  'CEO', 'Founder', 'Co-Founder', 'CTO', 'CMO', 'COO', 'CFO', 'CHRO',
  'CISO', 'CDO', 'CPO', 'CRO', 'CIO', 'CSO', 'CCO', 'CXO',
  'Chief Data Officer', 'Chief AI Officer', 'Chief Strategy Officer',
  'Chief Customer Officer', 'Chief Marketing Officer', 'Chief Revenue Officer',
  'Chief Product Officer', 'Chief Information Officer', 'Chief Operating Officer',
  'Chief Financial Officer', 'Chief Technology Officer', 'Chief Security Officer',
  'Managing Director', 'Owner', 'Partner', 'Managing Partner',
  'President', 'Vice President', 'Executive Vice President',

  // ── VPs ──────────────────────────────────────────────────────────────
  'VP Sales', 'VP Marketing', 'VP Engineering', 'VP Product',
  'VP Operations', 'VP Finance', 'VP People', 'VP Customer Success',
  'VP Revenue', 'VP Growth', 'VP Strategy', 'VP Business Development',
  'VP Data', 'VP Analytics', 'VP HR', 'VP Legal', 'VP Design',
  'VP Partnerships', 'VP Communications', 'VP International',

  // ── Heads of ─────────────────────────────────────────────────────────
  'Head of Sales', 'Head of Marketing', 'Head of Growth', 'Head of Product',
  'Head of Engineering', 'Head of Operations', 'Head of Finance',
  'Head of People', 'Head of HR', 'Head of Customer Success',
  'Head of Revenue', 'Head of Data', 'Head of Analytics', 'Head of Design',
  'Head of Strategy', 'Head of BD', 'Head of Partnerships', 'Head of Legal',
  'Head of Security', 'Head of IT', 'Head of AI', 'Head of ML',
  'Head of Procurement', 'Head of Supply Chain', 'Head of Customer Experience',
  'Head of Talent', 'Head of Brand', 'Head of Content', 'Head of SEO',

  // ── Directors ────────────────────────────────────────────────────────
  'Director of Sales', 'Director of Marketing', 'Director of Revenue',
  'Director of Operations', 'Director of Engineering', 'Director of Product',
  'Director of Finance', 'Director of HR', 'Director of People',
  'Director of Customer Success', 'Director of Business Development',
  'Director of Partnerships', 'Director of Strategy', 'Director of Data',
  'Director of Analytics', 'Director of Legal', 'Director of Procurement',
  'Marketing Director', 'Finance Director',
  'Operations Director', 'IT Director', 'HR Director', 'Commercial Director',

  // ── Engineering & Tech ───────────────────────────────────────────────
  'Engineering Manager', 'Software Engineering Manager', 'Tech Lead',
  'Staff Engineer', 'Principal Engineer', 'Senior Software Engineer',
  'DevOps Manager', 'Platform Engineering Lead', 'Infrastructure Lead',
  'Data Engineering Manager', 'ML Engineering Manager', 'QA Manager',

  // ── Sales ────────────────────────────────────────────────────────────
  'Sales Manager', 'Account Executive', 'AE',
  'Account Manager', 'Key Account Manager', 'Enterprise Account Executive',
  'BDR', 'SDR', 'Business Development Representative',
  'Sales Development Representative', 'RevOps Manager', 'Revenue Operations Manager',
  'Inside Sales Manager', 'Field Sales Manager', 'Channel Sales Manager',
  'Partner Manager', 'Strategic Account Manager',

  // ── Marketing & Growth ──────────────────────────────────────────────
  'Marketing Manager', 'Product Marketing Manager', 'Growth Manager',
  'Growth Marketing Manager', 'Demand Generation Manager', 'Brand Manager',
  'Content Marketing Manager', 'SEO Manager', 'Performance Marketing Manager',
  'Marketing Operations Manager', 'Lifecycle Marketing Manager',
  'Field Marketing Manager', 'Communications Manager',

  // ── Product ──────────────────────────────────────────────────────────
  'Product Manager', 'Senior Product Manager', 'Group Product Manager',
  'Principal Product Manager', 'Product Owner', 'Technical Product Manager',

  // ── Customer Success & Support ──────────────────────────────────────
  'Customer Success Manager', 'CSM', 'Customer Success Director',
  'Customer Experience Manager', 'Support Manager', 'Customer Support Lead',
  'Onboarding Manager', 'Implementation Manager',

  // ── Finance ──────────────────────────────────────────────────────────
  'Finance Manager', 'Controller', 'Treasurer', 'FP&A Manager',
  'Financial Analyst', 'Accounting Manager', 'Tax Director',

  // ── HR / People ──────────────────────────────────────────────────────
  'HR Manager', 'People Operations Manager', 'Talent Acquisition Manager',
  'Recruiting Manager', 'Learning & Development Manager', 'HRBP',
  'Compensation Manager', 'Diversity & Inclusion Manager',

  // ── Operations ───────────────────────────────────────────────────────
  'Operations Manager', 'Business Operations Manager', 'Strategy & Operations Manager',
  'Supply Chain Manager', 'Logistics Manager', 'Procurement Manager',
  'Vendor Manager',

  // ── Data, Analytics & AI ────────────────────────────────────────────
  'Data Scientist', 'Senior Data Scientist', 'Data Analyst Lead',
  'Analytics Manager', 'BI Manager', 'ML Engineer', 'AI Engineer',
  'Data Engineer Lead',

  // ── Legal, IT & Security ────────────────────────────────────────────
  'General Counsel', 'Legal Counsel', 'Compliance Manager', 'DPO',
  'Data Protection Officer', 'IT Manager', 'IT Director',
  'Information Security Manager', 'Security Engineer Lead',
  'Privacy Manager',

  // ── Design ───────────────────────────────────────────────────────────
  'Design Director', 'Design Manager', 'UX Manager', 'Principal Designer',
  'Head of Design', 'Creative Director',

  // ── Versions françaises courantes ───────────────────────────────────
  'Directeur Général', 'Directeur Commercial', 'Directeur Marketing',
  'Directeur Technique', 'Directeur des Opérations', 'Directeur Financier',
  'Directeur des Ressources Humaines', 'Directeur des Ventes',
  'Directeur du Développement', 'Responsable Commercial',
  'Responsable Marketing', 'Responsable RH', 'Responsable IT',
  'Chef de Produit', 'Chef de Projet', 'Fondateur',
]

/**
 * Deduped, frozen job titles list. Safe to use as React keys.
 * Order preserved: first occurrence wins.
 */
export const JOB_TITLES: readonly string[] = Object.freeze(
  Array.from(new Set(RAW_JOB_TITLES)),
)

export const GEOS = [
  'France', 'Belgique', 'Suisse', 'Canada', 'Allemagne',
  'Espagne', 'Italie', 'Pays-Bas', 'UK', 'USA',
]

export const TONES: { key: EmailTone; label: string; desc: string }[] = [
  { key: 'professional', label: 'Professionnel', desc: 'Formel, structuré, crédible' },
  { key: 'casual', label: 'Décontracté', desc: 'Humain, direct, conversationnel' },
  { key: 'bold', label: 'Audacieux', desc: 'Provocateur, disruptif, mémorable' },
  { key: 'consultative', label: 'Consultatif', desc: 'Expert, apporte un éclairage utile' },
]

export const DEFAULT_WIZARD_DATA: CampaignWizardData = {
  step1: { name: '', goal: 'leads', industry: '' },
  step2: { targetTitles: [], targetCompanySizes: [], targetGeos: [], excludedDomains: '' },
  step3: { tone: 'professional', valueProposition: '', emailSteps: [] },
  step4: { leadSource: 'ai', estimatedLeads: 200 },
}
