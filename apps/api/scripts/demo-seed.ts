/**
 * Sandbox only: a demo workspace for the marketing screenshots of the
 * dashboard. Every person and company is fictional (.example domains), and
 * every counter is derived from the rows written here. Deterministic: the
 * same seed gives the same data, relative to the day it runs.
 *
 *   npx tsx --env-file=.env.local scripts/demo-seed.ts            seed (replaces the previous demo)
 *   npx tsx --env-file=.env.local scripts/demo-seed.ts --remove   delete the demo workspace
 *
 * The workspace « Démo (données fictives) » is owned by the user who owns
 * « Wiiw ». Re-running deletes that workspace (and only it) and rebuilds it.
 * Alerts come from the real sweep (lib/insights/sweep) run on the seeded rows.
 * Refuses to run against anything but localhost:45432/phantera_wr.
 */

import { PrismaClient, type CampaignStatus, type LeadScoreBadge, type Prisma, type StepChannel, type TargetCompanySize } from '@prisma/client'
import { scoreToBadge } from '@/lib/leads/badges'
import { buildReplyNotification } from '@/lib/services/notifications.service'
import { sweepWorkspace } from '@/lib/insights/sweep'

const DEMO_NAME = 'Démo (données fictives)'
const OWNER_WORKSPACE = 'Wiiw'
const SEED = 20261026
const DAY = 86_400_000
const HOUR = 3_600_000
const SENDER = { first: 'Camille', last: 'Rousset', company: 'Horalys', domain: 'horalys.example' }

function assertSandbox(): void {
  const m = /@([^/@]+)\/([^?]+)/.exec(process.env.DATABASE_URL ?? '')
  if (!m || m[1] !== 'localhost:45432' || m[2] !== 'phantera_wr') {
    throw new Error('demo-seed runs on the local sandbox (localhost:45432/phantera_wr) only')
  }
}

// ─── Deterministic randomness ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(SEED)
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
function weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of items) { r -= w; if (r <= 0) return v }
  return items[items.length - 1][0]
}

/**
 * Exact proportions without luck: each draw adds `p` to a counter per key and
 * fires when it crosses 1, from a random phase. 100 draws at 5 % fire 5 times.
 */
const strides = new Map<string, number>()
function stride(key: string, p: number): boolean {
  const acc = (strides.get(key) ?? rand()) + p
  strides.set(key, acc >= 1 ? acc - 1 : acc)
  return acc >= 1
}

// ─── Paris time ──────────────────────────────────────────────────────────────

const PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
function parisParts(d: Date) {
  const p = Object.fromEntries(PARIS.formatToParts(d).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, wd: p.weekday as string }
}
function parisOffset(d: Date): number {
  const p = parisParts(d)
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(d.getTime() / 1000) * 1000
}
/** The instant at hh:mm Paris time on the Paris calendar day `daysAgo` days before `now`. */
function parisAt(now: Date, daysAgo: number, h: number, min: number): Date {
  const p = parisParts(new Date(now.getTime() - daysAgo * DAY))
  const guess = Date.UTC(p.y, p.m - 1, p.d, h, min)
  return new Date(guess - parisOffset(new Date(guess)))
}
function isWeekend(now: Date, daysAgo: number): boolean {
  const wd = parisParts(new Date(now.getTime() - daysAgo * DAY + 12 * HOUR)).wd
  return wd === 'Sat' || wd === 'Sun'
}
/** Moves a day off the weekend: forward to Monday, or back to Friday when Monday is in the future. */
function workday(now: Date, daysAgo: number): number {
  let d = daysAgo
  while (isWeekend(now, d)) d -= 1
  if (d < 0) { d = daysAgo; while (isWeekend(now, d)) d += 1 }
  return d
}
/** Office hours, heavier mid-morning and mid-afternoon. */
function officeHour(): [number, number] {
  const h = weighted([[8, 2], [9, 6], [10, 7], [11, 5], [12, 1], [13, 2], [14, 6], [15, 6], [16, 4], [17, 2]] as const)
  return [h, int(0, 59)]
}

// ─── Fictional people and companies ──────────────────────────────────────────

const FIRST_F = ['Camille', 'Claire', 'Sophie', 'Julie', 'Émilie', 'Aurélie', 'Céline', 'Laure', 'Marion', 'Hélène', 'Nathalie', 'Isabelle', 'Anne', 'Pauline', 'Élodie', 'Sandrine', 'Caroline', 'Mathilde', 'Delphine', 'Virginie', 'Agnès', 'Sarah', 'Léa', 'Manon', 'Charlotte', 'Inès', 'Lucie', 'Florence', 'Valérie', 'Stéphanie']
const FIRST_M = ['Julien', 'Nicolas', 'Thomas', 'Sébastien', 'Mathieu', 'Guillaume', 'Antoine', 'Romain', 'Vincent', 'Olivier', 'Laurent', 'François', 'Pierre', 'Jérôme', 'Benoît', 'Arnaud', 'Damien', 'Xavier', 'Cédric', 'Fabien', 'Hugo', 'Maxime', 'Alexandre', 'Yann', 'Karim', 'Mehdi', 'Stéphane', 'Philippe', 'Grégoire', 'Bastien']
const LAST = ['Martin', 'Bernard', 'Durand', 'Lefebvre', 'Moreau', 'Laurent', 'Girard', 'Roux', 'Fournier', 'Morel', 'Mercier', 'Blanc', 'Guérin', 'Boyer', 'Garnier', 'Chevalier', 'François', 'Legrand', 'Gauthier', 'Perrin', 'Robin', 'Clément', 'Morin', 'Nicolas', 'Henry', 'Roussel', 'Mathieu', 'Gautier', 'Masson', 'Marchand', 'Duval', 'Denis', 'Dumont', 'Marie', 'Lemaire', 'Noël', 'Meyer', 'Dufour', 'Meunier', 'Brun', 'Blanchard', 'Giraud', 'Joly', 'Rivière', 'Lucas', 'Brunet', 'Gaillard', 'Barbier', 'Arnaud', 'Martinez', 'Gérard', 'Roche', 'Renard', 'Schmitt', 'Roy', 'Leroux', 'Colin', 'Vidal', 'Caron', 'Picard', 'Fabre', 'Aubert', 'Lemoine', 'Renaud', 'Dumas', 'Lacroix', 'Olivier', 'Philippe', 'Bourgeois', 'Pierre', 'Benoît', 'Rey', 'Leclerc', 'Payet', 'Rolland', 'Leclercq', 'Guillaume', 'Lecomte', 'Lopez', 'Jean', 'Dupuy', 'Guillot', 'Hubert', 'Berger', 'Carpentier', 'Sanchez', 'Dupuis', 'Moulin', 'Louis', 'Deschamps', 'Huet', 'Vasseur', 'Perez', 'Boucher', 'Fleury', 'Royer', 'Klein', 'Jacquet', 'Adam', 'Paris', 'Poirier', 'Marty', 'Aubry', 'Guyot', 'Carré', 'Charles', 'Renault', 'Charpentier', 'Ménard', 'Maillard', 'Baron', 'Bertin', 'Bailly', 'Hervé', 'Schneider', 'Fernandez', 'Le Gall', 'Collet', 'Léger', 'Bouvier', 'Julien', 'Prévost', 'Millet', 'Perrot', 'Daniel', 'Le Roux', 'Cousin', 'Germain', 'Breton', 'Besson', 'Langlois', 'Rémy', 'Le Goff', 'Pelletier', 'Lévêque', 'Perrier', 'Leblanc', 'Barré', 'Lebrun', 'Marchal', 'Weber', 'Mallet', 'Hamon', 'Boulanger', 'Jacob', 'Monnier', 'Michaud', 'Rodriguez', 'Guichard', 'Gillet', 'Étienne', 'Grondin', 'Poulain', 'Tessier', 'Chevallier', 'Collin', 'Chauvin', 'Da Silva', 'Bouchet', 'Gay', 'Lemaître', 'Bénard', 'Maréchal', 'Humbert', 'Reynaud', 'Antoine', 'Hoarau', 'Perret', 'Barthélemy', 'Cordier', 'Pichon', 'Lejeune', 'Gilbert', 'Lamy', 'Delaunay', 'Pasquier', 'Carlier', 'Laporte']
/** Invented roots, combined so the names read as small French firms, not real brands. */
const ROOT_A = ['Bré', 'Cal', 'Dor', 'Ever', 'Fal', 'Gal', 'Hel', 'Ival', 'Jor', 'Kel', 'Lum', 'Mor', 'Nev', 'Orv', 'Pel', 'Quin', 'Ros', 'Sav', 'Tel', 'Ulv', 'Vel', 'Zel']
const ROOT_B = ['ance', 'ys', 'éo', 'ane', 'ix', 'ora', 'alis', 'ène', 'ium', 'aro']

