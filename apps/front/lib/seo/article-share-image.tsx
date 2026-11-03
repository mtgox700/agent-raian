/**
 * The 1200×630 image shown when a blog article is shared (LinkedIn, Slack,
 * WhatsApp). Satori needs `display: flex` on every element with more than one
 * child (see share-image.tsx).
 */

import { SHARE_SLOGAN, ShareLogo } from './share-mark'

export function ArticleShareImage({ title, author }: { title: string; author: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '72px 80px',
        background: 'radial-gradient(120% 120% at 100% 0%, #0a1622 0%, #050508 55%)',
        color: '#F4F4F6',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <ShareLogo />
        <div style={{ display: 'flex', marginLeft: 12, fontSize: 22, color: '#00D4FF', letterSpacing: 3 }}>BLOG</div>
      </div>
      <div style={{ display: 'flex', marginTop: 56, fontSize: 60, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5, maxWidth: 1040 }}>
        {title}
      </div>
      <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', fontSize: 24, color: '#9A9AB0' }}>
        <div style={{ display: 'flex' }}>{author}</div>
        <div style={{ display: 'flex' }}>{SHARE_SLOGAN}</div>
      </div>
    </div>
  )
}
