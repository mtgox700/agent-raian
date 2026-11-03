import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the journal: title, filters, a day rule and its events on the rail.
export default function HistoryLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-24" />)}
        </div>
        {Array.from({ length: 2 }, (_, g) => (
          <div key={g}>
            <Skeleton className="mb-3 h-3 w-40" />
            <div className="ml-2 space-y-2 border-l border-line pl-5">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-lg border border-line bg-raised" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
