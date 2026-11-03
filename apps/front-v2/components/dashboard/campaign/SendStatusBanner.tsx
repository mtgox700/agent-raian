'use client'

/** Why queued messages wait, and until when (campaigns.sendStatus, every 30 s while some wait). */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, PauseCircle, Send } from 'lucide-react'
import { buttonVariants } from '@/components/ui'
import { sendStatusCopy as t } from '@/lib/copy/campaign'
import { api } from '@/lib/front/api'
import type { SendHoldKey, SendStatusData } from '@/lib/front/types-campaigns'

const POLL_MS = 30_000

function holdMessage(st: SendStatusData): { text: string; action?: { label: string; href: string } } {
  const resume = st.resumesAt ? t.resume(t.at(st.resumesAt)) : ''
  const messages: Record<SendHoldKey, { text: string; action?: { label: string; href: string } }> = {
    MAILBOX_CAP: { text: t.mailboxCap(st.sentLast24h, st.dailyLimit, resume), action: { label: t.raiseCap, href: t.mailboxesHref } },
    SHARED_CAP: { text: t.sharedCap(st.sentLast24h, st.dailyLimit, resume), action: { label: t.connect, href: t.mailboxesHref } },
    MAILBOX_PAUSED: { text: t.mailboxPaused(resume) },
    QUOTA: { text: t.quota(st.quota.current, st.quota.limit), action: { label: t.changePlan, href: t.billingHref } },
    MAILBOX_DISCONNECTED: { text: t.disconnected, action: { label: t.reconnect, href: t.mailboxesHref } },
    NO_SENDER: { text: t.noSender, action: { label: t.connect, href: t.mailboxesHref } },
    CAMPAIGN_PAUSED: { text: t.campaignPaused },
  }
  return st.hold ? messages[st.hold] : { text: '' }
}

export function SendStatusBanner({ campaignId, initialQueued }: { campaignId: string; initialQueued: number }) {
  const [status, setStatus] = useState<SendStatusData | null>(null)

  useEffect(() => {
    if (initialQueued === 0) return
    let stopped = false
    const load = async () => {
      try {
        const next = await api.call('campaigns.sendStatus', { params: { campaignId } }, { cache: 'no-store' })
        if (stopped) return
        setStatus(next)
        if (next.queued === 0) stopped = true
      } catch {
        // Informative only: keep the last known status.
      }
    }
    void load()
    const timer = setInterval(() => { if (!stopped) void load() }, POLL_MS)
    return () => { stopped = true; clearInterval(timer) }
  }, [campaignId, initialQueued])

  if (!status || status.queued === 0) return null

  if (!status.hold) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border border-accent/25 bg-raised px-4 py-3 text-sm text-ink/80">
        <Send className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
        {t.sending(status.queued, status.sender, status.sentLast24h, status.dailyLimit)}
      </div>
    )
  }

  const { text, action } = holdMessage(status)
  const Icon = status.hold === 'MAILBOX_CAP' || status.hold === 'SHARED_CAP' ? Clock : PauseCircle
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/30 bg-raised px-4 py-3 text-sm text-ink/80">
      <Icon className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
      <span className="flex-1">
        <strong className="font-semibold text-warning">{t.waiting(status.queued)}</strong>
        {text}
      </span>
      {action && <Link href={action.href} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-8 px-3 text-xs' })}>{action.label}</Link>}
    </div>
  )
}
