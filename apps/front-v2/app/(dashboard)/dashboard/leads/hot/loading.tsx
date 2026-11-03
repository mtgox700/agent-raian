import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the Hot leads page (header, funnel, cards) on the same hairlines.
export default function HotLeadsLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-6 md:py-4">
        <div>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-2 h-3 w-52" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="space-y-6 p-4 pb-8 md:p-6">
        <Skeleton className="h-44 rounded-lg border border-line bg-raised" />
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-lg border border-line bg-raised" />)}
        </div>
      </div>
    </div>
  )
}
