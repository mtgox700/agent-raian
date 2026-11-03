'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, Rocket, Check, Target, Users, Mail, Zap, ArrowRight, Sparkles, AlertCircle, Loader2 } from 'lucide-react'
import { useCampaignWizard } from '@/lib/hooks/use-campaign-wizard'
import { useRouter } from 'next/navigation'
import { CAMPAIGN_GOALS, TONES } from '@/lib/types/campaign-wizard'
import { createCampaign } from '@/app/(dashboard)/dashboard/campaigns/actions'
import { track } from '@/lib/analytics/events'
import { toast } from 'sonner'
import { SenderPicker, useSenders } from '@/components/dashboard/campaigns/SenderPicker'
import { Button } from '@/components/ui/button'

// ─── Review row ───────────────────────────────────────────────────────────────
function ReviewRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: typeof Target
  label: string
  value: string
  onClick?: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-border bg-obsidian px-4 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border text-cyan">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs text-muted">{label}</p>
        <p className="truncate text-sm font-semibold text-white">{value}</p>
      </div>
      {onClick && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          aria-label={`Modifier : ${label}`}
          className="h-8 px-2 text-xs text-muted hover:text-cyan"
        >
          Modifier
        </Button>
      )}
    </div>
  )
}

// ─── Launch confirmation ──────────────────────────────────────────────────────
// A short, readable confirmation between creation and the redirect. It used to
// be a 3.8 s countdown with a rocket and a particle burst.
const LAUNCH_CONFIRM_MS = 1200

function LaunchAnimation({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onComplete(), LAUNCH_CONFIRM_MS)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/95 px-6"
    >
      <div className="w-full max-w-sm rounded-[10px] border border-border bg-obsidian p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-cyan/40 text-cyan">
          <Check className="h-6 w-6" aria-hidden />
        </div>
        <p className="font-display text-xl font-bold text-white">Campagne lancée</p>
        <p className="mt-1 font-mono text-xs text-muted">Ouverture de la campagne...</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="launch-progress h-full origin-left rounded-full bg-cyan" />
        </div>
        <style>{`
          @keyframes launch-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
          .launch-progress { animation: launch-progress ${LAUNCH_CONFIRM_MS}ms cubic-bezier(0.2, 0.7, 0.1, 1) both; }
          @media (prefers-reduced-motion: reduce) { .launch-progress { animation: none; transform: scaleX(1); } }
        `}</style>
      </div>
    </div>
  )
}

// ─── Success state ────────────────────────────────────────────────────────────
function LaunchSuccess({ campaignName }: { campaignName: string }) {
  const router = useRouter()

  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-md border border-success-fg/30 text-success-fg">
        <Check className="h-8 w-8" aria-hidden />
      </div>

      <h2 className="font-display text-3xl font-bold text-white">Campagne activée</h2>
      <p className="mt-2 text-muted">
        <strong className="text-white">{campaignName}</strong> est créée.
        <br />
        Suivez son avancement depuis la liste des campagnes.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button size="lg" onClick={() => router.push('/dashboard/campaigns')} className="gap-2 px-6">
          Voir mes campagnes
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="ghost" onClick={() => router.push('/dashboard')} className="text-muted">
          Retour au tableau de bord
        </Button>
      </div>
    </div>
  )
}

