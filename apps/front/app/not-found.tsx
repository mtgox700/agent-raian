import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { BrandLogoNav } from '@/components/brand/BrandLogo'
import { brand } from '@/lib/brand'

// Server Component. A lost visitor gets the same instrument as everywhere
// else, a plain sentence, and three ways back.
export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-[100dvh] flex-col">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5 md:px-8">
        <Link href="/" aria-label={`${brand.name}, accueil`} className="-m-2 rounded-md p-2">
          <BrandLogoNav />
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-center px-5 pb-24 md:px-8">
        <p className="font-mono text-sm text-muted">Erreur 404</p>
        <h1 className="mt-6 max-w-[40rem] font-display text-[clamp(2.4rem,6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
          Ce lien s&apos;arrête ici.
        </h1>
        <p className="mt-6 max-w-[32rem] text-lg leading-relaxed text-muted">
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
      </div>
    </main>
  )
}
