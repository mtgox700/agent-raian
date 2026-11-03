'use client'

/**
 * SearchableMultiSelect: an autocomplete picker for large option lists.
 *
 * Instead of dumping 100+ chips on screen, it shows a search box + a compact,
 * scrollable dropdown that filters as you type. Selected values appear as
 * removable chips. Works in two modes:
 *   - multi  (default): pick many values (e.g. job titles)
 *   - single (`single`): pick exactly one (e.g. target industry)
 *
 * Optional `allowCustom` lets the user add a free-text value not in the list
 * useful for the free-text matching of the search (any job title / industry works).
 *
 * Fully keyboard-navigable (↑/↓ to move, Enter to pick, Backspace to remove the
 * last chip, Esc to close) and closes on outside click.
 */

import { withAlpha } from '@/lib/design/color-utils'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { m, AnimatePresence } from 'framer-motion'
import { Search, X, Check, Plus, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchableMultiSelectProps {
  options:      string[]
  selected:     string[]
  onChange:     (next: string[]) => void
  placeholder?: string
  /** Accent colour (a palette CSS colour). Default cyan. Marks the chips,
   *  the focused border and the picked rows: never a glow. */
  color?:       string
  /** Single-select mode: picking replaces the current value and closes. */
  single?:      boolean
  /** Allow adding free-text values not present in `options`. */
  allowCustom?: boolean
  /** Max options rendered in the dropdown at once (perf for huge lists). */
  maxVisible?:  number
}

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Rechercher…',
  color = 'var(--brand-primary)',
  single = false,
  allowCustom = false,
  maxVisible = 50,
}: SearchableMultiSelectProps) {
  const [query, setQuery]           = useState('')
  const [open, setOpen]             = useState(false)
  const [highlight, setHighlight]   = useState(0)
  const rootRef  = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLUListElement>(null)

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected])

  // Filter: case-insensitive match, exclude already-selected (multi mode).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = options.filter((o) => {
      if (!single && selectedSet.has(o.toLowerCase())) return false
      return q === '' ? true : o.toLowerCase().includes(q)
    })
    return base.slice(0, maxVisible)
  }, [options, query, selectedSet, single, maxVisible])

  // Whether the typed query is a brand-new custom value worth offering.
  const canAddCustom = useMemo(() => {
    const q = query.trim()
    if (!allowCustom || q.length === 0) return false
    const exists = options.some((o) => o.toLowerCase() === q.toLowerCase())
    const already = selectedSet.has(q.toLowerCase())
    return !exists && !already
  }, [allowCustom, query, options, selectedSet])

  // Total navigable rows = filtered options (+ custom row when offered).
  const rowCount = filtered.length + (canAddCustom ? 1 : 0)

  useEffect(() => { setHighlight(0) }, [query, open])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const commit = useCallback((value: string) => {
    const v = value.trim()
    if (!v) return
    if (single) {
      onChange([v])
      setQuery('')
      setOpen(false)
      return
    }
    if (!selectedSet.has(v.toLowerCase())) onChange([...selected, v])
    setQuery('')
    // keep the dropdown open for rapid multi-pick
    inputRef.current?.focus()
  }, [single, onChange, selected, selectedSet])

  const remove = useCallback((value: string) => {
    onChange(selected.filter((s) => s !== value))
  }, [onChange, selected])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(rowCount - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (canAddCustom && highlight === filtered.length) commit(query)
      else if (filtered[highlight]) commit(filtered[highlight])
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && !single && selected.length > 0) {
      remove(selected[selected.length - 1]!)
    }
  }

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  return (
    <div ref={rootRef} className="relative">
      {/* Control */}
      <div
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
        className={cn(
          'flex min-h-[3rem] w-full cursor-text flex-wrap items-center gap-1.5 rounded-md border bg-obsidian px-3 py-2 transition-colors duration-150 ease-signal',
          open ? '' : 'border-border hover:border-white/20',
        )}
        style={open ? { borderColor: withAlpha(color, '66') } : undefined}
      >
        {/* Selected chips */}
        {selected.map((val) => (
          <span
            key={val}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
            style={{ background: `${withAlpha(color, '15')}`, color }}
          >
            {val}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(val) }}
              className="rounded transition-opacity hover:opacity-70"
              aria-label={`Retirer ${val}`}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}

        {/* Input */}
        <div className="relative flex min-w-[120px] flex-1 items-center">
          <Search className="mr-2 h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={selected.length === 0 ? placeholder : (single ? '' : 'Ajouter…')}
            aria-label={placeholder}
            aria-expanded={open}
            aria-autocomplete="list"
            className="h-7 w-full bg-transparent text-sm text-white placeholder:text-muted/70 outline-none"
          />
          <ChevronDown
            className={cn('h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200 ease-signal', open && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-[10px] border border-border bg-obsidian"
          >
            <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 && !canAddCustom && (
                <li className="px-3 py-6 text-center text-xs text-muted">
                  Aucun résultat pour « {query} »
                </li>
              )}

              {filtered.map((opt, i) => {
                const isSel = selectedSet.has(opt.toLowerCase())
                const active = i === highlight
                return (
                  <li key={opt}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => commit(opt)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                        active ? 'bg-white/[0.06] text-white' : 'text-white/80 hover:bg-white/[0.03]',
                      )}
                    >
                      <span className="truncate">{highlightMatch(opt, query)}</span>
                      {isSel && <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}

              {/* Add custom row */}
              {canAddCustom && (
                <li>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(filtered.length)}
                    onClick={() => commit(query)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                      highlight === filtered.length ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                    )}
                    style={{ color }}
                  >
                    <Plus className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    Ajouter « {query.trim()} »
                  </button>
                </li>
              )}
            </ul>

            {/* Footer hint */}
            <div className="flex items-center justify-between border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted">
              <span>Flèches pour naviguer · Entrée pour choisir</span>
              {!single && <span>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</span>}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Bold the matched substring inside an option label. */
function highlightMatch(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-white">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}
