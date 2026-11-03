import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@phantera/sdk'
import { brand } from '@/lib/brand'
import { Logo } from '@/components/brand/Logo'
import { buttonVariants } from '@/components/ui'
import { loadView } from '@/lib/front/server-api'

const api = createClient()

export const metadata: Metadata = {
  title:  'Invitation',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }

const primary = buttonVariants({ variant: 'primary', size: 'lg' }) + ' w-full'
const secondary = buttonVariants({ variant: 'outline', size: 'lg' }) + ' w-full'

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {children}
      </div>
    </main>
  )
}

/**
 * The invitation page (same flow and texts as body n°1). Public: the token is
 * the key; joining needs a signed-in account holding the invited address.
 * Data: views.invite; actions: team.startInvitation, team.acceptInvitation.
 */
export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params
  const { error } = await searchParams
  const invitation = await loadView('views.invite', { params: { token }, query: typeof error === 'string' ? { error } : {} })

  if (invitation.state === 'invalid') {
    return (
      <Card>
        <h1 className="font-display text-xl font-semibold text-ink">Invitation expirée ou déjà utilisée</h1>
        <p className="mt-3 text-sm text-quiet">Un lien d’invitation ne sert qu’une fois et pendant 7 jours. Demandez-en un nouveau à la personne qui vous a invité.</p>
        <Link href="/" className={`${secondary} mt-6`}>Retour à {brand.name}</Link>
      </Card>
    )
  }

  const { signedIn, emailVerified, errorMessage } = invitation
  // A plain form post: the API answers with a 303 to the dashboard, or back here with ?error=.
  const accept = api.url('team.acceptInvitation', { params: { token } })

  return (
    <Card>
      <p className="font-mono text-xs uppercase tracking-widest text-accent">Invitation</p>
      <h1 className="mt-2 font-display text-xl font-semibold text-ink">Rejoindre l’espace «{' '}{invitation.workspaceName}{' '}»</h1>
      <p className="mt-3 text-sm text-quiet">
        {invitation.inviterName} vous invite en tant que <strong className="text-ink">{invitation.roleLabel.toLowerCase()}</strong>.
        L’invitation est destinée à <strong className="text-ink">{invitation.email}</strong>.
      </p>

      {errorMessage && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{errorMessage}</p>}

      <div className="mt-6 space-y-3">
        {!signedIn && (
          <>
            <a href={api.url('team.startInvitation', { params: { token }, query: { with: 'sign-up' } })} className={primary}>Créer mon compte</a>
            <a href={api.url('team.startInvitation', { params: { token }, query: { with: 'sign-in' } })} className={secondary}>J’ai déjà un compte</a>
          </>
        )}
        {signedIn && emailVerified && (
          <form method="post" action={accept}>
            <button type="submit" className={primary}>Rejoindre l’espace</button>
          </form>
        )}
        {signedIn && !emailVerified && (
          <>
            <p className="text-sm text-quiet">
              Vous êtes connecté avec une autre adresse. Connectez-vous avec <strong className="text-ink">{invitation.email}</strong>, ou ajoutez-la à votre compte, pour rejoindre l’espace.
            </p>
            <Link href="/dashboard" className={secondary}>Aller à mon tableau de bord</Link>
          </>
        )}
      </div>
    </Card>
  )
}
