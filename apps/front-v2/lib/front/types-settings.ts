/**
 * Shapes of /dashboard/settings, derived from the contract (never re-declared by hand).
 */
import type { CallOutput } from '@phantera/sdk'

export type SettingsView = CallOutput<'views.settings'>
export type SettingsBilling = SettingsView['billing']
export type Plan = SettingsBilling['plan']
export type AnnualPlan = SettingsBilling['annualPlans'][number]

export type MailboxRow = CallOutput<'mailbox.list'>[number]
export type MailboxProvider = MailboxRow['provider']
export type MailboxStatus = MailboxRow['status']
export type MailboxAlias = MailboxRow['aliases'][number]

export type ChannelRow = CallOutput<'channels.list'>['channels'][number]
export type ChannelProvider = ChannelRow['provider']

export type SmsState = CallOutput<'workspace.getSms'>
export type WorkspaceSignature = NonNullable<CallOutput<'workspace.getSignature'>['signature']>

export type TeamState = CallOutput<'team.list'>
export type TeamMember = TeamState['members'][number]
export type TeamInvitation = TeamState['invitations'][number]
export type WorkspaceRole = TeamMember['role']

export type SecurityState = CallOutput<'security.getSettings'>
export type AuditEvent = CallOutput<'security.listAudit'>['events'][number]
export type WorkspaceExport = CallOutput<'workspace.listExports'>['exports'][number]
export type DeletionState = CallOutput<'workspace.getDeletion'>

/** Outcome of an OAuth round trip (mailbox or LinkedIn), read from the URL. */
export interface SettingsNotice {
  kind: 'mailbox' | 'channel'
  ok: boolean
  reason?: string
}

export const SETTINGS_TABS = ['profile', 'mailboxes', 'team', 'billing', 'security'] as const
export type SettingsTabId = (typeof SETTINGS_TABS)[number]
