'use client'

/**
 * Small pieces the settings tabs share: error wording, an in-page confirmation
 * (body n°1 used window.confirm with the same words), a switch, icon buttons.
 */
import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@phantera/sdk'
import { Button } from '@/components/ui'
import { Dialog } from '@/components/ui/dialog'
import { mailboxCopy } from '@/lib/copy/settings'
import { cn } from '@/lib/utils'

/** The API's own message when it gave one (or the input check's), else the fallback. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.body?.error ?? fallback
  const issues = (err as { issues?: { message?: string }[] } | null)?.issues
  if (Array.isArray(issues) && issues[0]?.message) return issues[0].message
  return fallback
}

/** The JSON body of an API refusal, with the fields beyond `error` (409 details…). */
export function errorBody<T>(err: unknown): (T & { error?: string }) | null {
  return err instanceof ApiError ? (err.body as (T & { error?: string }) | null) : null
}

export const iconButton =
  'inline-flex h-9 w-9 items-center justify-center rounded-md text-quiet transition-colors duration-200 ease-signal hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40'

interface ConfirmRequest {
  title: string
  lines?: string[]
  confirmLabel: string
  danger?: boolean
}

/** `await ask({ title, … })` resolves true when confirmed. Render `dialog` once. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback((req: ConfirmRequest) => new Promise<boolean>((resolve) => {
    resolver.current = resolve
    setRequest(req)
  }), [])

  const settle = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setRequest(null)
  }

  const dialog = (
    <Dialog
      open={request !== null}
      onClose={() => settle(false)}
      title={request?.title ?? ''}
      closeLabel={mailboxCopy.cancel}
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => settle(false)}>{mailboxCopy.cancel}</Button>
          <Button
            type="button"
            size="sm"
            variant={request?.danger ? 'outline' : 'primary'}
            className={cn(request?.danger && 'border-danger/50 text-danger hover:border-danger hover:text-danger')}
            onClick={() => settle(true)}
          >
            {request?.confirmLabel}
          </Button>
        </>
      }
    >
      {request?.lines && request.lines.length > 0 && (
        <div className="space-y-1 text-sm leading-relaxed text-quiet">
          {request.lines.map((line, i) => (line ? <p key={i}>{line}</p> : <div key={i} className="h-2" aria-hidden="true" />))}
        </div>
      )}
    </Dialog>
  )

  return { ask, dialog }
}

/** An on/off switch; its name comes from `label` or `labelledBy`. */
export function Switch({ checked, onChange, disabled, label, labelledBy, size = 'md' }: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label?: string
  labelledBy?: string
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative shrink-0 rounded-full border transition-colors duration-200 ease-signal disabled:opacity-40',
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        checked ? 'border-accent/50 bg-accent/25' : 'border-line bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-0.5 top-1/2 -translate-y-1/2 rounded-full transition-transform duration-200 ease-signal',
          size === 'md' ? 'h-[18px] w-[18px]' : 'h-[14px] w-[14px]',
          checked ? (size === 'md' ? 'translate-x-5 bg-accent' : 'translate-x-4 bg-accent') : 'translate-x-0 bg-quiet',
        )}
      />
    </button>
  )
}

/** Mono section heading inside a panel, with a one-line explanation. */
export function SectionHead({ title, id, children, action }: {
  title: React.ReactNode
  id?: string
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-2xl">
        <h3 id={id} className="flex items-center gap-2 font-display text-base font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {children && <div className="mt-1 text-sm leading-relaxed text-quiet">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}
