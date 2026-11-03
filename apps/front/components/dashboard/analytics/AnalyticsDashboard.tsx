'use client'

/**
 * Analytics (lot A1). Every figure comes with the number of leads behind it
 * and its interval; a change is only called a change when a test says so.
 * Filters live in the URL: a view can be shared, and survives a reload.
 */

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { BarChart3, Check, ChevronDown, Loader2 } from 'lucide-react'
import { filtersQuery, PERIODS, type PeriodKey } from '@/lib/analytics/filters'
import type { AnalyticsReport } from '@/lib/analytics/report'
import { ChartFrame, ci, nf, pct } from './ChartFrame'
import { KpiStrip } from './KpiStrip'
import { Leaderboard } from './Leaderboard'
import { StepFunnel } from './StepFunnel'
import { CalibrationPanel, ChannelsPanel, HeatmapPanel } from './A2Panels'
import { AnnotationList, MatrixPanel, PipelinePanel, SegmentsPanel, TrianglePanel } from './A3Panels'
import { ComparisonPanel } from './ComparisonPanel'

const ChartSkeleton = ({ h }: { h: string }) => <div className={`${h} w-full animate-pulse motion-reduce:animate-none rounded-[10px] bg-white/[0.03]`} aria-hidden="true" />
const CohortChart = dynamic(() => import('./charts').then((m) => m.CohortChart), { ssr: false, loading: () => <ChartSkeleton h="h-64" /> })
const MailboxCards = dynamic(() => import('./charts').then((m) => m.MailboxCards), { ssr: false, loading: () => <ChartSkeleton h="h-40" /> })
const DelayChart = dynamic(() => import('./charts').then((m) => m.DelayChart), { ssr: false, loading: () => <ChartSkeleton h="h-56" /> })
const MixChart = dynamic(() => import('./charts').then((m) => m.MixChart), { ssr: false, loading: () => <ChartSkeleton h="h-56" /> })

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

const DOW = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const PERIOD_LABEL: Record<PeriodKey, string> = { '7d': '7 jours', '30d': '30 jours', '90d': '90 jours' }

