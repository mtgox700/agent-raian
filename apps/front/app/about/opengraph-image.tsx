import { ImageResponse } from 'next/og'
import { ShareImage, SHARE_IMAGE_ALT } from '@/lib/seo/share-image'

// Open Graph image of /about: the brand card (the old phantom.jpg had no
// known licence and said nothing about the product).
// Route segment config must stay inline (Next can't statically parse a
// re-exported `runtime`); the image itself is shared.
export const runtime = 'edge'
export const alt = SHARE_IMAGE_ALT
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(<ShareImage />, { ...size })
}
