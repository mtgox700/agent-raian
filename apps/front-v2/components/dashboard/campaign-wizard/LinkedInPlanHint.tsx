/**
 * Quiet note about LinkedIn free vs Premium: inform, never block. Says what
 * the sequence really does: an invitation with a note of 300 characters at
 * most, then the next LinkedIn steps as messages once it is accepted.
 */
import { Linkedin } from 'lucide-react'
import { linkedinHintCopy as t } from '@/lib/copy/campaign-wizard'
import { cn } from '@/lib/utils'

export function LinkedInPlanHint({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border border-line bg-canvas px-3.5 py-3', className)}>
      <Linkedin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-quiet" aria-hidden="true" />
      <div className="text-xs leading-relaxed text-quiet">
        <p><span className="font-medium text-ink">{t.lead}</span>{t.body}</p>
        <p className="mt-1">{t.free}</p>
      </div>
    </div>
  )
}
