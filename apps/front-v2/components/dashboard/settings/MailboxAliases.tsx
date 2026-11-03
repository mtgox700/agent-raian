'use client'

/**
 * Aliases of a connected mailbox: Gmail's verified « Envoyer en tant que »
 * addresses (refreshed from Gmail), or SMTP addresses of the same domain
 * entered here. Each can then be picked as a campaign's sender.
 */
import { useState } from 'react'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input } from '@/components/ui'
import { aliasCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import type { CallInput } from '@phantera/sdk'
import type { MailboxAlias } from '@/lib/front/types-settings'
import { errorMessage, iconButton } from './ui'

type AliasBody = CallInput<'mailbox.manageAliases'>['body']
type AliasResult = { aliases?: MailboxAlias[]; releasedCampaigns?: number }

export function MailboxAliases({ mailboxId, mailboxEmail, provider, aliases, onChanged }: {
  mailboxId: string
  mailboxEmail: string
  provider: 'GMAIL' | 'SMTP'
  aliases: MailboxAlias[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const domain = mailboxEmail.slice(mailboxEmail.lastIndexOf('@') + 1)

  const run = async (key: string, body: AliasBody, success: (data: AliasResult) => string) => {
    setBusy(key)
    try {
      const data = await api.call('mailbox.manageAliases', { body }) as AliasResult
      toast.success(success(data))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err, t.failed))
    } finally {
      setBusy(null)
    }
  }

  const sync = () => run('sync', { action: 'sync', mailboxId }, (data) => t.synced(data.aliases?.length ?? 0))

  const add = () => run(
    'add',
    { action: 'add', mailboxId, email: email.trim(), ...(name.trim() ? { displayName: name.trim() } : {}) },
    () => { setEmail(''); setName(''); return t.added },
  )

  const remove = (alias: string) => run(`remove:${alias}`, { action: 'remove', mailboxId, email: alias }, (data) =>
    t.removed(data.releasedCampaigns ?? 0, mailboxEmail))

  return (
    <div className="mt-3 rounded-md border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-quiet">{t.title}</p>
        {provider === 'GMAIL' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void sync()}
            disabled={busy !== null}
            aria-busy={busy === 'sync' || undefined}
            className="h-8 px-2 text-xs text-accent hover:text-accent-strong"
          >
            {busy === 'sync'
              ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
            {t.syncGmail}
          </Button>
        )}
      </div>

      {aliases.length === 0 ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-quiet">{provider === 'GMAIL' ? t.emptyGmail : t.emptySmtp(domain)}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {aliases.map((alias) => (
            <li key={alias.email} className="flex items-center justify-between gap-2 text-xs text-ink">
              <span className="truncate">{alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}</span>
              {provider === 'SMTP' && (
                <button
                  type="button"
                  onClick={() => void remove(alias.email)}
                  disabled={busy !== null}
                  aria-label={t.remove(alias.email)}
                  className={`${iconButton} h-8 w-8 hover:text-danger`}
                >
                  {busy === `remove:${alias.email}`
                    ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    : <X className="h-3 w-3" aria-hidden="true" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {provider === 'SMTP' && (
        <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <Input
            size="sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`commercial@${domain}`}
            aria-label={t.emailLabel}
            autoComplete="off"
            className="min-w-0 flex-1 text-xs"
          />
          <Input
            size="sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.namePlaceholder}
            aria-label={t.nameLabel}
            maxLength={80}
            className="min-w-0 flex-1 text-xs"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={busy !== null || email.trim().length < 3}
            aria-busy={busy === 'add' || undefined}
            className="text-xs"
          >
            {busy === 'add'
              ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <Plus className="h-3 w-3" aria-hidden="true" />}
            {t.add}
          </Button>
        </form>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-quiet">{t.note(mailboxEmail)}</p>
    </div>
  )
}
