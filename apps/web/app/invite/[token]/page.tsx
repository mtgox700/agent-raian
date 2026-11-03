import type { Metadata } from 'next'
import Link from 'next/link'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { brand } from '@/lib/brand'
import { PhanteraMark } from '@/components/brand/PhanteraMark'
import { readInvitation, TEAM_ERRORS, type TeamError } from '@/lib/team/team.service'
import { ROLE_LABELS } from '@/lib/team/invitation-link'
import { acceptInvitationAction } from './actions'

export const metadata: Metadata = {
  title:  'Invitation',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-void px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-surface p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <PhanteraMark size={40} className="mx-auto mb-6" title={brand.name} />
        {children}
      </div>
    </main>
  )
}

const buttonClass = 'inline-flex w-full items-center justify-center rounded-xl bg-cyan px-4 py-3 text-sm font-semibold text-void transition-opacity hover:opacity-90'
const secondaryClass = 'inline-flex w-full items-center justify-center rounded-xl border border-border/60 px-4 py-3 text-sm font-medium text-white hover:bg-white/5'

/**
 * The invitation page. Public: the token is the key, and joining also needs
 * a signed-in account holding the invited address (see actions.ts).
 */
export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params
  const { error } = await searchParams
  const invitation = await readInvitation(db, token)

  if (!invitation) {
    return (
      <Card>
        <h1 className="font-display text-xl font-bold text-white">Invitation expirée ou déjà utilisée</h1>
        <p className="mt-3 text-sm text-muted">Un lien d’invitation ne sert qu’une fois et pendant 7 jours. Demandez-en un nouveau à la personne qui vous a invité.</p>
        <Link href="/" className={`${secondaryClass} mt-6`}>Retour à {brand.name}</Link>
      </Card>
    )
  }

  const { userId } = await auth()
  const user = userId ? await currentUser() : null
  const verified = (user?.emailAddresses ?? []).filter((e) => e.verification?.status === 'verified').map((e) => e.emailAddress.toLowerCase())
  const errorMessage = error && error in TEAM_ERRORS ? (TEAM_ERRORS[error as TeamError] || 'Le plan de cet espace n’a plus de place libre : demandez à un admin.') : null
  const accept = acceptInvitationAction.bind(null, token)

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-widest text-cyan">Invitation</p>
      <h1 className="mt-2 font-display text-xl font-bold text-white">Rejoindre l’espace «{' '}{invitation.workspace.name}{' '}»</h1>
      <p className="mt-3 text-sm text-muted">
        {invitation.inviterName} vous invite en tant que <strong className="text-white">{ROLE_LABELS[invitation.role].toLowerCase()}</strong>.
        L’invitation est destinée à <strong className="text-white">{invitation.email}</strong>.
      </p>

      {errorMessage && <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{errorMessage}</p>}

      <div className="mt-6 space-y-3">
        {!userId && (
          <>
            <a href={`/invite/${token}/start?with=sign-up`} className={buttonClass}>Créer mon compte</a>
            <a href={`/invite/${token}/start?with=sign-in`} className={secondaryClass}>J’ai déjà un compte</a>
          </>
        )}
        {userId && verified.includes(invitation.email) && (
          <form action={accept}>
            <button type="submit" className={buttonClass}>Rejoindre l’espace</button>
          </form>
        )}
        {userId && !verified.includes(invitation.email) && (
          <p className="text-sm text-muted">
            Vous êtes connecté avec une autre adresse. Connectez-vous avec <strong className="text-white">{invitation.email}</strong>, ou ajoutez-la à votre compte, pour rejoindre l’espace.
          </p>
        )}
        {userId && !verified.includes(invitation.email) && (
          <Link href="/dashboard" className={secondaryClass}>Aller à mon tableau de bord</Link>
        )}
      </div>
    </Card>
  )
}
