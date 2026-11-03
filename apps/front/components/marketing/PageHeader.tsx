// Server Component. The header every content page shares: a mono line that
// says where you are, the H1, the lead, optional actions, and optionally one
// photograph that names the page. One layout, so the site reads as one
// instrument from page to page.
import type { ReactNode } from 'react'
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
    <header className="border-b border-border pt-28 md:pt-36">
      <div className={`mx-auto max-w-[1200px] px-5 pb-16 md:px-8 md:pb-20${photo ? ' grid items-end gap-12 md:grid-cols-12 md:gap-10' : ''}`}>
        <div className={photo ? 'md:col-span-7' : undefined}>
          <p className="font-mono text-sm text-muted">{eyebrow}</p>
          <h1 className="mt-6 max-w-[54rem] font-display text-[clamp(2.4rem,5.4vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-white">
            {title}
          </h1>
          {lead && <p className="mt-8 max-w-[38rem] text-lg leading-relaxed text-muted">{lead}</p>}
          {children && <div className="mt-10 flex flex-col gap-3 sm:flex-row">{children}</div>}
        </div>
        {photo && (
          <div className="md:col-span-5">
            <EditorialPhoto photo={photo} ratio="4 / 3" sizes="(max-width: 768px) 100vw, 460px" position={photoPosition} />
          </div>
        )}
      </div>
    </header>
  )
}
