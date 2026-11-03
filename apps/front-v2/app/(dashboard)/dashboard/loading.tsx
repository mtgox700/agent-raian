import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the page that is coming (header, day counters, metric cards,
// chart) on the same hairlines, so nothing jumps when the data lands.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 p-4 pb-8 md:p-6" aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line pb-6">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-7 w-56" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 rounded-lg border border-line bg-raised" />)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg border border-line bg-raised" />)}
      </div>
      <Skeleton className="h-72 rounded-lg border border-line bg-raised" />
    </div>
  )
}
