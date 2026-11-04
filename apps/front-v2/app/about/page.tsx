import type { Metadata } from 'next'
import { StructuredData } from '@/lib/seo/StructuredData'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { PageHeader } from '@/lib/marketing/PageHeader'
import { brand, isPhantera } from '@/lib/brand'
import { Principles } from './_components/Principles'
import { NameOriginSection } from './_components/NameOriginSection'
import { FounderSection } from './_components/FounderSection'
import { MissionCTA } from './_components/MissionCTA'

/* ── SEO Metadata ─────────────────────────────────────────────── */
// The share images come from ./opengraph-image.tsx and ./twitter-image.tsx.
export const metadata: Metadata = {
  title: `À propos de ${brand.name} : la philosophie, le nom, le fondateur`,
  description:
    `Pourquoi ${brand.name} existe : trois principes de prospection B2B par IA, prouvés par ce que fait le produit, l'origine du nom, et le fondateur qui a construit la plateforme.`,
  keywords: [
    `à propos ${brand.name}`,
    'philosophie prospection IA',
    'génération de leads autonome',
    `fondateur ${brand.name}`,
    'Ayoub Hammoudi',
    `histoire ${brand.name}`,
    'équipe commerciale IA',
  ],
  alternates: {
    canonical: `${brand.url}/about`,
  },
  openGraph: {
    type: 'profile',
    url: `${brand.url}/about`,
    title: `À propos de ${brand.name} : une machine de prospection qui sait se taire`,
    description:
      `Trois principes, l'origine du nom et le fondateur derrière ${brand.name}, la prospection B2B par agents IA.`,
  },
  twitter: {
    card: 'summary_large_image',
    title: `À propos de ${brand.name} : une machine de prospection qui sait se taire`,
    description: `Trois principes, l'origine du nom et le fondateur derrière ${brand.name}.`,
  },
}

/* ── Person structured data (Founder) ────────────────────────── */
const founderSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Ayoub Hammoudi',
  jobTitle: 'Fondateur et développeur full-stack',
  url: `${brand.url}/about`,
  sameAs: ['https://www.linkedin.com/in/ayoub-hammoudi-3251851b8'],
  image: `${brand.url}/founder.png`,
  worksFor: {
    '@type': 'Organization',
    name: brand.name,
    url: brand.url,
  },
  description:
    `Développeur full-stack indépendant depuis 2021, spécialisé en intégration IA, architecture logicielle et systèmes d'agents autonomes. Fondateur de ${brand.name}, la plateforme de prospection B2B autonome par IA.`,
}

/* ── Organization schema ──────────────────────────────────────── */
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: brand.name,
  url: brand.url,
  logo: `${brand.url}/brand/phantera-logo-400.png`,
  description:
    `${brand.name} est l'équipe commerciale IA autonome qui prospecte, enrichit, score et contacte vos clients B2B idéaux, 24h/24.`,
  founder: {
    '@type': 'Person',
    name: 'Ayoub Hammoudi',
  },
  sameAs: ['https://www.linkedin.com/in/ayoub-hammoudi-3251851b8'],
}

/* ── About Page ───────────────────────────────────────────────── */
export default function AboutPage() {
  return (
    <>
      <StructuredData schema={founderSchema} />
      <StructuredData schema={organizationSchema} />

      <Navbar />

      <main id="main-content">
        <PageHeader
          eyebrow="À propos"
          title="Une machine de prospection qui sait se taire."
          lead={`${brand.name} trouve les bons comptes, écrit pour votre cible, et s’arrête dès qu’on vous répond. Voici pourquoi elle est faite ainsi, d’où vient son nom, et qui la construit.`}
          photo="founderDesk"
          photoPosition="center 60%"
        />
        <Principles />
        {/* The name's etymology (Phantom + Panthera) is Phantera's own. */}
        {isPhantera && <NameOriginSection />}
        <FounderSection />
        <MissionCTA />
      </main>

      <Footer />
    </>
  )
}
