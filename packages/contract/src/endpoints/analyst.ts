/** Analyst: questions answered from the workspace's own facts. */

import { z } from 'zod'
import { endpoint, Id } from '../define'
import { AnalystMessage, AnalystQuota, ConversationSummary, Plan, Suggestion } from '../schemas/analyst'

export const analystEndpoints = [
  // app/api/analyst/route.ts
  endpoint({
    id: 'analyst.overview',
    method: 'GET',
    path: '/api/analyst',
    summary: 'What the Analyst screen needs: availability, monthly quota, own conversations, comparable campaigns, suggestions.',
    auth: 'session',
    response: z.object({
      mode: z.enum(['anthropic', 'sandbox', 'none']),
      plan: Plan,
      quota: AnalystQuota,
      conversations: z.array(ConversationSummary),
      campaigns: z.array(z.object({ id: Id, name: z.string() })),
      suggestions: z.array(Suggestion),
    }),
  }),

  // app/api/analyst/ask/route.ts
  endpoint({
    id: 'analyst.ask',
    method: 'POST',
    path: '/api/analyst/ask',
    summary: 'One question to the Analyst, answered as Server-Sent Events (progress, then answer or failure).',
    auth: 'session',
    // Handler trims the question: 3..MAX_QUESTION_CHARS (lib/analyst/run.ts); empty conversationId = new conversation.
    body: z.object({ question: z.string(), conversationId: z.string().optional() }),
    // Events: progress {type:'step',step}|{type:'tool',name}; answer {conversationId,messageId,status,text,evidence[{ref,tool,data}],quota}; failure {reason,message,quota}.
    response: z.string(),
    responseKind: 'stream',
  }),

  // app/api/analyst/conversations/[id]/route.ts
  endpoint({
    id: 'analyst.getConversation',
    method: 'GET',
    path: '/api/analyst/conversations/[id]',
    summary: 'One of the asker\'s own conversations with its messages (404 if not theirs).',
    auth: 'session',
    params: z.object({ id: Id }),
    response: z.object({
      conversation: z.object({ id: Id, title: z.string(), messages: z.array(AnalystMessage) }),
    }),
  }),

  // app/api/analyst/conversations/[id]/route.ts
  endpoint({
    id: 'analyst.deleteConversation',
    method: 'DELETE',
    path: '/api/analyst/conversations/[id]',
    summary: 'Delete one of the asker\'s own conversations for good.',
    auth: 'session',
    params: z.object({ id: Id }),
    response: z.object({ deleted: z.literal(true) }),
  }),

  // app/api/analyst/suggestions/route.ts
  endpoint({
    id: 'analyst.suggestions',
    method: 'GET',
    path: '/api/analyst/suggestions',
    summary: 'Questions drawn from the diagnoses of the asker\'s campaigns (empty when the plan cannot ask).',
    auth: 'session',
    response: z.object({ suggestions: z.array(Suggestion) }),
  }),
]
