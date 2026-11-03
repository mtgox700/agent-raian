'use client'

/**
 * An autocomplete picker for long lists (job titles, industries): a search
 * box, a filtered dropdown, chips for the values chosen. `single` keeps one
 * value; `allowCustom` accepts a value typed by the user. Keyboard: arrows,
 * Enter, Backspace removes the last chip, Escape closes; closes on outside click.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { multiSelectCopy as t } from '@/lib/copy/campaign-wizard'
import { cn } from '@/lib/utils'

function highlightMatch(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return <>{text.slice(0, idx)}<span className="font-semibold text-ink">{text.slice(idx, idx + q.length)}</span>{text.slice(idx + q.length)}</>
}

export function SearchableMultiSelect({ options, selected, onChange, placeholder = t.search, single = false, allowCustom = false, maxVisible = 50 }: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  single?: boolean
  allowCustom?: boolean
  maxVisible?: number
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedSet = useMemo(() => new Set(selected.map((v) => v.toLowerCase())), [selected])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options
      .filter((o) => (!single && selectedSet.has(o.toLowerCase()) ? false : q === '' || o.toLowerCase().includes(q)))
      .slice(0, maxVisible)
  }, [options, query, selectedSet, single, maxVisible])

  const canAddCustom = useMemo(() => {
    const q = query.trim()
    if (!allowCustom || q.length === 0) return false
    return !options.some((o) => o.toLowerCase() === q.toLowerCase()) && !selectedSet.has(q.toLowerCase())
  }, [allowCustom, query, options, selectedSet])

  const rowCount = filtered.length + (canAddCustom ? 1 : 0)

  useEffect(() => { setHighlight(0) }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const commit = useCallback((value: string) => {
    const v = value.trim()
    if (!v) return
    if (single) { onChange([v]); setQuery(''); setOpen(false); return }
    if (!selectedSet.has(v.toLowerCase())) onChange([...selected, v])
    setQuery('')
    inputRef.current?.focus() // stays open for rapid multi-pick
  }, [single, onChange, selected, selectedSet])

  const remove = useCallback((value: string) => onChange(selected.filter((v) => v !== value)), [onChange, selected])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHighlight((h) => Math.min(h + 1, Math.max(rowCount - 1, 0))) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (canAddCustom && highlight === filtered.length) commit(query)
      else if (filtered[highlight]) commit(filtered[highlight])
    } else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Backspace' && query === '' && !single && selected.length > 0) remove(selected[selected.length - 1])
  }

  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  return (
    <div ref={rootRef} className="relative">
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
        className={cn(
          'flex min-h-[3rem] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-raised px-3 py-2 transition-colors duration-200 ease-signal',
          open ? 'border-accent/40' : 'border-line hover:border-quiet/50',
        )}
      >
        {selected.map((val) => (
          <span key={val} className="flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
            {val}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(val) }} className="rounded transition-opacity hover:opacity-70" aria-label={t.remove(val)}>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <div className="relative flex min-w-[120px] flex-1 items-center">
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={selected.length === 0 ? placeholder : (single ? '' : t.add)}
            aria-label={placeholder}
            aria-expanded={open}
            aria-autocomplete="list"
            className="h-7 w-full bg-transparent text-sm text-ink outline-none placeholder:text-quiet/70"
          />
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-quiet transition-transform duration-200 ease-signal', open && 'rotate-180')} aria-hidden="true" />
        </div>
      </div>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-line bg-raised">
          <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && !canAddCustom && <li className="px-3 py-6 text-center text-xs text-quiet">{t.noResult(query)}</li>}
            {filtered.map((opt, i) => (
              <li key={opt}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => commit(opt)}
                  className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors', i === highlight ? 'bg-surface text-ink' : 'text-ink/80 hover:bg-surface/50')}
                >
                  <span className="truncate">{highlightMatch(opt, query)}</span>
                  {selectedSet.has(opt.toLowerCase()) && <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
                </button>
              </li>
            ))}
            {canAddCustom && (
              <li>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(filtered.length)}
                  onClick={() => commit(query)}
                  className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent transition-colors', highlight === filtered.length ? 'bg-surface' : 'hover:bg-surface/50')}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t.addCustom(query.trim())}
                </button>
              </li>
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 font-mono text-[11px] text-quiet">
            <span>{t.hint}</span>
            {!single && <span>{t.selected(selected.length)}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