const usedCompanies = new Set<string>()
const usedEmails = new Set<string>()

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'et').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function companyName(patterns: ReadonlyArray<(root: string, family: string) => string>): string {
  for (;;) {
    const root = pick(ROOT_A) + pick(ROOT_B)
    const name = pick(patterns)(root, pick(LAST))
    if (!usedCompanies.has(name)) { usedCompanies.add(name); return name }
  }
}
function person(): { firstName: string; lastName: string; female: boolean } {
  const female = rand() < 0.42
  return { firstName: pick(female ? FIRST_F : FIRST_M), lastName: pick(LAST), female }
}

// ─── Campaign specs ──────────────────────────────────────────────────────────

interface StepSpec { channel: StepChannel; dayOffset: number; subject: string; body: string; inviteNote?: string; link?: boolean }
interface IndustrySpec { industry: string; weight: number; replyRate: number }
interface CampaignSpec {
  key: string
  name: string
  status: CampaignStatus
  leads: number
  /** First contacts spread from startDaysAgo down to startDaysAgo - span. */
  startDaysAgo: number
  span: number
  industries: IndustrySpec[]
  titles: ReadonlyArray<readonly [string, string]>
  sizes: ReadonlyArray<readonly [TargetCompanySize, number]>
  geos: string[]
  companyPatterns: ReadonlyArray<(root: string, family: string) => string>
  /** Share of first emails that bounce; `recentBounce` applies to first contacts of the last 8 days. */
  bounce: number
  recentBounce?: number
  /** The last N leads (a freshly imported list) get their first message within the last five working days. */
  recentBatch?: number
  pausedDaysAgo?: number
  /** Leads of this industry whose first message is queued (PENDING) this morning. */
  pending?: { industry: string; count: number }
  goal: 'LEADS' | 'DEMOS'
  tone: 'PROFESSIONAL' | 'CASUAL' | 'CONSULTATIVE'
  valueProposition: string
  steps: StepSpec[]
}

const SIGN = '\n\nCamille Rousset\nHoralys'

