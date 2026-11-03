import { Navbar } from '@/components/marketing/Navbar'
import { Hero } from '@/components/marketing/Hero'
import { Facts } from '@/components/marketing/Facts'
import { Relay } from '@/components/marketing/Relay'
import { Features } from '@/components/marketing/Features'
import { Signature } from '@/components/marketing/Signature'
import { Pricing } from '@/components/marketing/Pricing'
import { Faq } from '@/components/marketing/Faq'
import { Closing } from '@/components/marketing/Closing'
import { Footer } from '@/components/marketing/Footer'

// Static and server-only: this page ships no client component of its own.
// Read as one sequence: the promise, the facts, the relay (01), what it does (02),
// the signature, the prices (03), the questions (04), and the point.
export default function HomePage() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Hero />
        <Facts />
        <Relay />
        <Features />
        <Signature />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </>
  )
}