// ─── Main step ────────────────────────────────────────────────────────────────
export function Step5Launch() {
  const { data, prevStep, setStep, updateStep4, isLaunching, setLaunching, launchSuccess, setLaunchSuccess, reset } = useCampaignWizard()
  const { step1, step2, step3, step4 } = data
  const senders = useSenders()

  // A draft may remember a mailbox or alias that has since been removed:
  // fall back to the default rather than show one choice and send another.
  useEffect(() => {
    if (!senders.mailboxes || !step4.mailboxId) return
    const box = senders.mailboxes.find((m) => m.id === step4.mailboxId)
    const aliasGone = Boolean(step4.fromAlias) && !box?.aliases.some((a) => a.email === step4.fromAlias)
    if (!box || box.status !== 'CONNECTED') {
      updateStep4({ mailboxId: null, fromAlias: null })
      toast.warning('La boîte choisie n’est plus disponible : la boîte par défaut est sélectionnée. Vérifiez « Envoyer depuis ».')
    } else if (aliasGone) {
      // The mailbox is still there: keep it, drop only the alias.
      updateStep4({ fromAlias: null })
      toast.warning(`L’alias choisi n’existe plus : la campagne partira de ${box.email}. Vérifiez « Envoyer depuis ».`)
    }
  }, [senders.mailboxes, step4.mailboxId, step4.fromAlias, updateStep4])
  const pickedCount = step4.leadIds?.length ?? 0
  const router = useRouter()

  const goalConfig = CAMPAIGN_GOALS.find((g) => g.key === step1.goal)

  // Mixed-channel sequence summary: "3 emails" alone lies when the pipeline
  // includes LinkedIn DMs.
  const emailCount = step3.emailSteps.filter((s) => s.channel !== 'linkedin').length
  const dmCount    = step3.emailSteps.filter((s) => s.channel === 'linkedin').length
  const sequenceSummary = [
    emailCount > 0 ? `${emailCount} e-mail${emailCount > 1 ? 's' : ''}` : null,
    dmCount    > 0 ? `${dmCount} message${dmCount > 1 ? 's' : ''} LinkedIn` : null,
  ].filter(Boolean).join(' + ') || 'Aucun message'
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [isSaving,   setIsSaving]   = useState(false)
  const [campaignId, setCampaignId] = useState<string | null>(null)

  // The wizard draft is kept in localStorage so an unfinished campaign can be
  // resumed. Once a campaign is created, the draft is cleared when the wizard
  // goes away: "Nouvelle campagne" reopened the last one at step 5, launch
  // button armed.
  const created = useRef(false)
  useEffect(() => () => { if (created.current) reset() }, [reset])

  // Existing base without leads (a draft saved before the picker existed, or
  // the removed CSV option) cannot be launched.
  const missingLeads = step4.leadSource !== 'ai' && pickedCount === 0

  const handleLaunch = async () => {
    setSaveError(null)
    setIsSaving(true)

    // createCampaign creates the campaign AND queues the AI prospecting as a
    // durable Inngest job (server-side). No client SSE: the pipeline runs in
    // the background, immune to navigation/timeouts, and notifies on completion.
    const result = await createCampaign(data)
    setIsSaving(false)

    if (!result.success) {
      setSaveError(result.error)
      return
    }

    created.current = true
    // Every creation; the first one is recorded server-side (first_campaign_created).
    track('campaign_created', { goal: data.step1.goal })
    setCampaignId(result.campaignId)
    setLaunching(true)
  }

  const handleLaunchComplete = () => {
    setLaunching(false)
    // Redirect to the campaign detail page: leads stream in as the background
    // Inngest pipeline saves them; the user gets a notification when it's done.
    if (campaignId) {
      router.push(`/dashboard/campaigns/${campaignId}`)
    } else {
      setLaunchSuccess(true)
    }
  }

  if (launchSuccess) return <LaunchSuccess campaignName={step1.name} />

  return (
    <>
      {isLaunching && <LaunchAnimation onComplete={handleLaunchComplete} />}

      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-8">
          <p className="mb-3 font-mono text-xs text-cyan">Étape 05 sur 05</p>
          <h2 className="font-display text-3xl font-bold text-white">Prêt à lancer</h2>
          <p className="mt-2 text-sm text-muted">
            Vérifiez votre configuration avant de lancer la campagne.
          </p>
        </header>

        {/* Review summary */}
        <div className="mb-8 space-y-2.5">
          <ReviewRow
            icon={Target}
            label="Campagne"
            value={`${step1.name} : ${goalConfig?.label ?? step1.goal}`}
            onClick={() => setStep(1)}
          />
          <ReviewRow
            icon={Users}
            label="Ciblage"
            value={[
              step2.targetTitles.length > 0 ? `${step2.targetTitles.length} postes` : null,
              step2.targetCompanySizes.length > 0 ? `${step2.targetCompanySizes.join(', ')}` : null,
              step2.targetGeos.length > 0 ? step2.targetGeos.slice(0, 2).join(', ') : null,
            ].filter(Boolean).join(', ') || 'Aucun ciblage défini'}
            onClick={() => setStep(2)}
          />
          <ReviewRow
            icon={Mail}
            label="Séquence"
            value={`${sequenceSummary}, ton ${(TONES.find((t) => t.key === step3.tone)?.label ?? step3.tone).toLowerCase()}`}
            onClick={() => setStep(3)}
          />
          <ReviewRow
            icon={Zap}
            label="Leads"
            value={
              step4.leadSource === 'ai'
                ? `Prospection IA : jusqu'à ${step4.estimatedLeads} leads`
                : `Base existante : ${pickedCount} lead${pickedCount > 1 ? 's' : ''} sélectionné${pickedCount > 1 ? 's' : ''}`
            }
            onClick={() => setStep(4)}
          />
        </div>

        <div className="mb-6 rounded-[10px] border border-border bg-obsidian p-4">
          <SenderPicker
            value={{ mailboxId: step4.mailboxId ?? null, fromAlias: step4.fromAlias ?? null }}
            onChange={(sender) => updateStep4(sender)}
            mailboxes={senders.mailboxes}
            loadError={senders.error}
            disabled={isSaving}
          />
        </div>

        {/* AI checklist */}
        <div className="mb-8 rounded-[10px] border border-cyan/25 bg-obsidian p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-cyan" aria-hidden />
            Ce que Phantera va faire
          </p>
          <ul className="grid gap-2">
            {[
              ...(step4.leadSource === 'ai'
                ? [`Rechercher jusqu'à ${step4.estimatedLeads} leads dans votre cible`, "Vérifier l'adresse e-mail de chaque lead"]
                : [`Mettre en file le premier message de vos ${pickedCount} lead${pickedCount > 1 ? 's' : ''}`]),
              `Personnaliser ${sequenceSummary} avec les données du lead`,
              dmCount > 0
                ? 'Envoyer la séquence multicanal (e-mail et LinkedIn) aux jours prévus'
                : 'Envoyer la séquence aux jours prévus',
              'Classer les réponses et repérer les leads intéressés',
            ].map((action) => (
              <li key={action} className="flex items-start gap-2.5 text-xs text-muted">
                <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-cyan" aria-hidden />
                {action}
              </li>
            ))}
          </ul>
        </div>

        {/* Save error */}
        {missingLeads && (
          <p className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-obsidian px-4 py-3 text-xs text-warning">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            Aucun lead choisi : revenez à l&apos;étape 4 pour sélectionner les leads de votre base, ou choisissez la prospection IA.
          </p>
        )}

        {saveError && (
          <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-danger/30 bg-obsidian px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" aria-hidden />
            <p className="text-xs text-danger">{saveError}</p>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="lg" onClick={prevStep} disabled={isSaving} className="gap-2 px-5">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Retour
          </Button>
          <Button
            size="lg"
            onClick={handleLaunch}
            disabled={isSaving || missingLeads}
            aria-busy={isSaving || undefined}
            title={missingLeads ? 'Choisissez au moins un lead à l’étape 4' : undefined}
            className="gap-2 px-8"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                Enregistrement...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" aria-hidden />
                Lancer la campagne
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