const CAMPAIGNS: CampaignSpec[] = [
  {
    key: 'esn', name: 'ESN Lyon : directeurs techniques', status: 'ACTIVE', leads: 150, startDaysAgo: 44, span: 40,
    industries: [{ industry: 'ESN', weight: 1, replyRate: 0.17 }],
    titles: [['Directeur technique', 'Directrice technique'], ['DSI', 'DSI'], ['Directeur des opérations', 'Directrice des opérations'], ['Responsable delivery', 'Responsable delivery'], ['CTO', 'CTO']],
    sizes: [['S', 3], ['M', 5], ['L', 2]], geos: ['Lyon', 'Villeurbanne', 'Grenoble'],
    companyPatterns: [(r) => `${r} Informatique`, (r) => `${r} Digital`, (_, f) => `Groupe ${f} Numérique`, (r) => `${r} Services numériques`, (_, f) => `${f} IT Conseil`],
    bounce: 0.065, goal: 'DEMOS', tone: 'CONSULTATIVE',
    valueProposition: 'Relier les feuilles de temps des consultants à la facturation pour clôturer le mois en deux jours.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Temps passés chez {{company}}', body: 'Bonjour {{firstName}},\n\nDans les ESN que nous suivons, les feuilles de temps arrivent souvent en retard et la facturation au temps passé glisse de quelques jours chaque mois.\n\nEst-ce aussi un sujet chez {{company}} ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 2, subject: '', body: 'Bonjour {{firstName}}, je travaille avec plusieurs ESN de la région lyonnaise sur le suivi des temps et la facturation. Ravie d\'échanger si le sujet vous parle.', inviteNote: 'Bonjour {{firstName}}, je travaille avec des ESN lyonnaises sur le suivi des temps et la facturation. Ravie d\'échanger si le sujet vous parle.' },
      { channel: 'EMAIL', dayOffset: 5, subject: 'Re: Temps passés chez {{company}}', body: 'Bonjour {{firstName}},\n\nUn exemple : une ESN de 80 consultants a ramené sa clôture mensuelle de six jours à deux en reliant les temps validés à la facturation.\n\nJe vous montre comment en 20 minutes ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 10, subject: 'Un cas client en deux pages', body: 'Bonjour {{firstName}},\n\nJe vous laisse le cas client dont je vous parlais, il se lit en trois minutes : https://www.horalys.example/cas-client-esn\n\nSi c\'est utile pour {{company}}, je suis disponible cette semaine.' + SIGN, link: true },
      { channel: 'EMAIL', dayOffset: 16, subject: 'Je clos le sujet', body: 'Bonjour {{firstName}},\n\nSans retour de votre part, je n\'insiste pas. Si le suivi des temps redevient une priorité chez {{company}}, je reste joignable.\n\nBonne journée,' + SIGN },
    ],
  },
  {
    key: 'rh', name: 'Cabinets RH Paris : associés et directeurs', status: 'ACTIVE', leads: 122, startDaysAgo: 36, span: 33,
    industries: [{ industry: 'Cabinet RH', weight: 0.52, replyRate: 0.12 }, { industry: 'Intérim', weight: 0.48, replyRate: 0 }],
    titles: [['Associé', 'Associée'], ['Directeur d\'agence', 'Directrice d\'agence'], ['Directeur des opérations', 'Directrice des opérations'], ['Responsable administratif et financier', 'Responsable administrative et financière']],
    sizes: [['XS', 3], ['S', 5], ['M', 2]], geos: ['Paris', 'Hauts-de-Seine'],
    companyPatterns: [(_, f) => `Cabinet ${f} RH`, (r) => `${r} Talents`, (_, f) => `${f} & Associés Recrutement`, (r) => `${r} Intérim`, (r) => `${r} Ressources Humaines`],
    bounce: 0.065, pending: { industry: 'Intérim', count: 26 }, goal: 'DEMOS', tone: 'PROFESSIONAL',
    valueProposition: 'Suivre les missions, les temps des consultants et la refacturation client dans un seul outil.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Refacturation des missions chez {{company}}', body: 'Bonjour {{firstName}},\n\nLes cabinets que nous équipons passaient en moyenne une journée par mois à rapprocher les temps des consultants et les factures clients.\n\nComment cela se passe-t-il chez {{company}} ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 3, subject: '', body: 'Bonjour {{firstName}}, je vous ai écrit au sujet de la refacturation des missions. Je serais ravie d\'avoir votre avis, même rapide.', inviteNote: 'Bonjour {{firstName}}, je vous ai écrit au sujet de la refacturation des missions. Ravie d\'avoir votre avis, même rapide.' },
      { channel: 'EMAIL', dayOffset: 6, subject: 'Re: Refacturation des missions chez {{company}}', body: 'Bonjour {{firstName}},\n\nConcrètement : chaque temps validé part en facture le jour même, sans ressaisie. Un échange de 15 minutes pour voir si c\'est adapté à {{company}} ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 12, subject: 'Dernier message', body: 'Bonjour {{firstName}},\n\nJe ne veux pas encombrer votre boîte. Si le sujet revient sur la table, il vous suffit de répondre à ce message.' + SIGN },
    ],
  },
  {
    key: 'saas', name: 'Éditeurs SaaS B2B, relance Q4', status: 'ACTIVE', leads: 98, startDaysAgo: 21, span: 17,
    industries: [{ industry: 'Éditeur de logiciels', weight: 1, replyRate: 0.03 }],
    titles: [['Directeur administratif et financier', 'Directrice administrative et financière'], ['Directeur général', 'Directrice générale'], ['Directeur des opérations', 'Directrice des opérations'], ['Responsable Customer Success', 'Responsable Customer Success']],
    sizes: [['S', 4], ['M', 4], ['L', 1]], geos: ['France'],
    companyPatterns: [(r) => `${r} Software`, (r) => `${r} Cloud`, (r) => `${r} Logiciels`, (_, f) => `${f} Solutions`, (r) => `${r} Data`],
    bounce: 0.03, recentBounce: 0.35, recentBatch: 28, goal: 'DEMOS', tone: 'CASUAL',
    valueProposition: 'Facturer les prestations de services et le temps des équipes projet sans fichier Excel.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Votre clôture de fin d\'année', body: 'Bonjour {{firstName}},\n\nFin d\'année oblige, beaucoup d\'éditeurs nous parlent du temps perdu à facturer les prestations de mise en place à partir des temps des équipes projet.\n\nEst-ce un point qui coince chez {{company}} ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 3, subject: 'Re: Votre clôture de fin d\'année', body: 'Bonjour {{firstName}},\n\nJe me permets de remonter mon message. Nos clients éditeurs ont arrêté le fichier de suivi des prestations en trois semaines.\n\nUn créneau de 20 minutes avant la fin du mois ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 5, subject: '', body: 'Bonjour {{firstName}}, je travaille avec des éditeurs SaaS sur la facturation des prestations de services. Je serais ravie d\'échanger.', inviteNote: 'Bonjour {{firstName}}, je travaille avec des éditeurs SaaS sur la facturation des prestations. Ravie d\'échanger.' },
      { channel: 'EMAIL', dayOffset: 9, subject: 'Trois minutes de lecture', body: 'Bonjour {{firstName}},\n\nVoici comment un éditeur de 60 personnes facture désormais ses prestations le jour de la recette : https://www.horalys.example/cas-client-saas' + SIGN, link: true },
      { channel: 'EMAIL', dayOffset: 14, subject: 'Je vous laisse tranquille', body: 'Bonjour {{firstName}},\n\nC\'est mon dernier message sur le sujet. Si cela devient prioritaire chez {{company}} en début d\'année, je serai là.' + SIGN },
    ],
  },
  {
    key: 'agences', name: 'Agences marketing Bordeaux et Nantes', status: 'PAUSED', leads: 72, startDaysAgo: 30, span: 18, pausedDaysAgo: 6,
    industries: [{ industry: 'Agence marketing', weight: 0.6, replyRate: 0.025 }, { industry: 'Agence de communication', weight: 0.4, replyRate: 0.025 }],
    titles: [['Directeur général', 'Directrice générale'], ['Directeur de production', 'Directrice de production'], ['Directeur de clientèle', 'Directrice de clientèle'], ['Fondateur', 'Fondatrice']],
    sizes: [['XS', 4], ['S', 5], ['M', 1]], geos: ['Bordeaux', 'Nantes'],
    companyPatterns: [(r) => `Agence ${r}`, (_, f) => `Studio ${f}`, (r) => `${r} Communication`, (r) => `${r} & Co`, (_, f) => `Atelier ${f}`],
    bounce: 0.065, goal: 'LEADS', tone: 'CASUAL',
    valueProposition: 'Savoir projet par projet si le temps passé dépasse le budget vendu, avant la fin du projet.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Budget vendu, temps passé', body: 'Bonjour {{firstName}},\n\nDans beaucoup d\'agences, on découvre qu\'un projet a dépassé son budget au moment de facturer. Chez {{company}}, vous le voyez venir en cours de route ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 4, subject: 'Re: Budget vendu, temps passé', body: 'Bonjour {{firstName}},\n\nNos agences clientes reçoivent une alerte dès qu\'un projet consomme 80 % du temps vendu. Je vous montre en 15 minutes ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 7, subject: '', body: 'Bonjour {{firstName}}, j\'échange avec des agences de l\'Ouest sur la rentabilité des projets. Ravie de vous compter dans mon réseau.', inviteNote: 'Bonjour {{firstName}}, j\'échange avec des agences de l\'Ouest sur la rentabilité des projets. Ravie de vous compter dans mon réseau.' },
      { channel: 'EMAIL', dayOffset: 12, subject: 'Dernière relance', body: 'Bonjour {{firstName}},\n\nJe n\'insiste pas davantage. Si la rentabilité par projet devient un sujet chez {{company}}, il suffit de répondre à ce message.' + SIGN },
    ],
  },
  {
    key: 'industrie', name: 'Industriels PME Rhône-Alpes : directeurs d\'usine', status: 'COMPLETED', leads: 85, startDaysAgo: 45, span: 9,
    industries: [{ industry: 'Industrie mécanique', weight: 0.45, replyRate: 0.035 }, { industry: 'Plasturgie', weight: 0.3, replyRate: 0.035 }, { industry: 'Agroalimentaire', weight: 0.25, replyRate: 0.035 }],
    titles: [['Directeur d\'usine', 'Directrice d\'usine'], ['Responsable de production', 'Responsable de production'], ['Directeur industriel', 'Directrice industrielle'], ['DRH', 'DRH']],
    sizes: [['S', 3], ['M', 5], ['L', 2]], geos: ['Rhône', 'Isère', 'Loire', 'Savoie'],
    companyPatterns: [(_, f) => `${f} Industrie`, (r) => `${r} Mécanique`, (_, f) => `Ateliers ${f}`, (r) => `${r} Plastiques`, (_, f) => `Établissements ${f}`, (r) => `${r} Agro`],
    bounce: 0.065, goal: 'DEMOS', tone: 'PROFESSIONAL',
    valueProposition: 'Remplacer les feuilles de pointage papier de l\'atelier par une saisie au poste, reliée à la paie.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Pointage atelier chez {{company}}', body: 'Bonjour {{firstName}},\n\nLes PME industrielles que nous équipons ressaisissaient chaque semaine les feuilles de pointage de l\'atelier pour la paie.\n\nEst-ce encore le cas chez {{company}} ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 2, subject: '', body: 'Bonjour {{firstName}}, je travaille avec des industriels de la région sur le pointage atelier. Au plaisir d\'échanger.', inviteNote: 'Bonjour {{firstName}}, je travaille avec des industriels de la région sur le pointage atelier. Au plaisir d\'échanger.' },
      { channel: 'EMAIL', dayOffset: 5, subject: 'Re: Pointage atelier chez {{company}}', body: 'Bonjour {{firstName}},\n\nUne usine de 140 salariés près de Vienne a supprimé quatre heures de ressaisie par semaine. Un échange de 20 minutes pour voir si c\'est transposable ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 9, subject: 'Le cas en image', body: 'Bonjour {{firstName}},\n\nLe déroulé du projet, avec les écrans de l\'atelier : https://www.horalys.example/cas-client-industrie' + SIGN, link: true },
      { channel: 'LINKEDIN', dayOffset: 13, subject: '', body: 'Bonjour {{firstName}}, je me permets un dernier mot ici : si le pointage atelier revient dans vos priorités, je reste disponible.' },
      { channel: 'EMAIL', dayOffset: 18, subject: 'Je clos le dossier', body: 'Bonjour {{firstName}},\n\nJe ne vous relancerai plus sur ce sujet. Merci pour votre attention et bonne continuation à {{company}}.' + SIGN },
    ],
  },
  {
    key: 'conseil', name: 'Cabinets de conseil Lille : associés', status: 'DRAFT', leads: 40, startDaysAgo: 3, span: 0,
    industries: [{ industry: 'Conseil en management', weight: 1, replyRate: 0 }],
    titles: [['Associé', 'Associée'], ['Directeur associé', 'Directrice associée'], ['Manager', 'Manager'], ['Directeur administratif et financier', 'Directrice administrative et financière']],
    sizes: [['XS', 3], ['S', 5], ['M', 2]], geos: ['Lille', 'Nord'],
    companyPatterns: [(_, f) => `${f} Conseil`, (r) => `${r} Partners`, (_, f) => `Cabinet ${f}`, (r) => `${r} Stratégie`],
    bounce: 0, goal: 'DEMOS', tone: 'CONSULTATIVE',
    valueProposition: 'Suivre le temps vendu et le temps passé par mission, et facturer au jour près.',
    steps: [
      { channel: 'EMAIL', dayOffset: 0, subject: 'Temps vendu et temps passé chez {{company}}', body: 'Bonjour {{firstName}},\n\nDans les cabinets de conseil, l\'écart entre jours vendus et jours passés se découvre souvent en fin de mission.\n\nComment le suivez-vous chez {{company}} ?' + SIGN },
      { channel: 'LINKEDIN', dayOffset: 3, subject: '', body: 'Bonjour {{firstName}}, j\'échange avec des cabinets lillois sur le pilotage des missions. Ravie d\'être en contact.', inviteNote: 'Bonjour {{firstName}}, j\'échange avec des cabinets lillois sur le pilotage des missions. Ravie d\'être en contact.' },
      { channel: 'EMAIL', dayOffset: 7, subject: 'Re: Temps vendu et temps passé chez {{company}}', body: 'Bonjour {{firstName}},\n\nNos clients voient l\'écart mission par mission, chaque semaine. Un échange de 20 minutes ?' + SIGN },
      { channel: 'EMAIL', dayOffset: 13, subject: 'Dernier message', body: 'Bonjour {{firstName}},\n\nJe n\'insiste pas. Si le sujet devient prioritaire, il suffit de répondre à ce message.' + SIGN },
    ],
  },
]

