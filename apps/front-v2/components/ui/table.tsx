import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * A ruled table: hairlines between rows, mono headers, numbers right-aligned
 * (`numeric`). The wrapper scrolls sideways on a phone instead of the page.
 * Give the table a <TableCaption> (can be `sr-only`) or an `aria-label`.
 */
export function Table({ className, wrapperClassName, ...props }: HTMLAttributes<HTMLTableElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', wrapperClassName)}>
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  )
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return <caption className={cn('pb-3 text-left font-mono text-xs text-quiet', className)} {...props} />
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&>tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-line transition-colors duration-200 ease-signal hover:bg-surface/50 aria-selected:bg-surface', className)} {...props} />
}

export function TableHead({ className, numeric, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn('h-10 whitespace-nowrap px-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-quiet', numeric && 'text-right', className)}
      {...props}
    />
  )
}

export function TableCell({ className, numeric, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return <td className={cn('px-3 py-3 align-middle text-ink', numeric && 'text-right font-mono tabular-nums', className)} {...props} />
}
