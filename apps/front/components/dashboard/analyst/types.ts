export type ModelMode = 'anthropic' | 'sandbox' | 'none'
export type AnswerStatus = 'ok' | 'refused' | 'error'

export interface Evidence { ref: string; tool: string; data: unknown }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: AnswerStatus | null
  evidence?: Evidence[] | null
}

export interface ConversationSummary { id: string; title: string; updatedAt: string }
export interface Quota { used: number; limit: number; remaining: number; resetsAt: string }
export interface Suggestion { label: string; question: string; tone: 'bloquant' | 'alerte' | 'neutre' }
export interface CampaignOption { id: string; name: string }

export interface AnalystOverview {
  mode: ModelMode
  plan: string
  quota: Quota
  conversations: ConversationSummary[]
  campaigns: CampaignOption[]
  suggestions: Suggestion[]
}

export type ProgressEvent =
  | { type: 'step'; step: 'analyse' | 'relecture' | 'verification' | 'correction' }
  | { type: 'tool'; name: string }