// ─── Replies ─────────────────────────────────────────────────────────────────

type Category = 'POSITIVE' | 'MEETING_REQUEST' | 'NEUTRAL' | 'NOT_INTERESTED' | 'NEGATIVE'
const DB_CLASS: Record<Category, 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'> = { POSITIVE: 'POSITIVE', MEETING_REQUEST: 'POSITIVE', NEUTRAL: 'NEUTRAL', NOT_INTERESTED: 'NEGATIVE', NEGATIVE: 'NEGATIVE' }
/** The mix of reply categories, dealt in a fixed shuffled order: 30 % positive, 20 % meeting, 20 % neutral, 15 % opt-out, 15 % no. */
const REPLY_BAG: Category[] = ['POSITIVE', 'NEUTRAL', 'MEETING_REQUEST', 'NEGATIVE', 'POSITIVE', 'NOT_INTERESTED', 'MEETING_REQUEST', 'POSITIVE', 'NEUTRAL', 'NEGATIVE',
  'POSITIVE', 'NOT_INTERESTED', 'MEETING_REQUEST', 'NEUTRAL', 'POSITIVE', 'NEGATIVE', 'MEETING_REQUEST', 'NOT_INTERESTED', 'NEUTRAL', 'POSITIVE']
const replyCursor = { n: 0 }
const BODIES: Record<Category, string[]> = {
  POSITIVE: [
    'Bonjour Camille, oui c\'est un vrai sujet chez nous en ce moment. Vous pouvez m\'envoyer une documentation et une idée de tarif ?',
    'Merci pour votre message. Nous revoyons justement notre outil de suivi des temps d\'ici la fin de l\'année, je suis preneur d\'une présentation.',
    'Bonjour, le timing est bon : notre contrat actuel se termine en janvier. Envoyez-moi vos conditions.',
    'Oui, ça nous parle. Est-ce que vous gérez plusieurs sociétés dans le même espace ? Nous avons deux entités.',
    'Bonjour Camille, sujet pertinent pour nous. Pouvez-vous me partager le cas client dont vous parlez ?',
    'Votre message tombe bien, nous perdons beaucoup de temps sur la facturation au temps passé. Je veux bien en savoir plus.',
    'Bonjour, intéressée. Avez-vous une intégration avec les logiciels de comptabilité ? C\'est le point qui bloque chez nous.',
    'Je transfère à notre DAF qui pilote le sujet et je vous mets en copie. C\'est clairement dans nos priorités pour le premier trimestre.',
    'Merci, je regarde ça avec l\'équipe cette semaine. Pouvez-vous m\'indiquer un ordre de prix pour une trentaine d\'utilisateurs ?',
  ],
  MEETING_REQUEST: [
    'Bonjour Camille, volontiers. Je suis disponible jeudi entre 14 h et 16 h pour un appel.',
    'Oui, calons 30 minutes la semaine prochaine. Mardi matin vous irait ?',
    'Bonjour, pourquoi pas. Envoyez-moi un lien pour une démo, idéalement en fin de journée.',
    'Ça m\'intéresse. Proposez-moi deux ou trois créneaux, j\'inviterai notre directrice financière.',
    'Bonjour, je veux bien un rendez-vous rapide. Lundi 11 h ?',
    'D\'accord pour un échange. Envoyez-moi une invitation pour vendredi après-midi, je bloque le créneau.',
    'Bonjour Camille, un appel de 20 minutes mercredi à 9 h 30, ça vous va ?',
  ],
  NEUTRAL: [
    'Bonjour, ce n\'est pas moi qui m\'occupe de ce sujet. Voyez plutôt avec notre responsable administratif.',
    'Merci, pas pour le moment. Recontactez-moi en mars, nous ferons le point sur nos outils.',
    'Je suis en déplacement jusqu\'à la fin du mois, je regarderai à mon retour.',
    'Quel est votre tarif par utilisateur ? Je ne promets rien, c\'est pour me faire une idée.',
    'Bonjour, je transmets à la personne concernée.',
    'Nous venons de changer d\'outil il y a six mois, donc pas avant l\'année prochaine. Gardons le contact.',
    'Bonjour, pouvez-vous m\'en dire plus sur l\'hébergement des données ? Je verrai ensuite.',
  ],
  NOT_INTERESTED: [
    'Merci de ne plus me contacter.',
    'Stop, retirez-moi de votre liste s\'il vous plaît.',
    'Bonjour, je ne souhaite pas recevoir ce type de message. Merci de me désinscrire.',
    'Pas intéressé, merci de ne pas me recontacter.',
    'Merci de me retirer de vos envois.',
  ],
  NEGATIVE: [
    'Bonjour, nous avons déjà un outil en interne qui nous convient très bien. Bonne continuation.',
    'Non merci, ce n\'est pas une priorité pour nous.',
    'Nous n\'avons pas de besoin sur ce sujet. Bonne journée.',
    'Merci, mais nous sommes trop petits pour ce genre d\'outil.',
    'Bonjour, le sujet a été tranché en interne, nous restons sur notre solution actuelle.',
  ],
}
const bodyCursor: Record<Category, number> = { POSITIVE: 0, MEETING_REQUEST: 0, NEUTRAL: 0, NOT_INTERESTED: 0, NEGATIVE: 0 }
const nextBody = (c: Category) => BODIES[c][bodyCursor[c]++ % BODIES[c].length]

