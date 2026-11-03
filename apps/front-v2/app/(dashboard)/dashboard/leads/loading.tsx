import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the Leads page (header, four figures, the table) on the same hairlines.
export default function LeadsLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6 md:py-4">
        <div>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="space-y-6 p-4 pb-8 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg border border-line bg-raised" />)}
        </div>
        <div className="rounded-lg border border-line bg-raised">
          <div className="flex gap-3 border-b border-line px-4 py-3">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 w-64" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
