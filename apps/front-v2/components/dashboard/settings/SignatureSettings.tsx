'use client'

/**
 * Pro email signature (Trust Pack): the form on the left, on the right the
 * live preview of what the lead receives. The cold-email body stays
 * hand-typed-looking; all brand trust lives here.
 */
import { useCallback, useEffect, useState } from 'react'
import { Check, Info, Loader2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Field, Input } from '@/components/ui'
import { whatsappDigits } from '@/lib/email/signature'
import { settingsPage, signatureCopy as t } from '@/lib/copy/settings'
import { api } from '@/lib/front/api'
import type { WorkspaceSignature } from '@/lib/front/types-settings'
import { errorMessage, Switch } from './ui'

const EMPTY: WorkspaceSignature = {
  enabled: false, fullName: '', role: '', company: '',
  website: '', linkedinUrl: '', logoUrl: '', whatsapp: '', customHtml: '',
}

function prettyHost(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

export function SignatureSettings() {
  const [sig, setSig] = useState<WorkspaceSignature>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api.call('workspace.getSignature', {})
      if (data.signature) setSig(data.signature)
    } catch { /* keep defaults */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await api.call('workspace.saveSignature', { body: sig })
      setSaved(true)
      toast.success(t.saved)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      toast.error(err instanceof TypeError ? t.network : errorMessage(err, t.failed))
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
      <div role="status" className="flex items-center gap-2 py-4 text-xs text-quiet">
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> {settingsPage.loading}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="signature-title" className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em] text-ink">
            <PenLine className="h-4 w-4 text-accent" aria-hidden="true" />
            {t.title}
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-quiet">{t.subtitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className={sig.enabled ? 'font-mono text-xs text-accent' : 'font-mono text-xs text-quiet'} aria-hidden="true">
            {sig.enabled ? t.on : t.off}
          </span>
          <Switch
            size="sm"
            checked={sig.enabled}
            labelledBy="signature-title"
            onChange={() => setSig((prev) => ({ ...prev, enabled: !prev.enabled }))}
          />
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {t.fields.map(([field, label, placeholder]) => (
            <Field key={field} id={`signature-${field}`} label={label}>
              <Input
                id={`signature-${field}`}
                size="sm"
                value={sig[field]}
                onChange={(e) => setSig((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={placeholder}
              />
            </Field>
          ))}

          <p className="text-[11px] leading-relaxed text-quiet">{t.whatsappNote}</p>

          <Button type="button" size="sm" onClick={() => void save()} disabled={saving} aria-busy={saving || undefined} className="mt-1">
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : saved ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {saving ? t.saving : saved ? t.savedLabel : t.save}
          </Button>
        </div>

        <div>
          <p className="mb-2 font-mono text-xs text-quiet">{t.preview}</p>
          <div className="rounded-md border border-line bg-canvas p-5">
            <p className="text-[13px] leading-relaxed text-ink/80">{t.previewBody}</p>
            {sig.enabled && sig.fullName.trim() ? (
              <div className="mt-5 flex items-start gap-3">
                {sig.logoUrl.trim() && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sig.logoUrl}
                    alt=""
                    className="h-11 w-11 rounded-md object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div>
                  <p className="text-[13px] font-semibold text-ink">{sig.fullName}</p>
                  {roleLine && <p className="mt-0.5 text-xs text-quiet">{roleLine}</p>}
                  {previewLinks.length > 0 && (
                    <p className="mt-1 text-xs text-quiet">
                      {previewLinks.map((link, i) => (
                        <span key={link}>
                          {i > 0 && <span className="text-line"> · </span>}
                          <span className="underline decoration-line underline-offset-2">{link}</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-xs italic text-quiet">{sig.enabled ? t.needName : t.disabled}</p>
            )}
          </div>

          <div className="mt-3 rounded-md border border-line bg-canvas p-4">
            <p className="mb-3 flex items-center gap-2 font-mono text-xs text-quiet">
              <Info className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {t.guideTitle}
            </p>
            <ol className="space-y-2.5">
              {t.guide.map(([before, strong, after], i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] tabular-nums text-accent" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="text-[11px] leading-relaxed text-quiet">{before}<span className="text-ink">{strong}</span>{after}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