// ─── Removal ─────────────────────────────────────────────────────────────────

async function ownerOfWiiw(db: PrismaClient): Promise<string> {
  const wiiw = await db.workspace.findMany({ where: { name: OWNER_WORKSPACE }, select: { id: true, ownerId: true } })
  if (wiiw.length !== 1) throw new Error(`expected exactly one workspace named ${OWNER_WORKSPACE}, found ${wiiw.length}`)
  const owner = await db.workspaceMember.findFirst({ where: { workspaceId: wiiw[0].id, role: 'OWNER' }, select: { userId: true } })
  return owner?.userId ?? wiiw[0].ownerId
}

export async function removeDemo(db: PrismaClient, ownerId: string): Promise<number> {
  const found = await db.workspace.findMany({ where: { name: DEMO_NAME, ownerId }, select: { id: true } })
  for (const w of found) {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('phantera.erase_workspace', ${w.id}, true)`
      await tx.auditEvent.deleteMany({ where: { workspaceId: w.id } })
      await tx.workspace.delete({ where: { id: w.id } })
    }, { timeout: 120_000 })
  }
  return found.length
}

// ─── Generation ──────────────────────────────────────────────────────────────

interface Rows {
  leads: Prisma.LeadCreateManyInput[]
  enrichments: Prisma.LeadEnrichmentCreateManyInput[]
  sends: Prisma.EmailSendCreateManyInput[]
  replies: Prisma.EmailReplyCreateManyInput[]
  notifications: Prisma.NotificationCreateManyInput[]
}

interface Ctx { now: Date; workspaceId: string; mailboxId: string; rows: Rows; seq: { n: number } }

const atDay = (now: Date, daysAgo: number) => { const [h, m] = officeHour(); return parisAt(now, daysAgo, h, m) }
const minDate = (a: Date, b: Date) => (a < b ? a : b)

function scoreFor(sendable: boolean): number {
  if (!sendable) return rand() < 0.65 ? int(28, 49) : int(6, 24)
  return rand() < 0.32 ? int(80, 97) : int(52, 79)
}

function makeLead(ctx: Ctx, spec: CampaignSpec, campaignId: string, industry: string, company: { name: string; domain: string; size: TargetCompanySize; geo: string }, score: number | null, createdAt: Date) {
  for (;;) {
    const p = person()
    const email = `${slug(p.firstName)}.${slug(p.lastName)}@${company.domain}`
    if (usedEmails.has(email)) continue
    usedEmails.add(email)
    const [m, f] = pick(spec.titles)
    const id = `demo_lead_${String(++ctx.seq.n).padStart(4, '0')}`
    const badge: LeadScoreBadge = score === null ? 'UNSCORED' : scoreToBadge(score)
    const lead: Prisma.LeadCreateManyInput = {
      id, workspaceId: ctx.workspaceId, campaignId, firstName: p.firstName, lastName: p.lastName, email,
      company: company.name, title: p.female ? f : m, industry, website: `https://www.${company.domain}`,
      linkedinUrl: `https://linkedin.example/in/${slug(p.firstName)}-${slug(p.lastName)}-${id.slice(-4)}`,
      country: 'France',
      companySize: company.size, source: 'AI_PROSPECTING', aiScore: score, scoreBadge: badge,
      scoreReason: score === null ? null : reasonFor(badge, industry), status: 'new', createdAt, updatedAt: createdAt,
    }
    ctx.rows.leads.push(lead)
    return lead
  }
}

function reasonFor(badge: LeadScoreBadge, industry: string): string {
  if (badge === 'FAST_TRACK') return `Décideur direct, ${industry.toLowerCase()} de la bonne taille, adresse vérifiée.`
  if (badge === 'NORMAL') return `Profil cohérent avec la cible, influence probable sur le choix des outils.`
  if (badge === 'NURTURE') return `Secteur proche de la cible, mais poste éloigné de la décision.`
  return `Hors cible : taille ou fonction sans rapport avec l'offre.`
}

