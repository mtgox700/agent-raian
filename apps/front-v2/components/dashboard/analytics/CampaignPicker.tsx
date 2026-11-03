'use client'

/**
 * Several campaigns picked at once, applied together (one navigation, one
 * query). Closes on Escape and on a click outside; focus returns to the trigger.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { analyticsCopy } from '@/lib/copy/analytics'
import type { AnalyticsCampaign } from '@/lib/front/types-analytics'
import { cn } from '@/lib/utils'

const t = analyticsCopy.picker

export function CampaignPicker({ campaigns, selected, onApply, disabled, emptyLabel = t.all, clearLabel = t.clear, prefix = '' }: {
  campaigns: AnalyticsCampaign[]
  selected: string[]
  onApply: (ids: string[]) => void
  disabled: boolean
  emptyLabel?: string
  clearLabel?: string
  prefix?: string
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string[]>(selected)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const onDown = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])

  const label = selected.length === 0
    ? emptyLabel
    : `${prefix}${selected.length === 1 ? (campaigns.find((c) => c.id === selected[0])?.name ?? t.oneCampaign) : t.campaigns(selected.length)}`

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => { setPicked(selected); setOpen((v) => !v) }}
        aria-expanded={open}
        disabled={disabled}
        className="flex h-9 max-w-[16rem] items-center gap-2 rounded-md border border-line px-3 text-xs font-medium text-ink transition-colors duration-200 ease-signal hover:border-accent disabled:opacity-50"
      >
        <span className="truncate">{label}</span><ChevronDown className="h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-raised p-2 shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {campaigns.map((c) => {
              const on = picked.includes(c.id)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPicked((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}
                  aria-pressed={on}
                  className="flex min-h-[36px] w-full items-center gap-2 rounded-md px-2 text-left text-xs text-ink/85 transition-colors duration-200 ease-signal hover:bg-surface"
                >
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-accent bg-accent/20' : 'border-line')}>
                    {on && <Check className="h-3 w-3 text-accent" aria-hidden="true" />}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-line pt-2">
            <button type="button" onClick={() => setPicked([])} className="min-h-[32px] px-2 text-xs text-quiet transition-colors duration-200 ease-signal hover:text-ink">{clearLabel}</button>
            <button type="button" onClick={() => { setOpen(false); onApply(picked) }} className="min-h-[32px] rounded-md bg-accent px-3 text-xs font-medium text-canvas transition-colors duration-200 ease-signal hover:bg-accent-strong">{t.apply}</button>
          </div>
        </div>
      )}
    </div>
  )
}
