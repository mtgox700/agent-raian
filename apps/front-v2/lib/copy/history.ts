/** Texts of /dashboard/history, word for word from body n°1 (apps/front/components/dashboard/HistoryPageClient.tsx). */

export const historyCopy = {
  title: 'Historique',
  description: 'Le journal complet de vos campagnes et activités',
  filterLabel: 'Filtrer le journal',
  kind: { campaign: 'Campagnes', reply: 'Réponses', system: 'Système' },
  filters: { all: 'Tout', campaign: 'Campagnes', reply: 'Réponses', system: 'Système' },
  today: "Aujourd'hui",
  yesterday: 'Hier',
  emptyTitle: "Aucune activité pour l'instant",
  emptyBody: 'Lancez votre première campagne pour remplir ce journal.',
  emptyFilterTitle: 'Rien dans cette catégorie',
  emptyFilterBody: 'Choisissez un autre filtre pour voir le reste du journal.',
  more: 'Afficher plus',
  remaining: (n: number) => `${n} restant${n > 1 ? 's' : ''}`,
} as const
