import { Navbar } from '@/components/marketing/Navbar'
import { Hero } from '@/components/marketing/Hero'
import { StatsBar } from '@/components/marketing/StatsBar'
import { HowItWorks } from '@/components/marketing/HowItWorks'
import { Features } from '@/components/marketing/Features'
import { Signature } from '@/components/marketing/Signature'
import { Pricing } from '@/components/marketing/Pricing'
import { FAQ } from '@/components/marketing/FAQ'
import { Contact } from '@/components/marketing/Contact'
import { Footer } from '@/components/marketing/Footer'
import { LatestArticles } from '@/components/marketing/LatestArticles'
import { isSparx } from '@/lib/brand'
import { StructuredData } from '@/components/seo/StructuredData'
import { faqSchema } from '@/lib/seo/structured-data'

// Statically rendered and server-first (Legends League): every section is a
// Server Component. The only client code on this page is the navbar and the
// small players of the three signature scenes, mounted after idle.
export default function HomePage() {
  return (
    <>
      <StructuredData schema={faqSchema} />
      <Navbar />
      <main id="main-content">
        <Hero />
        <StatsBar />
        <HowItWorks />
        <Features />
        <Signature />
        <Pricing />
        {/* Testimonials retirés (Reality Lock C1) : les 3 citations étaient
            fictives. La section revient dès les 3 premiers témoignages
            clients réels (DoD du chantier C3). */}
        <FAQ />
        {!isSparx && <LatestArticles />}
        <Contact />
      </main>
      <Footer />
    </>
  )
}
