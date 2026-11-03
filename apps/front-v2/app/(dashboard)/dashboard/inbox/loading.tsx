import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// Header, filters, the list and the reading pane.
export default function InboxLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-3 w-52" />
      </div>
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-96 max-w-full" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-px overflow-hidden rounded-lg border border-line">
            {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-16 rounded-none bg-raised" />)}
          </div>
          <Skeleton className="h-[28rem] rounded-lg border border-line bg-raised max-lg:hidden" />
        </div>
      </div>
    </div>
  )
}
