import type { Metadata } from 'next'
import { StructuredData } from '@/components/seo/StructuredData'
import { Navbar } from '@/components/marketing/Navbar'
import { Footer } from '@/components/marketing/Footer'
import { PageHeader } from '@/components/marketing/PageHeader'
import { Principles } from '@/components/about/Principles'
import { NameOriginSection } from '@/components/about/NameOriginSection'
import { FounderSection } from '@/components/about/FounderSection'
import { MissionCTA } from '@/components/about/MissionCTA'

/* ── SEO Metadata ─────────────────────────────────────────────── */
// The share images come from ./opengraph-image.tsx and ./twitter-image.tsx
// (the old phantom.jpg had no licence, and /og-about.png did not exist).
export const metadata: Metadata = {
  title: 'À propos de Phantera : la philosophie, le nom, le fondateur',
  description:
    'Pourquoi Phantera existe : trois principes de prospection B2B par IA, prouvés par ce que fait le produit, l\'origine du nom, et le fondateur qui a construit la plateforme.',
  keywords: [
    'à propos Phantera',
    'philosophie prospection IA',
    'génération de leads autonome',
    'fondateur Phantera',
    'Ayoub Hammoudi',
    'histoire Phantera',
    'équipe commerciale IA',
  ],
  alternates: {
    canonical: 'https://www.phantera-tn.com/about',
  },
  openGraph: {
    type: 'profile',
    url: 'https://www.phantera-tn.com/about',
    title: 'À propos de Phantera : une machine de prospection qui sait se taire',
    description:
      'Trois principes, l\'origine du nom et le fondateur derrière Phantera, la prospection B2B par agents IA.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'À propos de Phantera : une machine de prospection qui sait se taire',
    description: 'Trois principes, l\'origine du nom et le fondateur derrière Phantera.',
  },
}

/* ── Person structured data (Founder) ────────────────────────── */
const founderSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Ayoub Hammoudi',
  jobTitle: 'Fondateur et développeur full-stack',
  url: 'https://www.phantera-tn.com/about',
  sameAs: ['https://www.linkedin.com/in/ayoub-hammoudi-3251851b8'],
  image: 'https://www.phantera-tn.com/founder.png',
  worksFor: {
    '@type': 'Organization',
    name: 'Phantera',
    url: 'https://www.phantera-tn.com',
  },
  description:
    'Développeur full-stack indépendant depuis 2021, spécialisé en intégration IA, architecture logicielle et systèmes d\'agents autonomes. Fondateur de Phantera, la plateforme de prospection B2B autonome par IA.',
}

/* ── Organization schema ──────────────────────────────────────── */
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Phantera',
  url: 'https://www.phantera-tn.com',
  logo: 'https://www.phantera-tn.com/brand/phantera-logo-400.png',
  description:
    'Phantera est l\'équipe commerciale IA autonome qui prospecte, enrichit, score et contacte vos clients B2B idéaux, 24h/24.',
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
          lead="Phantera trouve les bons comptes, écrit pour votre cible, et s’arrête dès qu’on vous répond. Voici pourquoi elle est faite ainsi, d’où vient son nom, et qui la construit."
          photo="founderDesk"
          photoPosition="center 60%"
        />
        <Principles />
        <NameOriginSection />
        <FounderSection />
        <MissionCTA />
      </main>

      <Footer />
    </>
  )
}
