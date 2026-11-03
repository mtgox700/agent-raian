/**
 * Body n°2 design system. Colours resolve through the brand theme variables
 * (packages/themes → app/themes.generated.css), so every brand paints this
 * body too. Semantic names only: no brand colour lives here.
 */
import type { Config } from 'tailwindcss'

const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`

const config: Config = {
  future: { hoverOnlyWhenSupported: true },
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas:  rgb('--c-void'),
        raised:  rgb('--c-obsidian'),
        surface: rgb('--c-surface'),
        'surface-2': rgb('--c-surface2'),
        line:    rgb('--c-border'),
        ink:     rgb('--c-white'),
        quiet:   rgb('--c-muted'),
        accent:  { DEFAULT: rgb('--c-cyan'), strong: rgb('--c-cyan-600'), soft: rgb('--c-cyan-300') },
        signal:  rgb('--c-gold'),
        success: rgb('--c-success'),
        warning: rgb('--c-warning'),
        danger:  rgb('--c-danger'),
        ai:      rgb('--c-ai'),
      },
      fontFamily: {
        // --font-display is Syne, or Playfair under data-brand='sparx' (globals.css).
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif:   ['var(--font-serif)', 'Georgia', 'serif'],
      },
      maxWidth: { page: '76rem', prose: '38rem' },
      transitionTimingFunction: { signal: 'var(--ease-signal)' },
    },
  },
  plugins: [],
}

export default config
