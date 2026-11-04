import { ImageResponse } from 'next/og'
import { ShareMark } from '@/lib/seo/share-mark'

// Home-screen icon (iOS): the « Arrêt net » mark on the brand background.
export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050508' }}>
        <ShareMark size={128} />
      </div>
    ),
    { ...size },
  )
}
