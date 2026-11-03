/**
 * The actions the audit log records, with the label shown in
 * Paramètres › Sécurité. One entry per business event; the route that
 * performs it writes the event (lib/audit/audit).
 */

export const AUDIT_ACTIONS = {
  'mailbox.connected':        'Boîte mail connectée',
  'mailbox.disconnected':     'Boîte mail déconnectée',
  'channel.connected':        'Canal connecté',
  'channel.disconnected':     'Canal déconnecté',
  'sender.changed':           'Expéditeur modifié',
  'campaign.paused':          'Campagne mise en pause',
  'campaign.resumed':         'Campagne relancée',
  'campaign.completed':       'Campagne terminée',
  'campaign.segment_skipped': 'Segment retiré de la file',
  'campaign.segment_restored': 'Segment remis en file',
  'campaign.duplicated':      'Campagne dupliquée',
  'campaign.draft_deleted':   'Brouillon supprimé',
  'member.role_changed':      'Rôle modifié',
  'member.removed':           'Membre retiré',
  'invitation.sent':          'Invitation envoyée',
  'invitation.revoked':       'Invitation révoquée',
  'invitation.accepted':      'Invitation acceptée',
  'data.exported':            'Données exportées',
  'data.deleted':             'Données supprimées',
  'data.deletion_scheduled':  'Suppression de l\'espace programmée',
  'data.deletion_cancelled':  'Suppression de l\'espace annulée',
  'data.opposition':          'Opposition d\'un prospect (données effacées)',
  'plan.changed':             'Abonnement modifié',
  'api_key.set':              'Clé API enregistrée',
  'api_key.removed':          'Clé API supprimée',
  'security.two_factor':      'Double authentification d\'équipe',
  'security.audit_exported':  'Journal d\'audit exporté',
  'analyst.sensitive_read':   'Accès de l\'Analyste à des données sensibles',
} as const

export type AuditAction = keyof typeof AUDIT_ACTIONS

export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILURE'

export function auditLabel(action: string): string {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action
}