function CampaignPicker({ campaigns, selected, onApply, disabled, emptyLabel = 'Toutes les campagnes', clearLabel = 'Toutes', prefix = '' }: {
  campaigns: AnalyticsReport['campaigns']; selected: string[]; onApply: (ids: string[]) => void; disabled: boolean
  emptyLabel?: string; clearLabel?: string; prefix?: string
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(selected)
  const label = selected.length === 0 ? emptyLabel : `${prefix}${selected.length === 1 ? (campaigns.find((c) => c.id === selected[0])?.name ?? '1 campagne') : `${selected.length} campagnes`}`
  return (
    <div className="relative">
      <button type="button" onClick={() => { setPicked(selected); setOpen((v) => !v) }} aria-expanded={open} disabled={disabled}
        className="flex min-h-[36px] max-w-[16rem] items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-white hover:border-cyan/40 disabled:opacity-50">
        <span className="truncate">{label}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[10px] border border-border bg-obsidian p-2">
          <div className="max-h-64 overflow-y-auto">
            {campaigns.map((c) => {
              const on = picked.includes(c.id)
              return (
                <button key={c.id} type="button" onClick={() => setPicked((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))} aria-pressed={on}
                  className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-xs text-white/85 hover:bg-white/[0.04]">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-cyan bg-cyan/20' : 'border-border'}`}>{on && <Check className="h-3 w-3 text-cyan" />}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
            <button type="button" onClick={() => setPicked([])} className="min-h-[32px] px-2 text-xs text-muted hover:text-white">{clearLabel}</button>
            <button type="button" onClick={() => { setOpen(false); onApply(picked) }} className="min-h-[32px] rounded-md bg-cyan px-3 text-xs font-bold text-void">Appliquer</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AnalyticsDashboard({ report }: { report: AnalyticsReport }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const go = (period: PeriodKey, ids: string[], vs: string[] = report.versus) =>
    startTransition(() => router.push(`/dashboard/analytics${filtersQuery(period, ids, vs.filter((id) => !ids.includes(id)))}`))

  const reply = report.kpis.find((k) => k.key === 'reply')
  const noData = report.campaigns.length === 0 || (report.kpis.find((k) => k.key === 'contacted')?.value ?? 0) === 0
  const lb = report.leaderboard
  const measured = report.cohorts.reduce((a, c) => a + c.rate.n, 0)

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-cyan/20 bg-cyan/5"><BarChart3 className="h-4 w-4 text-cyan" aria-hidden="true" /></div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Analyses</h1>
            <p className="text-xs text-muted">Chaque chiffre avec le nombre de leads qui le porte et sa marge d’incertitude.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {pending && <Loader2 className="h-4 w-4 animate-spin text-cyan motion-reduce:animate-none" aria-label="Mise à jour" />}
          <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Période">
            {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
              <button key={k} type="button" onClick={() => go(k, report.selected)} aria-pressed={report.period === k} disabled={pending}
                className={`min-h-[32px] rounded-md px-3 text-xs font-semibold transition-colors ${report.period === k ? 'bg-cyan/15 text-cyan' : 'text-muted hover:text-white'}`}>
                {PERIOD_LABEL[k]}
              </button>
            ))}
          </div>
          <CampaignPicker campaigns={report.campaigns} selected={report.selected} onApply={(ids) => go(report.period, ids)} disabled={pending} />
          <CampaignPicker campaigns={report.campaigns.filter((c) => !report.selected.includes(c.id))} selected={report.versus} onApply={(ids) => go(report.period, report.selected, ids)} disabled={pending}
            emptyLabel="Comparer avec…" clearLabel="Aucune" prefix="Face à : " />
        </div>
      </header>

      {noData ? (
        <div className="rounded-[10px] border border-dashed border-border px-6 py-14 text-center">
          <p className="text-sm font-semibold text-white">Aucun lead contacté sur les {PERIOD_LABEL[report.period]}.</p>
          <p className="mt-1 text-xs text-muted">Les analyses apparaissent dès les premiers envois.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {report.period !== '90d' && (
              <button type="button" onClick={() => go('90d', report.selected)} disabled={pending} className="min-h-[36px] rounded-md bg-cyan px-4 text-xs font-bold text-void disabled:opacity-50">Voir sur 90 jours</button>
            )}
            {report.selected.length > 0 && (
              <button type="button" onClick={() => go(report.period, [])} disabled={pending} className="min-h-[36px] rounded-md border border-border px-4 text-xs font-semibold text-white hover:border-cyan/40 disabled:opacity-50">Toutes les campagnes</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {report.comparison && <ComparisonPanel comparison={report.comparison} days={report.days} onClose={() => go(report.period, report.selected, [])} />}
          <KpiStrip kpis={report.kpis} days={report.days} />

          <ChartFrame id="tendance" question="Mon taux de réponse s’améliore-t-il ?"
            method="leads regroupés par semaine de premier contact, réponse sous 7 jours, IC 95 % de Wilson"
            n={`${nf(measured)} leads mesurés sur 12 semaines`}
            empty={report.cohorts.length === 0 ? 'Pas encore de semaine complète à afficher.' : null}
            table={[['Semaine du', 'Contactés', 'Mesurés (J+7)', 'Réponse', 'IC 95 %'], ...report.cohorts.map((c) => [dayLabel(c.week), nf(c.contacted), nf(c.mature) + (c.provisional ? ' (en cours)' : ''), c.rate.n ? pct(c.rate) : 'n.d.', c.rate.n ? ci(c.rate) : ''])]}>
            <CohortChart points={report.cohorts} annotations={report.annotations} />
            <p className="mt-2 text-[11px] text-muted">La bande donne la marge d’incertitude : plus une semaine compte de leads, plus elle est étroite. Une semaine récente n’inclut que les leads contactés depuis au moins 7 jours. Les traits pointillés dorés marquent les lancements et les pauses.</p>
            <AnnotationList weeks={report.annotations} firstWeek={report.cohorts[0]?.week ?? null} />
          </ChartFrame>

          <ChartFrame id="cohortes" question="Les semaines récentes rattrapent-elles les précédentes ?"
            method="part des leads ayant répondu 3, 7, 14 et 30 jours après le premier contact, par semaine de premier contact"
            n={`${nf(report.triangle.weeks.reduce((a, w) => a + w.contacted, 0))} leads sur 12 semaines`}
            empty={report.triangle.weeks.length === 0 ? 'Aucun lead contacté sur les 12 dernières semaines.' : null}
            table={[['Semaine du', 'Contactés', ...report.triangle.days.map((d) => `J+${d}`)], ...report.triangle.weeks.map((w) => [dayLabel(w.week), nf(w.contacted), ...w.cells.map((c) => (c.state === 'pending' ? 'trop récent' : `${pct(c.rate)} (${c.rate.successes}/${c.rate.n})${c.state === 'partial' ? ' partiel' : ''}`))])]}>
            <TrianglePanel triangle={report.triangle} />
          </ChartFrame>

          <ChartFrame id="campagnes" question="Quelles campagnes performent vraiment, au-delà du hasard ?"
            method="chaque campagne comparée aux autres réunies, correction de Benjamini-Hochberg, classement par la borne basse"
            n={reply?.rate ? `${nf(lb.pooled.n)} leads mesurés` : undefined}
            empty={lb.ranked.length === 0 && lb.insufficient.length === 0 ? 'Aucune campagne n’a encore de leads mesurables à 7 jours sur la période.' : null}
            table={[['Campagne', 'Réponse', 'Réponses / leads', 'IC 95 %', 'Verdict'], ...lb.ranked.map((r) => [r.name, pct(r.rate), `${r.rate.successes}/${r.rate.n}`, ci(r.rate), r.verdict ?? 'non testé']), ...lb.insufficient.map((r) => [r.name, pct(r.rate), `${r.rate.successes}/${r.rate.n}`, ci(r.rate), 'moins de 30 leads'])]}>
            <Leaderboard ranked={lb.ranked} insufficient={lb.insufficient} pooled={lb.pooled} />
          </ChartFrame>

          <ChartFrame id="pipeline" question="Jusqu’où vont mes prospects, et en combien de temps ?"
            method="leads contactés pour la première fois sur la période ; part de chaque étape et délai médian depuis le premier contact (20 leads au moins)"
            empty={report.pipeline.length === 0 ? 'Aucun lead contacté sur la période.' : null}
            table={[['Étape', 'Leads', 'Part des contactés', 'IC 95 %', 'Délai médian (jours)'], ...report.pipeline.map((s) => [s.label, nf(s.count), s.ofContacted ? pct(s.ofContacted) : '', s.ofContacted ? ci(s.ofContacted) : '', s.medianDays === null ? '' : String(s.medianDays)])]}>
            <PipelinePanel stages={report.pipeline} />
          </ChartFrame>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame id="etapes" question="À quelle étape je perds mes prospects ?"
              method="leads contactés pour la première fois sur la période, par étape de la séquence"
              empty={report.steps.length === 0 ? 'Aucune étape envoyée sur la période.' : null}
              table={[['Étape', 'Canal', 'Leads atteints', 'Réponse', 'IC 95 %', 'Rebonds'], ...report.steps.map((s) => [String(s.position), s.channel, nf(s.reached), s.pending ? 'pas encore envoyée' : pct(s.replyRate), s.pending ? '' : ci(s.replyRate), nf(s.bounced)])]}>
              <StepFunnel steps={report.steps} />
            </ChartFrame>

            <ChartFrame id="delivrabilite" question="Une de mes boîtes est-elle en train de griller sa réputation ?"
              method="rebonds / emails tentés, par semaine ; vigilance à 2 %, danger à 5 %"
              empty={report.mailboxes.length === 0 ? 'Aucun email envoyé depuis une boîte connectée sur la période.' : null}
              table={[['Boîte', 'Rebonds', 'Envois', 'Niveau'], ...report.mailboxes.map((b) => [b.label, pct(b.bounce), nf(b.bounce.n), b.level])]}>
              <MailboxCards boxes={report.mailboxes} />
              <p className="mt-2 text-[11px] text-muted">Les rebonds arrivent parfois plusieurs jours après l’envoi : la dernière semaine peut encore monter. SPF, DKIM et DMARC ne sont pas vérifiés par Phantera.</p>
            </ChartFrame>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartFrame id="delai" question="Combien de temps attendre avant de conclure qu’un prospect ne répondra pas ?"
              method="part cumulée des leads ayant répondu depuis le premier contact (Kaplan-Meier : un lead contacté récemment compte jusqu’à aujourd’hui)"
              n={`${nf(report.delay.events)} réponses sur ${nf(report.delay.leads)} leads`}
              empty={report.delay.enough ? null : `Il faut au moins 20 réponses pour tracer une courbe fiable (${nf(report.delay.events)} sur la période).`}
              table={[['Jour', 'Ont répondu', 'IC 95 %'], ...report.delay.points.map((pt) => [`J+${pt.t}`, pct({ successes: 0, n: 1, rate: pt.replied, ci: pt.ci }), ci({ successes: 0, n: 1, rate: pt.replied, ci: pt.ci })])]}>
              <DelayChart curve={report.delay} />
              {report.delay.marks.length > 0 && (
                <p className="mt-2 text-xs text-white/85">
                  {report.delay.marks.map((m) => `J+${m.day} : ${Math.round(m.share * 100)} % des réponses obtenues`).join(' · ')}
                </p>
              )}
            </ChartFrame>

            <ChartFrame id="score" question="Le score IA prédit-il vraiment qui répond ?"
              method="réponse à J+7 par badge, leads contactés depuis au moins 7 jours"
              n={`${nf(report.calibration.badges.reduce((a, b) => a + b.rate.n, 0))} leads mesurés`}
              empty={report.calibration.badges.length === 0 ? 'Aucun lead mesurable à 7 jours sur la période.' : null}
              table={[['Badge', 'Réponse', 'Réponses / leads', 'IC 95 %'], ...report.calibration.badges.map((b) => [b.badge, pct(b.rate), `${b.rate.successes}/${b.rate.n}`, ci(b.rate)])]}>
              <CalibrationPanel data={report.calibration} />
            </ChartFrame>
          </div>

          <ChartFrame id="segments" question="Qui répond le plus : quel niveau, quel secteur, quelle taille, quel pays ?"
            method="réponse à J+7, leads contactés depuis au moins 7 jours ; chaque segment comparé aux autres de sa dimension, correction de Benjamini-Hochberg"
            n={`${nf(report.segments.breakdowns[0]?.measured ?? 0)} leads mesurés`}
            empty={report.segments.breakdowns.every((b) => !b.comparable) ? (report.segments.breakdowns[0]?.measured ? 'Vos leads mesurés ont tous le même niveau, secteur, taille et pays : rien à comparer.' : 'Aucun lead mesurable à 7 jours sur la période.') : null}
            table={[['Dimension', 'Segment', 'Réponse', 'Réponses / leads', 'IC 95 %', 'Verdict'], ...report.segments.breakdowns.filter((b) => b.comparable).flatMap((b) => b.segments.map((s) => [b.title, s.label, pct(s.rate), `${s.rate.successes}/${s.rate.n}`, ci(s.rate), s.pooled ? 'non testé' : s.rate.n < 30 ? 'moins de 30 leads' : s.verdict === 'insuffisant' || !s.direction ? 'pas d’écart démontré' : `${s.direction}${s.verdict === 'tendance' ? ', à surveiller' : ''}`]))]}>
            <SegmentsPanel breakdowns={report.segments.breakdowns} singleCampaign={report.segments.singleCampaign} />
          </ChartFrame>

          <ChartFrame id="matrice" question="Quel niveau de poste répond, dans quel secteur ?"
            method="réponse à J+7 par niveau de poste et pour les 5 secteurs les plus contactés"
            empty={report.segments.matrix.columns.length === 0 ? 'Pas assez de leads avec un poste et un secteur renseignés.' : null}
            table={[['Niveau', ...report.segments.matrix.columns.map((c) => c.label)], ...report.segments.matrix.rows.map((r) => [r.label, ...r.cells.map((c) => (c.rate.n ? `${pct(c.rate)} (${c.rate.successes}/${c.rate.n})` : ''))])]}>
            <MatrixPanel matrix={report.segments.matrix} />
          </ChartFrame>

          <ChartFrame id="reponses" question="Mes réponses sont-elles des intérêts ou des refus ?"
            method="leads ayant répondu, par semaine de réponse et par classification (IA, non vérifiée)"
            n={`${nf(report.mix.reduce((a, w) => a + w.total, 0))} leads sur 12 semaines`}
            empty={report.mix.length === 0 ? 'Aucune réponse sur les 12 dernières semaines.' : null}
            table={[['Semaine du', 'Positives', 'Neutres', 'Refus', 'Total'], ...report.mix.map((w) => [dayLabel(w.week), nf(w.positive), nf(w.neutral), nf(w.negative), nf(w.total)])]}>
            <MixChart weeks={report.mix} />
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-success-fg" aria-hidden="true" /> positives</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted/50" aria-hidden="true" /> neutres</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-danger/75" aria-hidden="true" /> refus</span>
              <span>classées par IA, non vérifiées</span>
            </p>
          </ChartFrame>

          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <ChartFrame id="horaires" question="Quand Phantera envoie-t-il, et quand mes prospects répondent-ils ?"
              method="par jour de la semaine et par heure, sur la période"
              empty={report.heatmap.totalSent === 0 ? 'Aucun envoi sur la période.' : null}
              table={[['Jour', 'Heure', 'Envois', 'Leads ayant répondu'], ...report.heatmap.sent.flatMap((row, d) => row.map((sent, h) => ({ d, h, sent, replied: report.heatmap.replied[d][h] }))).filter((c) => c.sent || c.replied).map((c) => [DOW[c.d], `${c.h} h`, nf(c.sent), nf(c.replied)])]}>
              <HeatmapPanel grid={report.heatmap} />
            </ChartFrame>

            <ChartFrame id="canaux" question="Quel canal fait réellement répondre ?"
              method="leads touchés par canal sur la période, et ceux qui ont répondu à un message de ce canal"
              empty={report.channels.length === 0 ? 'Aucun message envoyé sur la période.' : null}
              table={[['Canal', 'Leads touchés', 'Réponse', 'IC 95 %'], ...report.channels.map((c) => [c.channel, nf(c.reached), c.rate ? pct(c.rate) : 'non mesuré', c.rate ? ci(c.rate) : ''])]}>
              <ChannelsPanel channels={report.channels} />
            </ChartFrame>
          </div>
        </>
      )}
    </div>
  )
}
