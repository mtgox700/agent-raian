/**
 * Shapes of /dashboard/analyst. The overview comes from the contract
 * (analyst.overview); the stream's events are described by the contract's
 * comment on analyst.ask (a stream has no JSON schema), so they are typed here.
 */
import type { CallOutput } from '@phantera/sdk'

export type AnalystOverview = CallOutput<'analyst.overview'>
export type Quota = AnalystOverview['quota']
export type ConversationSummary = AnalystOverview['conversations'][number]
export type Suggestion = AnalystOverview['suggestions'][number]
export type CampaignOption = AnalystOverview['campaigns'][number]
export type StoredMessage = CallOutput<'analyst.getConversation'>['conversation']['messages'][number]

export type AnswerStatus = 'ok' | 'refused' | 'error' | 'insufficient'

export interface Evidence { ref: string; tool: string; data: unknown }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string | null
  evidence?: Evidence[] | null
}

export type ProgressEvent =
  | { type: 'step'; step: 'analyse' | 'relecture' | 'verification' | 'correction' }
  | { type: 'tool'; name: string }

export interface AnswerEvent {
  conversationId: string
  messageId: string
  status: AnswerStatus
  text: string
  evidence: Evidence[]
  quota: Quota
}
