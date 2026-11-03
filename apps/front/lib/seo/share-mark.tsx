/**
 * The « Arrêt net » mark and wordmark for the generated share images
 * (Satori: plain SVG and `display: flex`, no app components).
 */

const STROKE = { stroke: '#F4F4F6', strokeWidth: 18, strokeLinecap: 'round' as const, fill: 'none' }

export function ShareMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200">
      <g transform="translate(-7 0)">
        <path d="M48 160 L92 40" {...STROKE} />
        <path d="M86 160 L130 40" {...STROKE} />
        <path d="M124 160 L140 116" {...STROKE} />
        <circle cx="156" cy="72" r="11" fill="#00D4FF" />
      </g>
    </svg>
  )
}

export function ShareLogo({ markSize = 64, fontSize = 30 }: { markSize?: number; fontSize?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <ShareMark size={markSize} />
      <div style={{ display: 'flex', fontSize, fontWeight: 700, letterSpacing: -0.5 }}>phantera</div>
    </div>
  )
}

export const SHARE_SLOGAN = 'Prospectez comme vous aimeriez être prospecté.'
