/**
 * Visual regression per brand, without a browser: the landing page's HTML is
 * rendered for every brand and compared with the committed snapshot
 * (__snapshots__/landing.<brand>.html). Any change in markup, text or
 * classes shows up in the PR diff; accept a deliberate one with
 * `npx vitest run lib/visual -u`.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { BRAND_KEYS } from '@/lib/brand/keys.generated'

// next/font is a build-time transform: give each font a stable class name.
// Rendered outside the Next router: the home page, at '/'.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/font/local', () => ({ default: () => ({ className: 'font', variable: 'font-var', style: {} }) }))

describe.each(BRAND_KEYS)('landing page, brand %s', (key) => {
  it('renders the same HTML as the snapshot', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_BRAND', key)
    const { default: HomePage } = await import('@/app/page')
    const html = renderToStaticMarkup(<HomePage />)
      // Year in the footer: stable snapshot across years.
      .replace(/©\s*\d{4}/g, '© YEAR')
    await expect(html).toMatchFileSnapshot(`./__snapshots__/landing.${key}.html`)
    vi.unstubAllEnvs()
  })
})
