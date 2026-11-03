'use client'

import { useId, useState } from 'react'
import { Server, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { useStepUp } from '@/lib/auth/use-step-up'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open:        boolean
  workspaceId: string
  onClose:     () => void
  onSuccess:   () => void
}

export function SmtpModal({ open, workspaceId, onClose, onSuccess }: Props) {
  const { stepUpFetch } = useStepUp()
  const [form, setForm] = useState({
    host:        '',
    port:        587,
    secure:      true,
    email:       '',
    password:    '',
    displayName: '',
  })
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [success,  setSuccess]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await stepUpFetch('/api/mailbox/smtp', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, workspaceId }),
    })

    if (res.ok) {
      setSuccess(true)
      setTimeout(onSuccess, 1000)
    } else {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Connexion SMTP échouée')
    }
    setLoading(false)
  }

  const fid = useId()
  const inputClass = 'w-full rounded-md border border-border bg-void px-3 py-2 text-sm text-white placeholder:text-muted/60 transition-colors duration-150 ease-signal focus:border-cyan/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/40'

  const field = (key: keyof typeof form, label: string, type = 'text', placeholder = '') => (
    <div className="space-y-1">
      <label htmlFor={`${fid}-${key}`} className="font-mono text-xs text-muted">{label}</label>
      <input
        id={`${fid}-${key}`}
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={loading}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan" aria-hidden="true" />
          Connexion SMTP
        </span>
      }
    >
      {success ? (
        <div role="status" className="flex flex-col items-center justify-center gap-3 py-8">
          <CheckCircle2 className="h-10 w-10 text-success-fg" aria-hidden="true" />
          <p className="text-sm text-white">Boîte SMTP connectée.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {field('displayName', 'Nom affiché (optionnel)', 'text', 'ex. : Ayoub de Phantera')}
          {field('email', 'Adresse e-mail', 'email', 'vous@votre-domaine.com')}

          {/* Password with toggle */}
          <div className="space-y-1">
            <label htmlFor={`${fid}-password`} className="font-mono text-xs text-muted">Mot de passe ou mot de passe d&apos;application</label>
            <div className="relative">
              <input
                id={`${fid}-password`}
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••••••"
                aria-describedby={`${fid}-password-help`}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-label={showPass ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPass}
                className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              >
                {showPass ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p id={`${fid}-password-help`} className="text-xs text-muted">Pour Gmail, utilisez un mot de passe d&apos;application, pas votre mot de passe habituel.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {field('host', 'Serveur SMTP', 'text', 'smtp.gmail.com')}
            {field('port', 'Port', 'number', '587')}
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.secure}
              onChange={(e) => setForm({ ...form, secure: e.target.checked })}
              className="rounded border-border bg-void text-cyan focus:ring-cyan/40"
            />
            <span className="text-xs text-muted">Connexion sécurisée (TLS/SSL)</span>
          </label>

          {error && (
            <p role="alert" className="rounded-md border border-danger/25 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !form.email || !form.password || !form.host}
            aria-busy={loading || undefined}
            className="w-full gap-2"
          >
            {loading ? (
              <><Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Test de connexion…</>
            ) : (
              'Tester et connecter'
            )}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
