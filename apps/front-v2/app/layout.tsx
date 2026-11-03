import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import './themes.generated.css'
import { brand } from '@/lib/brand'
import { navigation } from '@/lib/content'

const syne = localFont({
  src: [
    { path: './fonts/syne-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/syne-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-syne',
  display: 'swap',
  preload: true,
})

const inter = localFont({
  src: [
    { path: './fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-inter',
  // 'optional', not 'swap': the hero lead paragraph is the home page's LCP, and
  // with 'swap' it was painted twice (fallback, then Inter), the second paint
  // being the LCP (2.9 s in PageSpeed mobile, 2026-10-26). Preloaded, Inter is
  // ready for the first paint on most visits; when it is not, the size-adjusted
  // fallback stays for that page view and nothing repaints.
  display: 'optional',
  preload: true,
})

// Data, labels and sequence steps (the "instrument" voice). Never the LCP,
// so it is not preloaded.
const mono = localFont({
  src: [
    { path: './fonts/jetbrains-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jetbrains-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
  preload: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

// Editorial serif display: used ONLY by the sparx brand (tokens.ts points
// font-display at --font-serif under NEXT_PUBLIC_BRAND=sparx). preload:false +
// never referenced under phantera -> zero cost for the Phantera deployment.
const playfair = localFont({
  // next/font/local needs literal paths: one entry per weight and style.
  src: [
    { path: './fonts/playfair-display-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/playfair-display-latin-500-italic.woff2', weight: '500', style: 'italic' },
    { path: './fonts/playfair-display-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/playfair-display-latin-600-italic.woff2', weight: '600', style: 'italic' },
    { path: './fonts/playfair-display-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/playfair-display-latin-700-italic.woff2', weight: '700', style: 'italic' },
    { path: './fonts/playfair-display-latin-800-normal.woff2', weight: '800', style: 'normal' },
    { path: './fonts/playfair-display-latin-800-italic.woff2', weight: '800', style: 'italic' },
    { path: './fonts/playfair-display-latin-900-normal.woff2', weight: '900', style: 'normal' },
    { path: './fonts/playfair-display-latin-900-italic.woff2', weight: '900', style: 'italic' },
  ],
  variable: '--font-serif',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(brand.url),
  title: { default: brand.seo.title, template: brand.seo.titleTemplate },
  description: brand.seo.description,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang={brand.locale}
      data-brand={brand.key}
      className={[syne.variable, inter.variable, mono.variable, playfair.variable].join(' ')}
    >
      <body className="bg-canvas font-sans text-ink antialiased">
        <a href="#main-content" className="skip-link">{navigation.skipLink}</a>
        {children}
      </body>
    </html>
  )
}
