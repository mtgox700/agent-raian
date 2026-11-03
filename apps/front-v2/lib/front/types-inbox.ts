/** Shapes of the Reply Inbox screen, derived from the contract (views.inbox). */
import type { CallOutput } from '@phantera/sdk'

type InboxView = CallOutput<'views.inbox'>
export type InboxOpenView = Extract<InboxView, { locked: false }>
export type InboxReplyRow = InboxOpenView['replies'][number]
export type InboxReplyFilter = InboxOpenView['filter']
export type ReplyClassificationKey = InboxReplyRow['classification']