function companiesFor(spec: CampaignSpec, count: number) {
  return Array.from({ length: count }, () => {
    const name = companyName(spec.companyPatterns)
    return { name, domain: `${slug(name)}.example`, size: weighted(spec.sizes), geo: pick(spec.geos), industry: weighted(spec.industries.map((i) => [i, i.weight] as const)) }
  })
}

interface StepRow { id: string; position: number; channel: StepChannel; dayOffset: number; link: boolean }

/** One contacted lead: its sends along the sequence, its reply if any, and the lead's resulting state. */
function contactLead(ctx: Ctx, spec: CampaignSpec, campaign: { id: string; name: string }, steps: StepRow[], lead: Prisma.LeadCreateManyInput, firstDaysAgo: number, replyRate: number) {
  const { now } = ctx
  const cutoff = spec.pausedDaysAgo != null ? parisAt(now, spec.pausedDaysAgo, 9, 0) : new Date(now.getTime() - 20 * 60_000)
  const recent = firstDaysAgo <= 6
  const bounces = recent && spec.recentBounce != null ? stride(`${spec.key}:bounce:recent`, spec.recentBounce) : stride(`${spec.key}:bounce`, spec.bounce)
  const willReply = !bounces && stride(`${spec.key}:${lead.industry}:reply`, replyRate)
  // Most replies come after the first message or the first follow-up.
  const replyAfter = willReply ? weighted([[0, 6], [1, 3], [2, 1]] as const) : -1
  let reply: { sendId: string; at: Date } | null = null
  let firstSent: Date | null = null
  let prev: Date | null = null

  for (const [i, step] of steps.entries()) {
    const day = workday(now, firstDaysAgo - step.dayOffset)
    if (day < 0) break
    // Two steps can land on the same Monday after a weekend: keep the sequence order.
    const planned: Date = atDay(now, day)
    const sentAt: Date = prev && planned <= prev ? new Date(prev.getTime() + int(60, 180) * 60_000) : planned
    prev = sentAt
    if (sentAt > cutoff) break
    if (reply && sentAt > reply.at) break
    const sendId = `demo_send_${(lead.id as string).slice(10)}_${step.position}`
    const isEmail = step.channel === 'EMAIL'
    const bounced = isEmail && i === 0 && bounces
    let status: 'SENT' | 'OPENED' | 'CLICKED' | 'BOUNCED' = bounced ? 'BOUNCED' : 'SENT'
    let openedAt: Date | null = null
    let clickedAt: Date | null = null
    if (isEmail && !bounced && rand() < (i === 0 ? 0.52 : 0.41)) {
      openedAt = minDate(new Date(sentAt.getTime() + int(4, 26 * 60) * 60_000), new Date(now.getTime() - 5 * 60_000))
      status = 'OPENED'
      if (step.link && rand() < 0.18) {
        clickedAt = minDate(new Date(openedAt.getTime() + int(1, 40) * 60_000), new Date(now.getTime() - 60_000))
        status = 'CLICKED'
      }
    }
    ctx.rows.sends.push({
      id: sendId, leadId: lead.id as string, campaignId: campaign.id, emailStepId: step.id, mailboxId: isEmail ? ctx.mailboxId : null,
      status, sentAt, openedAt, clickedAt, attempts: 1, errorMessage: bounced ? 'Hard bounce' : null,
      providerMessageId: isEmail ? `<${sendId}@${SENDER.domain}>` : null,
      createdAt: new Date(sentAt.getTime() - int(2, 50) * 60_000),
    })
    firstSent ??= sentAt
    if (bounced) break
    if (willReply && !reply && isEmail && i >= replyAfter) {
      const at = new Date(sentAt.getTime() + weighted([[int(40, 240), 4], [int(240, 1500), 4], [int(1500, 4300), 2]] as const) * 60_000)
      const safe = at < now ? at : new Date(sentAt.getTime() + (now.getTime() - sentAt.getTime()) * rand())
      reply = { sendId, at: safe }
    }
  }
  if (!firstSent) return
  lead.status = 'contacted'
  // Found by the prospecting run a few working days before the first message.
  lead.createdAt = minDate(atDay(now, workday(now, firstDaysAgo + int(1, 3))), new Date(firstSent.getTime() - 2 * HOUR))
  lead.updatedAt = reply?.at ?? firstSent
  if (reply) recordReply(ctx, campaign, lead, reply)
}

function recordReply(ctx: Ctx, campaign: { id: string; name: string }, lead: Prisma.LeadCreateManyInput, reply: { sendId: string; at: Date }) {
  const category = REPLY_BAG[replyCursor.n++ % REPLY_BAG.length]
  const body = nextBody(category)
  ctx.rows.replies.push({
    id: `demo_reply_${(lead.id as string).slice(10)}`, emailSendId: reply.sendId, campaignId: campaign.id, leadId: lead.id as string,
    receivedAt: reply.at, fromEmail: lead.email, bodyText: body, classification: DB_CLASS[category],
    confidence: int(78, 97), isProcessed: ctx.now.getTime() - reply.at.getTime() > 3 * DAY,
    processedAt: ctx.now.getTime() - reply.at.getTime() > 3 * DAY ? new Date(reply.at.getTime() + int(1, 20) * HOUR) : null,
    createdAt: reply.at,
  })
  // What the reply handler does (lib/email/poll-inboxes.ts).
  lead.lastReplyAt = reply.at
  lead.lastReplyClassification = category
  lead.lastReplySnippet = body.slice(0, 160)
  lead.doNotContact = true
  lead.updatedAt = reply.at
  if (category === 'POSITIVE' || category === 'MEETING_REQUEST') { lead.status = 'qualified'; lead.qualifiedAt = reply.at }
  if (category === 'NEGATIVE' || category === 'NOT_INTERESTED') { lead.status = 'lost'; lead.lostAt = reply.at }

  const n = buildReplyNotification({
    workspaceId: ctx.workspaceId, leadName: `${lead.firstName} ${lead.lastName}`, company: lead.company ?? null,
    classification: category, leadId: lead.id as string, campaignId: campaign.id, campaignName: campaign.name,
  })
  const ageDays = (ctx.now.getTime() - reply.at.getTime()) / DAY
  ctx.rows.notifications.push({
    workspaceId: n.workspaceId, type: n.type, title: n.title, body: n.body, data: (n.data ?? {}) as Prisma.InputJsonObject,
    leadId: n.leadId, campaignId: n.campaignId, createdAt: reply.at,
    readAt: ageDays > 2 ? new Date(reply.at.getTime() + int(1, 30) * HOUR) : null,
  })
}

