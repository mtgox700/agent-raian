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
        display: ['var(--font-syne)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'ui-monospace', 'monospace'],
        serif:   ['var(--font-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
