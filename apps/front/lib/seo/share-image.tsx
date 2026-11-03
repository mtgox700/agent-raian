/**
 * The 1200×630 image shown when a Phantera link is shared (Open Graph and
 * X/Twitter cards).
 *
 * Satori (next/og) needs `display: flex` on every element with more than one
 * child: the headline mixed text and a <span> without it, so the image never
 * rendered (500), hidden until 2026-10-10 behind a redirect to sign-in.
 */

import { ShareLogo } from './share-mark'

export const SHARE_IMAGE_ALT = 'Phantera : prospectez comme vous aimeriez être prospecté'

export function ShareImage() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: 'radial-gradient(120% 120% at 0% 0%, #0a1622 0%, #050508 55%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <ShareLogo />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          marginTop: 40,
          fontSize: 66,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2,
          maxWidth: 960,
        }}
      >
        <span>Prospectez comme vous&nbsp;</span>
        <span style={{ color: '#00D4FF' }}>aimeriez être prospecté.</span>
      </div>

      <div style={{ display: 'flex', marginTop: 28, fontSize: 30, color: '#9aa4b2', maxWidth: 900 }}>
        Prospection B2B par IA : prospects trouvés et vérifiés, séquences e-mail, LinkedIn et SMS depuis vos comptes, arrêt dès la réponse.
      </div>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 28,
          fontSize: 22,
          color: '#6b7686',
        }}
      >
        <span>Sourcing IA</span>
        <span style={{ color: '#2a3240' }}>•</span>
        <span>Score 0 à 100</span>
        <span style={{ color: '#2a3240' }}>•</span>
        <span>E-mail · LinkedIn · SMS</span>
      </div>
    </div>
  )
}
