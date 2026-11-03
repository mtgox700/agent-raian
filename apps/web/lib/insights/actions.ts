/**
 * One-click actions an alert offers. Never automatic: the person confirms
 * each one, the server checks the alert offers it and the permission it
 * needs, the audit log keeps it, and it can be undone. Then its effect is
 * followed and said honestly: measured, not yet measurable, or absent.
 */

import type { Permission } from '@/lib/auth/permissions'

export type ActionKind = 'pause' | 'change_sender' | 'skip_segment' | 'duplicate'

export interface ActionSpec {
  label: string
  /** What the confirmation says will happen, and how to undo it. */
  confirm: string
  undoLabel: string
  permission: Permission
}

export const ACTIONS: Record<ActionKind, ActionSpec> = {
  pause: {
    label: 'Mettre la campagne en pause',
    confirm: 'Plus aucun message ne partira tant que la campagne est en pause. Les réponses continuent d’arriver. Vous pourrez la reprendre à tout moment.',
    undoLabel: 'Reprendre la campagne',
    permission: 'campaign.launch',
  },
  change_sender: {
    label: 'Changer d’expéditeur',
    confirm: 'Le prochain email partira de la boîte choisie. Les emails déjà partis gardent leur expéditeur, et les réponses arrivent toujours dans la boîte qui les a envoyés.',
    undoLabel: 'Remettre l’ancien expéditeur',
    permission: 'campaign.write',
  },
  skip_segment: {
    label: 'Retirer ce segment de la file',
    confirm: 'Les premiers messages encore en attente pour ce segment ne partiront pas. Les leads déjà contactés ne sont pas touchés, et vous pourrez remettre ces messages en file.',
    undoLabel: 'Remettre ces messages en file',
    permission: 'campaign.write',
  },
  duplicate: {
    label: 'Dupliquer pour un nouveau segment',
    confirm: 'Un brouillon est créé avec les mêmes messages et le même expéditeur, sans leads. Rien ne part : vous choisissez le nouveau ciblage, puis vous le lancez quand vous voulez.',
    undoLabel: 'Supprimer le brouillon',
    permission: 'campaign.write',
  },
}

export function isActionKind(x: unknown): x is ActionKind {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, x)
}

export interface Impact {
  state: 'mesuré' | 'trop tôt' | 'sans effet' | 'annulé'
  text: string
}

const HOUR = 3_600_000
/** Time a changed sender is given to send before its silence means something. */
export const SENDER_GRACE_HOURS = 24
const nf = (n: number) => n.toLocaleString('fr-FR')

/**
 * What became of an action, from what happened since: emails sent after it.
 * The effect stated is operational (sending stopped, sending resumed), never
 * a reply rate attributed to it: that would need the test of E2 and time.
 */
export interface ImpactFacts {
  /** Emails sent by the campaign since the action. */
  sentSince: number
  /** skip_segment: first messages taken off the queue. */
  skipped?: number
  /** duplicate: the copy's status now, or null if it is gone. */
  copyStatus?: string | null
}

export function impactOf(a: { action: ActionKind; createdAt: Date; revertedAt: Date | null }, facts: ImpactFacts | number, now: Date): Impact {
  const f: ImpactFacts = typeof facts === 'number' ? { sentSince: facts } : facts
  const sentSince = f.sentSince
  if (a.revertedAt) return { state: 'annulé', text: `Annulée le ${a.revertedAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.` }
  if (a.action === 'skip_segment') {
    const n = f.skipped ?? 0
    return { state: 'mesuré', text: `${nf(n)} premier${n > 1 ? 's messages retirés' : ' message retiré'} de la file : ${n > 1 ? 'ils ne partiront pas' : 'il ne partira pas'}.` }
  }
  if (a.action === 'duplicate') {
    if (f.copyStatus == null) return { state: 'sans effet', text: 'Le brouillon a été supprimé.' }
    return f.copyStatus === 'DRAFT'
      ? { state: 'trop tôt', text: 'Brouillon prêt : choisissez le nouveau ciblage, puis lancez-le.' }
      : { state: 'mesuré', text: 'La copie a été lancée : ses résultats apparaissent dans Analytics, à comparer avec l’originale.' }
  }
  const hours = (now.getTime() - a.createdAt.getTime()) / HOUR
  if (a.action === 'pause') {
    return sentSince === 0
      ? { state: 'mesuré', text: 'Plus aucun email n’est parti depuis la pause.' }
      : { state: 'sans effet', text: `${nf(sentSince)} email${sentSince > 1 ? 's sont partis' : ' est parti'} depuis : la campagne a été relancée.` }
  }
  if (sentSince > 0) return { state: 'mesuré', text: `Les envois ont repris : ${nf(sentSince)} email${sentSince > 1 ? 's' : ''} depuis le changement.` }
  return hours < SENDER_GRACE_HOURS
    ? { state: 'trop tôt', text: 'Pas encore d’envoi : le premier part au prochain créneau de la boîte.' }
    : { state: 'sans effet', text: `Toujours aucun envoi ${Math.floor(hours)} h après le changement : vérifier la boîte choisie.` }
}
