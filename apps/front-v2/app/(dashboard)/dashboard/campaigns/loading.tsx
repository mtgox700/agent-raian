import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// Header, KPI row, filters and the card grid, on the same hairlines.
export default function CampaignsLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6 md:py-4">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-2 h-3 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg border border-line bg-raised" />)}
        </div>
        <Skeleton className="h-7 w-80" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52 rounded-lg border border-line bg-raised" />)}
        </div>
      </div>
    </div>
  )
}
