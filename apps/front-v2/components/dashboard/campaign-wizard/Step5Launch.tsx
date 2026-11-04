'use client'

/**
 * Step 5: review, « Envoyer depuis », what Phantera will do, then
 * campaigns.create with the wizard data (the back queues the AI prospecting
 * or the first message) and the campaign page.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowRight, Check, ChevronLeft, Loader2, Mail, Rocket, Sparkles, Target, Users, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { SenderPicker, useSenders } from '@/components/dashboard/shared/SenderPicker'
import { StepHeader } from '@/components/dashboard/campaign-wizard/StepHeader'
import { step5Copy as t, wizardCopy } from '@/lib/copy/campaign-wizard'
import { api } from '@/lib/front/api'
import { track } from '@/lib/analytics/events'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { CAMPAIGN_GOALS, TONES } from '@/lib/types/campaign-wizard'

/** A short, readable confirmation between creation and the redirect. */
const LAUNCH_CONFIRM_MS = 1200

function ReviewRow({ icon: Icon, label, value, onClick }: { icon: typeof Target; label: string; value: string; onClick?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line text-accent"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-quiet">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{value}</p>
      </div>
      {onClick && <Button variant="ghost" size="sm" onClick={onClick} aria-label={t.editLabel(label)} className="h-8 px-2 text-xs hover:text-accent">{t.edit}</Button>}
    </div>
  )
}

function LaunchConfirm({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, LAUNCH_CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [onComplete])
  return (
    <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/95 px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-raised p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-accent/40 text-accent"><Check className="h-6 w-6" aria-hidden="true" /></div>
        <p className="font-display text-xl font-semibold text-ink">{t.launched}</p>
        <p className="mt-1 font-mono text-xs text-quiet">{t.opening}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full origin-left rounded-full bg-accent motion-safe:animate-[launch-progress_1200ms_var(--ease-signal)_both]" />
        </div>
        <style>{'@keyframes launch-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }'}</style>
      </div>
    </div>
  )
}

function LaunchSuccess({ campaignName }: { campaignName: string }) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-md border border-success/30 text-success"><Check className="h-8 w-8" aria-hidden="true" /></div>
      <h2 className="font-display text-3xl font-semibold text-ink">{t.activated}</h2>
      <p className="mt-2 text-quiet"><strong className="text-ink">{campaignName}</strong>{t.created}<br />{t.follow}</p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" onClick={() => router.push(wizardCopy.backHref)} className="px-6">{t.seeCampaigns}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
        <Button variant="ghost" onClick={() => router.push('/dashboard')}>{t.backHome}</Button>
      </div>
    </div>
  )
}

