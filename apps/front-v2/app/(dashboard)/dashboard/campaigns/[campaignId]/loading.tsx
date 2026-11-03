import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// Header, summary line, tabs and the four figures of the Résumé tab.
export default function CampaignLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-11 rounded-lg border border-line bg-raised" />
        <Skeleton className="h-24 rounded-lg border border-line bg-raised" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg border border-line bg-raised" />)}
        </div>
        <Skeleton className="h-48 rounded-lg border border-line bg-raised" />
      </div>
    </div>
  )
}
