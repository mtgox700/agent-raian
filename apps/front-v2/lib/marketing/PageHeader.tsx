// Server Component. The header every content page shares: a mono line that
// says where you are, the H1, the lead, optional actions, and optionally one
// photograph that names the page.
import type { ReactNode } from 'react'
import { Container, Eyebrow, Heading } from '@/components/ui'
import type { PhotoKey } from '@/lib/marketing/photos'
import { EditorialPhoto } from './EditorialPhoto'

interface PageHeaderProps {
  eyebrow: string
  title: ReactNode
  lead?: ReactNode
  children?: ReactNode
  photo?: PhotoKey
  photoPosition?: string
}

export function PageHeader({ eyebrow, title, lead, children, photo, photoPosition }: PageHeaderProps) {
  return (
    <header className="pt-20 md:pt-28">
      <Container className={`pb-16 md:pb-20${photo ? ' grid items-end gap-12 md:grid-cols-12 md:gap-10' : ''}`}>
        <div className={photo ? 'md:col-span-7' : undefined}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading as="h1" className="mt-6 max-w-[22ch]">{title}</Heading>
          {lead && <p className="mt-8 max-w-prose text-lg leading-relaxed text-quiet">{lead}</p>}
          {children && <div className="mt-10 flex flex-col gap-3 sm:flex-row">{children}</div>}
        </div>
        {photo && (
          <div className="md:col-span-5">
            <EditorialPhoto photo={photo} ratio="4 / 3" sizes="(max-width: 768px) 100vw, 460px" position={photoPosition} priority />
          </div>
        )}
      </Container>
    </header>
  )
}
