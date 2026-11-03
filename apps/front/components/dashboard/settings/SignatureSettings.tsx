'use client'

/**
 * SignatureSettings: pro email signature builder (Trust Pack).
 *
 * Left: form (name, role, company, website, LinkedIn, logo URL, toggle).
 * Right: LIVE Gmail-style preview so the user sees exactly what the lead
 * receives. Doctrine: the cold-email body stays hand-typed-looking; ALL brand
 * trust lives here.
 */

import { useCallback, useEffect, useState } from 'react'
import { PenLine, Loader2, Check, Info } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { whatsappDigits, type WorkspaceSignature } from '@/lib/email/signature'

const EMPTY: WorkspaceSignature = {
  enabled: false, fullName: '', role: '', company: '',
  website: '', linkedinUrl: '', logoUrl: '', whatsapp: '', customHtml: '',
}

function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

export function SignatureSettings() {
  const [sig, setSig]         = useState<WorkspaceSignature>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/workspace/signature')
      const data = (await res.json()) as { signature?: WorkspaceSignature | null }
      if (data.signature) setSig(data.signature)
    } catch { /* keep defaults */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const update = (field: keyof WorkspaceSignature) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setSig((prev) => ({ ...prev, [field]: field === 'enabled' ? e.target.checked : e.target.value }))

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/workspace/signature', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sig),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) { toast.error(data.error ?? 'Échec de la sauvegarde'); return }
      setSaved(true)
      toast.success('Signature enregistrée')
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  const roleLine = [sig.role, sig.company].filter(Boolean).join(' · ')
  const previewLinks = [
    sig.website ? prettyHost(sig.website) : null,
    sig.linkedinUrl ? 'LinkedIn' : null,
    whatsappDigits(sig.whatsapp) ? 'WhatsApp' : null,
  ].filter((l): l is string => Boolean(l))

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 py-4 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> Chargement…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="signature-title" className="flex items-center gap-2 font-display text-sm font-semibold text-white">
            <PenLine className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
            Signature professionnelle
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Ajoutée automatiquement à la fin de chaque e-mail de séquence : c&apos;est elle qui
            porte votre marque (le corps du message reste volontairement sobre).
          </p>
        </div>
        {/* Enable: switch (composited-only transition) */}
        <button
          type="button"
          role="switch"
          aria-checked={sig.enabled}
          aria-labelledby="signature-title"
          onClick={() => setSig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          className="flex flex-shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <span className={cn(
            'font-mono text-xs transition-colors duration-150',
            sig.enabled ? 'text-cyan' : 'text-muted',
          )}>
            {sig.enabled ? 'Activée' : 'Désactivée'}
          </span>
          <span className={cn(
            'relative h-5 w-9 rounded-full border transition-colors duration-200 ease-signal',
            sig.enabled ? 'border-cyan/40 bg-cyan/25' : 'border-border bg-surface',
          )}>
            <span className={cn(
              'absolute left-0.5 top-0.5 h-[14px] w-[14px] rounded-full transition-transform duration-200 ease-signal',
              sig.enabled ? 'translate-x-4 bg-cyan' : 'translate-x-0 bg-muted',
            )} />
          </span>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-3">
          {([
            ['fullName',    'Nom complet',       'Mehdi Benali'],
            ['role',        'Rôle',              'Co-fondateur'],
            ['company',     'Société',           'Spar-x'],
            ['website',     'Site web',          'spar-x.fr'],
            ['linkedinUrl', 'Profil LinkedIn',   'linkedin.com/in/votre-profil'],
            ['logoUrl',     'Logo (URL, optionnel)', 'https://votre-site.com/logo.png'],
            ['whatsapp',    'WhatsApp pro (optionnel)', '+33 6 12 34 56 78'],
          ] as const).map(([field, label, placeholder]) => (
            <div key={field}>
              <label htmlFor={`signature-${field}`} className="mb-1 block font-mono text-xs text-muted">
                {label}
              </label>
              <input
                id={`signature-${field}`}
                value={sig[field]}
                onChange={update(field)}
                placeholder={placeholder}
                className="h-9 w-full rounded-md border border-border bg-void px-3 text-xs text-white outline-none transition-colors duration-150 ease-signal placeholder:text-muted/60 focus:border-cyan/60 focus-visible:ring-2 focus-visible:ring-cyan/40"
              />
            </div>
          ))}

          <p className="text-[11px] leading-relaxed text-muted">
            Avec un numéro WhatsApp, chaque e-mail affiche un lien « WhatsApp » : le prospect ouvre la
            conversation lui-même (aucun message non sollicité) et vous êtes prévenu de son clic.
          </p>

          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving}
            aria-busy={saving || undefined}
            className="mt-1 gap-2"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : saved ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {saving ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer la signature'}
          </Button>
        </div>

        {/* Live preview: what the lead sees in a mail client (light, like Gmail) */}
        <div>
          <p className="mb-1.5 font-mono text-xs text-muted">
            Aperçu (vu par le prospect)
          </p>
          <div className="rounded-[10px] border border-border bg-white p-5">
            <p className="text-[13px] leading-relaxed text-gray-800">
              …au plaisir d&apos;échanger.
            </p>
            {sig.enabled && sig.fullName.trim() ? (
              <div className="mt-5 flex items-start gap-3">
                {sig.logoUrl.trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sig.logoUrl}
                    alt=""
                    className="h-11 w-11 rounded-lg object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{sig.fullName}</p>
                  {roleLine && <p className="mt-0.5 text-xs text-gray-500">{roleLine}</p>}
                  {previewLinks.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">
                      {previewLinks.map((link, i) => (
                        <span key={link}>
                          {i > 0 && <span className="text-gray-300"> · </span>}
                          <span className="underline decoration-gray-300">{link}</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-xs italic text-gray-400">
                {sig.enabled ? 'Renseignez au moins votre nom.' : 'Signature désactivée : activez-la pour l\'aperçu.'}
              </p>
            )}
          </div>

          {/* Deliverability micro-guide: numbered checklist, one line each */}
          <div className="mt-3 rounded-[10px] border border-border bg-void p-4">
            <p className="mb-3 flex items-center gap-2 font-mono text-xs text-muted">
              <Info className="h-3.5 w-3.5 text-cyan" aria-hidden="true" />
              Gagner la confiance de vos destinataires
            </p>
            <ul className="space-y-2.5">
              {[
                <>Ajoutez une <span className="text-white">photo de profil</span> à votre compte Google : elle s&apos;affiche à côté de vos e-mails.</>,
                <>Envoyez depuis un domaine avec un <span className="text-white">site web actif</span> que le prospect peut vérifier.</>,
                <>Ne répétez pas votre signature dans vos messages : <span className="text-white">elle est ajoutée automatiquement</span>.</>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-border font-mono text-[10px] tabular-nums text-cyan" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