export function Step5Launch() {
  const { data, prevStep, setStep, updateStep4, isLaunching, setLaunching, launchSuccess, setLaunchSuccess, reset } = useCampaignWizard()
  const { step1, step2, step3, step4 } = data
  const senders = useSenders()
  const router = useRouter()

  // A draft may remember a mailbox or alias removed since: fall back to the default.
  useEffect(() => {
    if (!senders.mailboxes || !step4.mailboxId) return
    const box = senders.mailboxes.find((m) => m.id === step4.mailboxId)
    const aliasGone = Boolean(step4.fromAlias) && !box?.aliases.some((a) => a.email === step4.fromAlias)
    if (!box || box.status !== 'CONNECTED') {
      updateStep4({ mailboxId: null, fromAlias: null })
      toast.warning(t.aliasGoneBox)
    } else if (aliasGone) {
      updateStep4({ fromAlias: null })
      toast.warning(t.aliasGone(box.email))
    }
  }, [senders.mailboxes, step4.mailboxId, step4.fromAlias, updateStep4])

  const picked = step4.leadIds?.length ?? 0
  const goal = CAMPAIGN_GOALS.find((g) => g.key === step1.goal)
  // « 3 e-mails » alone lies when the sequence also has LinkedIn messages.
  const emailCount = step3.emailSteps.filter((s) => s.channel !== 'linkedin').length
  const dmCount = step3.emailSteps.filter((s) => s.channel === 'linkedin').length
  const summary = [emailCount > 0 ? t.emails(emailCount) : null, dmCount > 0 ? t.dms(dmCount) : null].filter(Boolean).join(' + ') || t.noMessage

  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [campaignId, setCampaignId] = useState<string | null>(null)

  // Once created, the draft is cleared when the wizard goes away.
  const created = useRef(false)
  useEffect(() => () => { if (created.current) reset() }, [reset])

  const missingLeads = step4.leadSource !== 'ai' && picked === 0

  const handleLaunch = async () => {
    setSaveError(null)
    setIsSaving(true)
    let result: { campaignId: string }
    try {
      result = await api.call('campaigns.create', { body: data })
    } catch (err) {
      setIsSaving(false)
      setSaveError(err instanceof ApiError ? err.message : t.createFailed)
      return
    }
    setIsSaving(false)
    created.current = true
    // Every creation; the first one is recorded server-side (first_campaign_created).
    track('campaign_created', { goal: data.step1.goal })
    setCampaignId(result.campaignId)
    setLaunching(true)
  }

  const handleLaunchComplete = () => {
    setLaunching(false)
    if (campaignId) router.push(`/dashboard/campaigns/${campaignId}`)
    else setLaunchSuccess(true)
  }

  if (launchSuccess) return <LaunchSuccess campaignName={step1.name} />

  const actions = [
    ...(step4.leadSource === 'ai' ? [t.searchUpTo(step4.estimatedLeads), t.verifyEmails] : [t.queueFirst(picked)]),
    t.personalise(summary),
    dmCount > 0 ? t.sendMulti : t.send,
    t.classify,
  ]

  return (
    <>
      {isLaunching && <LaunchConfirm onComplete={handleLaunchComplete} />}
      <div className="mx-auto max-w-2xl">
        <StepHeader step={5} title={t.title} intro={t.intro} />

        <div className="mb-8 space-y-2.5">
          <ReviewRow icon={Target} label={t.campaign} value={`${step1.name} : ${goal?.label ?? step1.goal}`} onClick={() => setStep(1)} />
          <ReviewRow
            icon={Users}
            label={t.targeting}
            value={[
              step2.targetTitles.length > 0 ? t.titles(step2.targetTitles.length) : null,
              step2.targetCompanySizes.length > 0 ? step2.targetCompanySizes.join(', ') : null,
              step2.targetGeos.length > 0 ? step2.targetGeos.slice(0, 2).join(', ') : null,
            ].filter(Boolean).join(', ') || t.noTargeting}
            onClick={() => setStep(2)}
          />
          <ReviewRow icon={Mail} label={t.sequence} value={t.sequenceValue(summary, (TONES.find((x) => x.key === step3.tone)?.label ?? step3.tone).toLowerCase())} onClick={() => setStep(3)} />
          <ReviewRow icon={Zap} label={t.leads} value={step4.leadSource === 'ai' ? t.aiLeads(step4.estimatedLeads) : t.baseLeads(picked)} onClick={() => setStep(4)} />
        </div>

        <div className="mb-6 rounded-lg border border-line bg-raised p-4">
          <SenderPicker
            value={{ mailboxId: step4.mailboxId ?? null, fromAlias: step4.fromAlias ?? null }}
            onChange={(sender) => updateStep4(sender)}
            mailboxes={senders.mailboxes}
            loadError={senders.error}
            disabled={isSaving}
          />
        </div>

        <div className="mb-8 rounded-lg border border-accent/25 bg-raised p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink"><Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />{t.whatTitle}</p>
          <ul className="grid gap-2">
            {actions.map((action) => (
              <li key={action} className="flex items-start gap-2.5 text-xs text-quiet"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />{action}</li>
            ))}
          </ul>
        </div>

        {missingLeads && (
          <p className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-raised px-4 py-3 text-xs text-warning">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{t.missingLeads}
          </p>
        )}
        {saveError && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-danger/30 bg-raised px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-xs text-danger">{saveError}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" size="lg" onClick={prevStep} disabled={isSaving} className="px-5"><ChevronLeft className="h-4 w-4" aria-hidden="true" />{wizardCopy.previous}</Button>
          <Button size="lg" onClick={() => void handleLaunch()} disabled={isSaving || missingLeads} aria-busy={isSaving || undefined} title={missingLeads ? t.missingLeadsTitle : undefined} className="px-8">
            {isSaving
              ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t.saving}</>
              : <><Rocket className="h-4 w-4" aria-hidden="true" />{t.launch}</>}
          </Button>
        </div>
      </div>
    </>
  )
}