async function seedCampaign(db: PrismaClient, ctx: Ctx, spec: CampaignSpec, ownerId: string) {
  const { now } = ctx
  const createdAt = parisAt(now, spec.startDaysAgo + (spec.status === 'DRAFT' ? 0 : int(1, 3)), 10, int(0, 59))
  const campaign = await db.campaign.create({
    data: {
      workspaceId: ctx.workspaceId, ownerUserId: ownerId, name: spec.name, status: spec.status, goal: spec.goal, tone: spec.tone,
      targetIndustry: spec.industries.map((i) => i.industry).join(', '), targetTitles: [...new Set(spec.titles.map(([m]) => m))],
      targetCompanySizes: spec.sizes.map(([s]) => s), targetGeos: spec.geos, valueProposition: spec.valueProposition,
      leadSource: 'AI_PROSPECTING', estimatedLeads: spec.leads, connectedMailboxId: ctx.mailboxId, createdAt,
      emailSteps: { create: spec.steps.map((s, i) => ({
        position: i + 1, dayOffset: s.dayOffset, channel: s.channel, subject: s.subject, body: s.body, inviteNote: s.inviteNote ?? null,
        isAiGenerated: true, aiScore: int(82, 94), createdAt, updatedAt: createdAt,
      })) },
    },
    select: { id: true, name: true, emailSteps: { select: { id: true, position: true, channel: true, dayOffset: true } } },
  })
  const steps: StepRow[] = campaign.emailSteps.sort((a, b) => a.position - b.position).map((s) => ({ ...s, link: !!spec.steps[s.position - 1].link }))
  const companies = companiesFor(spec, Math.ceil(spec.leads / 1.7))
  const pendingCount = spec.pending?.count ?? 0
  const pendingIndustry = spec.industries.find((x) => x.industry === spec.pending?.industry)
  const pendingCompanies = companies.filter((c) => c.industry === pendingIndustry)

  for (let i = 0; i < spec.leads + pendingCount; i++) {
    const queued = i >= spec.leads
    const draft = spec.status === 'DRAFT'
    const company = queued ? pick(pendingCompanies) : i < companies.length ? companies[i] : pick(companies)
    const sendable = queued || rand() < (draft ? 0.85 : 0.88)
    const score = draft && rand() < 0.08 ? null : scoreFor(sendable)
    const fresh = !queued && spec.recentBatch != null && i >= spec.leads - spec.recentBatch
    const firstDaysAgo = fresh ? workday(now, int(1, 5)) : workday(now, spec.startDaysAgo - Math.floor(rand() * (spec.span + 1)))
    const leadCreated = draft ? parisAt(now, spec.startDaysAgo, 10, int(5, 50)) : queued ? parisAt(now, 0, 7, int(0, 40)) : parisAt(now, firstDaysAgo + 2, 10, 0)
    const lead = makeLead(ctx, spec, campaign.id, company.industry.industry, company, score, leadCreated)
    if (queued) {
      // Waiting in the queue behind the mailbox's daily cap since this morning.
      ctx.rows.sends.push({ id: `demo_send_${(lead.id as string).slice(10)}_1`, leadId: lead.id as string, campaignId: campaign.id, emailStepId: steps[0].id, mailboxId: ctx.mailboxId, status: 'PENDING', createdAt: parisAt(now, 0, 7, int(45, 59)) })
      continue
    }
    if (draft || !sendable) continue
    contactLead(ctx, spec, campaign, steps, lead, firstDaysAgo, company.industry.replyRate)
  }
  return { id: campaign.id, createdAt }
}

/** A few qualified leads that turned into customers (status set by hand in the app). */
function convert(ctx: Ctx) {
  const candidates = ctx.rows.leads.filter((l) => l.status === 'qualified' && l.lastReplyAt && ctx.now.getTime() - (l.lastReplyAt as Date).getTime() > 10 * DAY)
  // One per campaign first, oldest replies first, four at most.
  const byCampaign = new Map<string, Prisma.LeadCreateManyInput[]>()
  for (const l of [...candidates].sort((a, b) => (a.lastReplyAt as Date).getTime() - (b.lastReplyAt as Date).getTime())) {
    byCampaign.set(l.campaignId as string, [...(byCampaign.get(l.campaignId as string) ?? []), l])
  }
  const queues = [...byCampaign.values()]
  const chosen: Prisma.LeadCreateManyInput[] = []
  for (let round = 0; chosen.length < 4 && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && chosen.length < 4) chosen.push(q[round])
  }
  for (const l of chosen) {
    const won = minDate(new Date((l.lastReplyAt as Date).getTime() + int(5, 9) * DAY), new Date(ctx.now.getTime() - DAY))
    l.status = 'converted'
    l.wonAt = won
    l.updatedAt = won
  }
}

