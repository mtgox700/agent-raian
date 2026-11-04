import Link from 'next/link'
import { brand } from '@/lib/brand'

export function Breadcrumb({ section }: { section: { href: string; label: string } }) {
  return (
    <nav aria-label="Fil d'Ariane" className="font-mono text-xs text-quiet">
      <Link href="/" className="hover:text-ink">{brand.name}</Link>
      {' / '}
      <Link href={section.href} className="hover:text-ink">{section.label}</Link>
    </nav>
  )
}
