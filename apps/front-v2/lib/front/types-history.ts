/** Shapes of /dashboard/history, derived from the contract (views.history). */
import type { CallOutput } from '@phantera/sdk'

export type HistoryEvent = CallOutput<'views.history'>['events'][number]
export type HistoryKind = HistoryEvent['kind']
