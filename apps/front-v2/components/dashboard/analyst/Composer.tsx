'use client'

/**
 * The question box: Entrée envoie, Maj+Entrée va à la ligne. The compare
 * mode picks 2 to 5 campaigns and writes the question for the user.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, GitCompare, X } from 'lucide-react'
import { analystCopy } from '@/lib/copy/analyst'
import type { CampaignOption } from '@/lib/front/types-analyst'
import { cn } from '@/lib/utils'

const t = analystCopy.composer
const MAX = 2000

export function Composer({ disabled, campaigns, onSend, initial = '' }: {
  disabled: boolean
  campaigns: CampaignOption[]
  onSend: (question: string) => void
  initial?: string
}) {
  const [value, setValue] = useState(initial)
  const [comparing, setComparing] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [value])

  const trimmed = value.trim()
  const canSend = !disabled && trimmed.length >= 3 && trimmed.length <= MAX

  const send = () => {
    if (!canSend) return
    onSend(trimmed)
    setValue('')
  }

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < 5 ? [...cur, id] : cur))
  const compare = () => {
    const names = picked.map((id) => campaigns.find((c) => c.id === id)?.name).filter((n): n is string => Boolean(n))
    onSend(t.question(names))
    setPicked([])
    setComparing(false)
  }

  return (
    <div className="space-y-2">
      {comparing && (
        <div className="rounded-lg border border-line bg-raised p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink">{t.compareTitle}</p>
            <button
              type="button"
              onClick={() => { setComparing(false); setPicked([]) }}
              aria-label={t.closeCompare}
              className="flex h-8 w-8 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {campaigns.length < 2 ? (
            <p className="text-xs text-quiet">{t.needTwo}</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {campaigns.map((c) => {
                const on = picked.includes(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    aria-pressed={on}
                    className={cn(
                      'min-h-[36px] max-w-full truncate rounded-md border px-3 text-xs font-medium transition-colors duration-200 ease-signal',
                      on ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-quiet hover:text-ink',
                    )}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={picked.length < 2 || disabled}
              onClick={compare}
              className="min-h-[36px] rounded-md bg-accent px-4 text-xs font-medium tabular-nums text-canvas transition-colors duration-200 ease-signal hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t.compare(picked.length)}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-lg border border-line bg-raised p-2 transition-colors duration-200 ease-signal focus-within:border-accent/50">
        <button
          type="button"
          onClick={() => setComparing((v) => !v)}
          aria-pressed={comparing}
          disabled={disabled}
          title={t.compareToggle}
          aria-label={t.compareToggle}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-colors duration-200 ease-signal disabled:opacity-40',
            comparing ? 'bg-accent/10 text-accent' : 'text-quiet hover:bg-surface hover:text-ink',
          )}
        >
          <GitCompare className="h-4 w-4" aria-hidden="true" />
        </button>
        <label htmlFor="analyst-question" className="sr-only">{t.label}</label>
        <textarea
          id="analyst-question"
          ref={area}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={MAX}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          placeholder={t.placeholder}
          className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink placeholder:text-quiet/70 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label={t.send}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-canvas transition-colors duration-200 ease-signal hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {value.length > MAX - 200 && <p className="text-right font-mono text-[11px] tabular-nums text-quiet">{value.length} / {MAX}</p>}
    </div>
  )
}
