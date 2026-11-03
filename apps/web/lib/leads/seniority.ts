/**
 * Seniority from a free-text job title, French and English. Pure: used by
 * the rule scorer and by the analytics segments (titles are free text, so
 * they are compared by level, not one by one).
 */

export type Seniority = 'executive' | 'vp' | 'director' | 'manager' | 'other'

export const SENIORITY_ORDER: Seniority[] = ['executive', 'vp', 'director', 'manager', 'other']

export const SENIORITY_LABEL: Record<Seniority, string> = {
  executive: 'Dirigeants',
  vp: 'Vice-présidents',
  director: 'Directeurs',
  manager: 'Managers',
  other: 'Autres fonctions',
}

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function seniorityOf(title: string | null): Seniority {
  const t = ` ${norm(title).replace(/[^a-z0-9&]+/g, ' ')} `
  if (/ (ceo|cto|coo|cmo|cfo|cio|ciso|cpo|cro|chief|pdg|dg|founder|co ?founder|fondateur|fondatrice|cofondateur|cofondatrice|president|presidente|gerant|gerante|owner|managing director|directeur general|directrice generale|associe|associee|partner) /.test(t)) return 'executive'
  if (/ (vp|svp|evp|vice president|vice presidente) /.test(t)) return 'vp'
  if (/ (director|directeur|directrice|head|dsi|drh|daf|dcg) /.test(t)) return 'director'
  if (/ (manager|responsable|lead|chef|team lead) /.test(t)) return 'manager'
  return 'other'
}
