import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// Header, step counter, the rail and the first step's fields.
export default function NewCampaignLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="mt-2 h-3 w-36" />
      </div>
      <div className="space-y-8 p-4 md:p-6">
        <Skeleton className="h-6 w-full" />
        <div className="flex gap-10">
          <div className="w-60 shrink-0 space-y-4 max-lg:hidden">
            {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
          <div className="mx-auto w-full max-w-2xl space-y-6">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-36 rounded-lg border border-line bg-raised" />
            <Skeleton className="h-12" />
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg border border-line bg-raised" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
