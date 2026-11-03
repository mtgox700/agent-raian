'use client'

/**
 * The question box: Entrée envoie, Maj+Entrée va à la ligne. The compare
 * mode picks 2 to 5 campaigns and writes the question for the user.
 */

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, GitCompare, X } from 'lucide-react'
import type { CampaignOption } from './types'

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

  useEffect(() => { if (initial) setValue(initial) }, [initial])
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

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p))
  const compare = () => {
    const names = picked.map((id) => campaigns.find((c) => c.id === id)?.name).filter(Boolean)
    onSend(`Compare les campagnes ${names.map((n) => `« ${n} »`).join(' et ')} : laquelle répond le mieux, et l’écart est-il réel ?`)
    setPicked([])
    setComparing(false)
  }

  return (
    <div className="space-y-2">
      {comparing && (
        <div className="rounded-[10px] border border-border bg-obsidian p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-white">Choisissez 2 à 5 campagnes à comparer</p>
            <button type="button" onClick={() => { setComparing(false); setPicked([]) }} aria-label="Fermer la comparaison" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:text-white">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {campaigns.length < 2 ? (
            <p className="text-xs text-muted">Il faut au moins deux campagnes visibles pour comparer.</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {campaigns.map((c) => {
                const on = picked.includes(c.id)
                return (
                  <button
                    key={c.id} type="button" onClick={() => toggle(c.id)} aria-pressed={on}
                    className={`min-h-[36px] max-w-full truncate rounded-md border px-3 text-xs font-medium transition-colors ${on ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-border text-muted hover:border-white/20 hover:text-white'}`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button type="button" disabled={picked.length < 2 || disabled} onClick={compare} className="min-h-[36px] rounded-md bg-cyan px-4 text-xs font-bold text-void tabular-nums disabled:cursor-not-allowed disabled:opacity-40">
              Comparer {picked.length >= 2 ? `(${picked.length})` : ''}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-[10px] border border-border bg-obsidian p-2 focus-within:border-cyan/40">
        <button
          type="button" onClick={() => setComparing((v) => !v)} aria-pressed={comparing} disabled={disabled}
          title="Comparer des campagnes" aria-label="Comparer des campagnes"
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${comparing ? 'bg-cyan/10 text-cyan' : 'text-muted hover:bg-white/[0.04] hover:text-white'}`}
        >
          <GitCompare className="h-4 w-4" aria-hidden="true" />
        </button>
        <label htmlFor="analyst-question" className="sr-only">Votre question à l’Analyste</label>
        <textarea
          id="analyst-question" ref={area} rows={1} value={value} disabled={disabled} maxLength={MAX}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } }}
          placeholder="Pourquoi ma campagne n’avance pas ? Que changer cette semaine ?"
          className="max-h-[180px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-white placeholder:text-muted/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button" onClick={send} disabled={!canSend} aria-label="Envoyer la question"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-cyan text-void transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {value.length > MAX - 200 && <p className="text-right font-mono text-[11px] text-muted tabular-nums">{value.length} / {MAX}</p>}
    </div>
  )
}
