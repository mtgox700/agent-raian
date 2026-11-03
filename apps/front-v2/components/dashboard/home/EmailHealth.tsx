import { Mail } from 'lucide-react'
import { EmptyState, Panel } from '@/components/ui'
import { home } from '@/lib/app-copy'
import { formatPercent } from '@/lib/format/percent'
import type { DashboardEmailHealth } from '@/lib/front/types'

const t = home.emailHealth
const nf = (n: number) => n.toLocaleString('fr-FR')

/** One measured rate, with the base it is taken on; no target (no sourced benchmark). */
function RateRow({ label, note, value, base, basis }: { label: string; note?: string; value: number; base: number; basis: string }) {
  const measured = base > 0
  const width = measured ? Math.min(Math.max(value, 0), 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink">
          {label}
          {note && <span className="ml-1.5 font-mono text-[11px] font-normal text-quiet">{note}</span>}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-ink">{measured ? formatPercent(value) : home.metric.noData}</span>
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-surface"
        role="img"
        aria-label={measured ? `${label} : ${formatPercent(value)}, ${basis}` : t.noDataLabel(label)}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${width}%` }} />
      </div>
      {measured && <p className="font-mono text-[11px] tabular-nums text-quiet">{basis}</p>}
    </div>
  )
}

/** What happened to the e-mails sent over 30 days. Opens are measured by pixel: indicative. */
export function EmailHealth({ data }: { data: DashboardEmailHealth }) {
  const delivered = Math.max(data.sentCount - data.bounceCount, 0)
  const bounceRate = data.sentCount > 0 ? (data.bounceCount / data.sentCount) * 100 : 0

  return (
    <Panel title={<span className="inline-flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{t.title}</span>} meta={t.period} className="flex h-full flex-col">
      {data.sentCount === 0 ? (
        <EmptyState icon={Mail} title={t.emptyTitle} className="flex-1">{t.emptyBody}</EmptyState>
      ) : (
        <div className="space-y-5">
          <RateRow label={t.delivery} value={data.deliveryRate} base={data.sentCount} basis={`${t.delivered(delivered)} ${t.sentOf(data.sentCount)}`} />
          <RateRow label={t.open} note={t.openNote} value={data.openRate} base={delivered} basis={`${t.on} ${t.delivered(delivered)}`} />
          <RateRow label={t.click} value={data.clickRate} base={delivered} basis={`${t.on} ${t.delivered(delivered)}`} />
          <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
            {[[t.sent, nf(data.sentCount)], [t.bounces, nf(data.bounceCount)], [t.bounceRate, formatPercent(bounceRate)]].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="font-mono text-[11px] text-quiet">{label}</dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Panel>
  )
}
