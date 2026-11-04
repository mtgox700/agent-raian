import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { buttonVariants, Container, Eyebrow, Heading } from '@/components/ui'
import { brand } from '@/lib/brand'

// Server Component. A lost visitor gets the same instrument as everywhere
// else, a plain sentence, and three ways back.
export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-[100dvh] flex-col">
      <Container className="flex h-16 items-center">
        <Link href="/" aria-label={`${brand.name}, accueil`} className="-m-2 rounded-md p-2">
          <Logo />
        </Link>
      </Container>
      <Container className="flex flex-1 flex-col justify-center pb-24">
        <Eyebrow>Erreur 404</Eyebrow>
        <Heading as="h1" size="hero" className="mt-6 max-w-[16ch]">
          Ce lien s&apos;arrête ici.
        </Heading>
        <p className="mt-6 max-w-prose text-lg leading-relaxed text-quiet">
          L&apos;adresse est peut-être incomplète, ou la page a été déplacée.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/" className={buttonVariants({ size: 'lg' })}>
            Retour à l&apos;accueil
          </Link>
          <Link href="/dashboard" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
            Mon tableau de bord
          </Link>
          <Link href="/blog" className={buttonVariants({ size: 'lg', variant: 'ghost' })}>
            Le blog
          </Link>
        </div>
      </Container>
    </main>
  )
}
