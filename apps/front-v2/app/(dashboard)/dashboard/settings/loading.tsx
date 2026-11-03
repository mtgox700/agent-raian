import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the settings screen: header, tab list, two panels.
export default function SettingsLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      <div className="flex gap-6 p-4 max-md:flex-col md:p-6">
        <div className="flex w-48 shrink-0 flex-col gap-1 max-md:w-auto max-md:flex-row">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 max-md:w-24" />)}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-44 rounded-lg border border-line bg-raised" />
          <Skeleton className="h-24 rounded-lg border border-line bg-raised" />
        </div>
      </div>
    </div>
  )
}
