/** Shapes of the "À envoyer" screen (/dashboard/a-envoyer), derived from the contract. */
import type { CallOutput } from '@phantera/sdk'

export type AEnvoyerView = Exclude<CallOutput<'views.aEnvoyer'>, { redirect: string }>
export type QueueItem = AEnvoyerView['items'][number]