function enrich(ctx: Ctx) {
  const bounced = new Set(ctx.rows.sends.filter((s) => s.status === 'BOUNCED').map((s) => s.leadId))
  for (const l of ctx.rows.leads) {
    if (l.scoreBadge === 'UNSCORED') continue
    const isBounced = bounced.has(l.id as string)
    const status = isBounced ? pick(['accept_all', 'unknown']) : weighted([['valid', 86], ['accept_all', 14]] as const)
    ctx.rows.enrichments.push({
      leadId: l.id as string, emailVerified: status === 'valid', emailStatus: status,
      emailConfidence: status === 'valid' ? int(88, 99) : int(55, 79), enrichedAt: l.createdAt as Date, createdAt: l.createdAt as Date,
    })
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function seedDemo(db: PrismaClient, now = new Date()) {
  const ownerId = await ownerOfWiiw(db)
  const removed = await removeDemo(db, ownerId)
  const wsCreated = parisAt(now, 52, 9, 12)
  const ws = await db.workspace.create({
    data: {
      name: DEMO_NAME, ownerId, plan: 'BUSINESS', onboardingCompleted: true, targetIndustry: 'Services B2B', targetCompanySize: 'S',
      sendingDomain: SENDER.domain, createdAt: wsCreated,
      emailSignature: { enabled: true, fullName: `${SENDER.first} ${SENDER.last}`, role: 'Responsable commerciale', company: SENDER.company, website: `https://www.${SENDER.domain}`, linkedinUrl: '', logoUrl: '' },
    },
  })
  await db.workspaceMember.create({ data: { workspaceId: ws.id, userId: ownerId, role: 'OWNER', createdAt: wsCreated } })
  const mailbox = await db.connectedMailbox.create({
    data: {
      workspaceId: ws.id, ownerUserId: ownerId, provider: 'SMTP', email: `camille.rousset@${SENDER.domain}`, displayName: `${SENDER.first} ${SENDER.last}`,
      accessTokenEnc: 'demo-not-a-secret', smtpHost: `smtp.${SENDER.domain}`, smtpPort: 465, status: 'CONNECTED', isDefault: true, sharedWithTeam: true,
      dailyCap: 80, lastSyncAt: new Date(now.getTime() - 12 * 60_000), lastSendAt: new Date(now.getTime() - 3 * HOUR), createdAt: wsCreated,
    },
  })
  await db.connectedChannel.create({
    data: { workspaceId: ws.id, ownerUserId: ownerId, provider: 'LINKEDIN', label: `${SENDER.first} ${SENDER.last}`, status: 'CONNECTED', isDefault: true, sharedWithTeam: true, createdAt: wsCreated },
  })

  const ctx: Ctx = { now, workspaceId: ws.id, mailboxId: mailbox.id, rows: { leads: [], enrichments: [], sends: [], replies: [], notifications: [] }, seq: { n: 0 } }
  const created: Array<{ spec: CampaignSpec; id: string; createdAt: Date }> = []
  for (const spec of CAMPAIGNS) created.push({ spec, ...(await seedCampaign(db, ctx, spec, ownerId)) })
  convert(ctx)
  enrich(ctx)

  const { leads, enrichments, sends, replies, notifications } = ctx.rows
  await db.$transaction(async (tx) => {
    await tx.lead.createMany({ data: leads })
    await tx.leadEnrichment.createMany({ data: enrichments })
    await tx.emailSend.createMany({ data: sends })
    await tx.emailReply.createMany({ data: replies })
    await tx.notification.createMany({ data: notifications })
  }, { timeout: 120_000 })

  // Counters and dates from the rows, as the jobs would have left them.
  const replyLeadClass = new Map(leads.filter((l) => l.lastReplyClassification).map((l) => [l.id as string, l.lastReplyClassification as string]))
  for (const { spec, id, createdAt } of created) {
    const own = sends.filter((s) => s.campaignId === id && s.sentAt)
    const lastSent = own.reduce<Date | null>((m, s) => (!m || (s.sentAt as Date) > m ? (s.sentAt as Date) : m), null)
    const completedAt = spec.status === 'COMPLETED' && lastSent ? new Date(lastSent.getTime() + 26 * HOUR) : null
    const pausedAt = spec.pausedDaysAgo != null ? parisAt(now, spec.pausedDaysAgo, 9, 0) : null
    const firstSent = own.reduce<Date | null>((m, s) => (!m || (s.sentAt as Date) < m ? (s.sentAt as Date) : m), null)
    await db.campaign.update({
      where: { id },
      data: {
        sentCount: own.length,
        openCount: own.filter((s) => s.openedAt).length,
        replyCount: replies.filter((r) => r.campaignId === id && replyLeadClass.get(r.leadId) !== 'NOT_INTERESTED').length,
        convertedCount: leads.filter((l) => l.campaignId === id && l.status === 'converted').length,
        lastProcessedAt: spec.status === 'ACTIVE' ? new Date(now.getTime() - 35 * 60_000) : pausedAt ?? completedAt,
        completedAt,
        updatedAt: completedAt ?? pausedAt ?? lastSent ?? createdAt,
      },
    })
    // The status history the trigger would have written over time.
    await db.campaignStatusEvent.deleteMany({ where: { campaignId: id } })
    const events: Prisma.CampaignStatusEventCreateManyInput[] = [{ campaignId: id, workspaceId: ws.id, fromStatus: null, toStatus: 'DRAFT', at: createdAt }]
    if (spec.status !== 'DRAFT' && firstSent) events.push({ campaignId: id, workspaceId: ws.id, fromStatus: 'DRAFT', toStatus: 'ACTIVE', at: new Date(firstSent.getTime() - 20 * 60_000) })
    if (pausedAt) events.push({ campaignId: id, workspaceId: ws.id, fromStatus: 'ACTIVE', toStatus: 'PAUSED', at: pausedAt })
    if (completedAt) events.push({ campaignId: id, workspaceId: ws.id, fromStatus: 'ACTIVE', toStatus: 'COMPLETED', at: completedAt })
    await db.campaignStatusEvent.createMany({ data: events })
  }

  // The alerts: the real sweep over these rows, not hand-written insights.
  const sweep = await sweepWorkspace(db, ws.id, now)
  return { workspaceId: ws.id, removed, sweep, campaigns: created.map((c) => ({ name: c.spec.name, status: c.spec.status, id: c.id })) }
}

async function summary(db: PrismaClient, workspaceId: string) {
  const where = { workspaceId }
  const camp = { campaign: { workspaceId } }
  const [campaigns, leads, byStatus, byBadge, enrich, sends, sendStatus, replies, byClass, notifs, insights, steps] = await Promise.all([
    db.campaign.findMany({ where, select: { name: true, status: true, sentCount: true, openCount: true, replyCount: true, convertedCount: true, _count: { select: { leads: true, emailSteps: true } } }, orderBy: { createdAt: 'asc' } }),
    db.lead.count({ where }),
    db.lead.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.lead.groupBy({ by: ['scoreBadge'], where, _count: { _all: true } }),
    db.leadEnrichment.count({ where: { lead: { workspaceId } } }),
    db.emailSend.count({ where: camp }),
    db.emailSend.groupBy({ by: ['status'], where: camp, _count: { _all: true } }),
    db.emailReply.count({ where: camp }),
    db.lead.groupBy({ by: ['lastReplyClassification'], where: { workspaceId, lastReplyClassification: { not: null } }, _count: { _all: true } }),
    db.notification.groupBy({ by: ['type'], where, _count: { _all: true } }),
    db.insight.findMany({ where: { workspaceId, status: 'OPEN' }, select: { kind: true, severity: true, title: true, evidence: true } }),
    db.campaignEmailStep.count({ where: camp }),
  ])
  const g = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, k: string) => Object.fromEntries(rows.map((r) => [String(r[k]), r._count._all]))
  const emailSends = await db.emailSend.count({ where: { ...camp, sentAt: { not: null }, emailStep: { channel: 'EMAIL' } } })
  const bounced = await db.emailSend.count({ where: { ...camp, status: 'BOUNCED' } })
  const contacted = await db.lead.count({ where: { workspaceId, emailSends: { some: { sentAt: { not: null } } } } })
  return {
    workspaceId,
    campaigns, steps, leads, leadStatus: g(byStatus, 'status'), scoreBadge: g(byBadge, 'scoreBadge'), enrichments: enrich,
    emailSends: sends, sendStatus: g(sendStatus, 'status'), bounceRateOfEmails: `${((bounced / emailSends) * 100).toFixed(1)} %`,
    replies, replyRateOfContacted: `${((replies / contacted) * 100).toFixed(1)} % (${replies}/${contacted})`,
    replyCategories: g(byClass, 'lastReplyClassification'), notifications: g(notifs, 'type'), openInsights: insights,
  }
}

if (process.argv[1]?.endsWith('demo-seed.ts')) {
  assertSandbox()
  const db = new PrismaClient()
  const run = async () => {
    if (process.argv.includes('--remove')) {
      console.log(`removed ${await removeDemo(db, await ownerOfWiiw(db))} demo workspace(s)`)
      return
    }
    // --now=ISO: replay the seed as of another day (robustness checks only).
    const at = process.argv.find((a) => a.startsWith('--now='))?.slice(6)
    const r = await seedDemo(db, at ? new Date(at) : new Date())
    console.log(JSON.stringify({ removedBefore: r.removed, sweep: r.sweep }, null, 2))
    const out = await summary(db, r.workspaceId)
    console.log(JSON.stringify(out, null, 2))
    if (out.openInsights.length < 3) console.warn(`warning: ${out.openInsights.length} open insight(s) from the sweep, 3 expected`)
  }
  run().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
}
