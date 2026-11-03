'use client'

import { useId, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Button, Field, Input, describedBy } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { smtpCopy as t } from '@/lib/copy/settings'
import { useApi } from '@/lib/front/use-api'
import { errorMessage } from './ui'

const EMPTY = { host: '', port: 587, secure: true, email: '', password: '', displayName: '' }

/** Test then save a custom SMTP mailbox (mailbox.connectSmtp, step-up). */
export function SmtpDialog({ open, workspaceId, onClose, onSuccess }: {
  open: boolean
  workspaceId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const api = useApi()
  const fid = useId()
  const [form, setForm] = useState(EMPTY)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.call('mailbox.connectSmtp', { body: { ...form, workspaceId } })
      setSuccess(true)
      setTimeout(() => { setSuccess(false); setForm(EMPTY); onSuccess() }, 1000)
    } catch (err) {
      setError(errorMessage(err, t.failed))
    }
    setLoading(false)
  }

  const text = (key: 'displayName' | 'email' | 'host', label: string, type: string, placeholder: string) => (
    <Field id={`${fid}-${key}`} label={label}>
      <Input
        id={`${fid}-${key}`}
        size="sm"
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
      />
    </Field>
  )

  return (
    <Dialog open={open} onClose={() => { if (!loading) onClose() }} title={t.title} closeLabel={t.close}>
      {success ? (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-8">
          <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
          <p className="text-sm text-ink">{t.connected}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {text('displayName', t.displayName, 'text', t.displayNamePlaceholder)}
          {text('email', t.email, 'email', t.emailPlaceholder)}

          <Field id={`${fid}-password`} label={t.password} hint={t.passwordHint}>
            <div className="relative">
              <Input
                id={`${fid}-password`}
                size="sm"
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••••••"
                aria-describedby={describedBy(`${fid}-password`, { hint: t.passwordHint })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? t.hidePassword : t.showPassword}
                aria-pressed={showPass}
                className="absolute right-0.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:text-ink"
              >
                {showPass ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            {text('host', t.host, 'text', 'smtp.gmail.com')}
            <Field id={`${fid}-port`} label={t.port}>
              <Input
                id={`${fid}-port`}
                size="sm"
                type="number"
                value={String(form.port)}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                placeholder="587"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.secure}
              onChange={(e) => setForm({ ...form, secure: e.target.checked })}
              className="h-4 w-4 accent-[rgb(var(--c-cyan))]"
            />
            <span className="text-xs text-quiet">{t.secure}</span>
          </label>

          {error && <p role="alert" className="rounded-md border border-danger/30 px-3 py-2 text-xs text-danger">{error}</p>}

          <Button
            type="submit"
            size="sm"
            disabled={loading || !form.email || !form.password || !form.host}
            aria-busy={loading || undefined}
            className="w-full"
          >
            {loading
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {t.testing}</>
              : t.submit}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
