import { Skeleton } from '@/components/ui'
import { errorCopy } from '@/lib/app-copy'

// The shape of the « À envoyer » page (header, note, message cards) on the same hairlines.
export default function PhoneQueueLoading() {
  return (
    <div aria-busy="true" aria-label={errorCopy.loading}>
      <div className="border-b border-line px-4 py-3 md:px-6 md:py-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-8 md:p-6">
        <Skeleton className="h-20 rounded-lg border border-line bg-raised" />
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52 rounded-lg border border-line bg-raised" />)}
      </div>
    </div>
  )
}
