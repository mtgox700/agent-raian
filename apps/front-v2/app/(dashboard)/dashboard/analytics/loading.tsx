import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the analytics page: title, filters, four figures, then the charts.
export default function AnalyticsLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
      </div>
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-lg border border-line bg-raised" />)}
        </div>
        <Skeleton className="h-80 rounded-lg border border-line bg-raised" />
        <Skeleton className="h-64 rounded-lg border border-line bg-raised" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-lg border border-line bg-raised" />
          <Skeleton className="h-64 rounded-lg border border-line bg-raised" />
        </div>
      </div>
    </div>
  )
}
