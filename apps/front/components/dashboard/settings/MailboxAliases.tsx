'use client'

/**
 * Aliases of a connected mailbox: Gmail's verified « Envoyer en tant que »
 * addresses (refreshed from Gmail), or SMTP addresses of the same domain
 * entered here. Each can then be picked as a campaign's sender.
 */

import { useState } from 'react'
import { Loader2, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export interface MailboxAliasItem {
  email: string
  displayName: string | null
}

interface Props {
  mailboxId: string
  mailboxEmail: string
  provider: 'GMAIL' | 'SMTP'
  aliases: MailboxAliasItem[]
  onChanged: () => void
}

async function post(body: Record<string, string>): Promise<{ aliases?: MailboxAliasItem[]; releasedCampaigns?: number }> {
  const res = await fetch('/api/mailbox/aliases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({})) as { error?: string; aliases?: MailboxAliasItem[]; releasedCampaigns?: number }
  if (!res.ok) throw new Error(data.error ?? 'Action impossible')
  return data
}

export function MailboxAliases({ mailboxId, mailboxEmail, provider, aliases, onChanged }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const domain = mailboxEmail.slice(mailboxEmail.lastIndexOf('@') + 1)

  const run = async (key: string, body: Record<string, string>, success: (data: { aliases?: MailboxAliasItem[]; releasedCampaigns?: number }) => string) => {
    setBusy(key)
    try {
      const data = await post(body)
      toast.success(success(data))
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(null)
    }
  }

  const sync = () => run('sync', { action: 'sync', mailboxId }, (data) => {
    const count = data.aliases?.length ?? 0
    return count === 0 ? 'Aucun alias vérifié dans ce Gmail' : `${count} alias trouvé${count > 1 ? 's' : ''}`
  })

  const add = () => run('add', { action: 'add', mailboxId, email: email.trim(), ...(name.trim() ? { displayName: name.trim() } : {}) }, () => {
    setEmail('')
    setName('')
    return 'Alias ajouté'
  })

  const remove = (alias: string) => run(`remove:${alias}`, { action: 'remove', mailboxId, email: alias }, (data) => {
    const released = data.releasedCampaigns ?? 0
    return released > 0
      ? `Alias retiré : ${released} campagne${released > 1 ? 's' : ''} repasse${released > 1 ? 'nt' : ''} sur ${mailboxEmail}`
      : 'Alias retiré'
  })

  return (
    <div className="mt-3 rounded-md border border-border bg-obsidian p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-muted">Alias d’envoi</p>
        {provider === 'GMAIL' && (
          <button
            type="button"
            onClick={() => void sync()}
            disabled={busy !== null}
            aria-busy={busy === 'sync' || undefined}
            className="flex items-center gap-1 rounded-md text-[11px] font-medium text-cyan transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40"
          >
            {busy === 'sync' ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
            Actualiser depuis Gmail
          </button>
        )}
      </div>

      {aliases.length === 0 ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          {provider === 'GMAIL'
            ? 'Aucun alias. Ajoutez une adresse dans Gmail › Paramètres › Comptes › « Envoyer des e-mails en tant que », validez-la, puis actualisez.'
            : `Aucun alias. Ajoutez une autre adresse @${domain} qui arrive dans cette boîte.`}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {aliases.map((alias) => (
            <li key={alias.email} className="flex items-center justify-between gap-2 text-xs text-white">
              <span className="truncate">{alias.displayName ? `${alias.displayName} <${alias.email}>` : alias.email}</span>
              {provider === 'SMTP' && (
                <button
                  type="button"
                  onClick={() => void remove(alias.email)}
                  disabled={busy !== null}
                  aria-label={`Retirer l’alias ${alias.email}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan disabled:opacity-40"
                >
                  {busy === `remove:${alias.email}` ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> : <X className="h-3 w-3" aria-hidden="true" />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {provider === 'SMTP' && (
        <form
          className="mt-2 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); void add() }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`commercial@${domain}`}
            aria-label="Adresse de l’alias"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-void px-2 text-xs text-white outline-none transition-colors placeholder:text-muted/60 focus:border-cyan/60"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom affiché (facultatif)"
            aria-label="Nom affiché de l’alias"
            maxLength={80}
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-void px-2 text-xs text-white outline-none transition-colors placeholder:text-muted/60 focus:border-cyan/60"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={busy !== null || email.trim().length < 3}
            aria-busy={busy === 'add' || undefined}
            className="h-8 gap-1 px-3 text-xs"
          >
            {busy === 'add' ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden="true" /> : <Plus className="h-3 w-3" aria-hidden="true" />}
            Ajouter
          </Button>
        </form>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Un alias partage le plafond quotidien et la réputation de {mailboxEmail} : il change l’adresse affichée, pas le volume.
        Les réponses envoyées à l’alias doivent arriver dans cette boîte pour que Phantera les détecte et arrête la séquence.
      </p>
    </div>
  )
}
