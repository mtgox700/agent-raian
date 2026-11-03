import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the Analyst: title, conversations on the side, suggestions, the question box.
export default function AnalystLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>
      <div className="flex gap-6 p-4 md:p-6">
        <div className="hidden w-60 shrink-0 space-y-2 border-r border-line pr-4 lg:block">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="mt-6 h-5 w-40" />
          <div className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[52px] rounded-lg border border-line bg-raised" />)}
          </div>
          <Skeleton className="mt-10 h-14 rounded-lg border border-line bg-raised" />
        </div>
      </div>
    </div>
  )
}
