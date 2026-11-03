'use client'

/**
 * LinkedInPlanHint: quiet educational note about LinkedIn free vs Premium.
 *
 * Doctrine (2026-07-14, Victoria): INFORM, never block. A free LinkedIn
 * account runs the whole funnel (invitations -> accept -> DMs); a free plan
 * limits invitation notes. Phantera sends no InMail. Shown wherever the user makes a
 * LinkedIn-outreach decision so support never has to answer "why did my
 * lead get an empty invitation?".
 */

import { Linkedin } from 'lucide-react'
import { cn } from '@/lib/utils'

// Says what the sequence really does (lib/sequences/send-step.ts): an
// invitation with a note of 300 characters at most, then the next LinkedIn
// steps as messages once the invitation is accepted. Phantera sends no InMail
// (lib/multichannel/linkedin-limits.ts), so no plan is sold as "InMail".
export function LinkedInPlanHint({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-md border border-border bg-void px-3.5 py-3', className)}>
      <Linkedin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted" aria-hidden="true" />
      <div className="text-xs leading-relaxed text-muted">
        <p>
          <span className="font-medium text-white">Sur LinkedIn</span>, le premier contact est une invitation de
          connexion, avec une note de 300 caractères au plus. Les étapes LinkedIn suivantes partent en message une
          fois l&apos;invitation acceptée.
        </p>
        <p className="mt-1">
          Avec un compte gratuit, LinkedIn limite le nombre de notes d&apos;invitation : une invitation peut alors
          partir sans note.
        </p>
      </div>
    </div>
  )
}
