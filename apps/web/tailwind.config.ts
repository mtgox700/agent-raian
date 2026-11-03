/**
 * Tailwind theme: derived from `lib/design/tokens.ts`.
 *
 * Source of truth lives in `lib/design/tokens.ts`. This file maps those
 * tokens onto Tailwind's expected shape. NEVER hard-code values here that
 * aren't already in tokens.ts: keep both files in lockstep.
 */
import type { Config } from 'tailwindcss'
import {
  palette,
  color,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  shadow,
  breakpoint,
} from './lib/design/tokens'

const config: Config = {
  // Touch screens never get a sticky :hover state (mobile-native rule).
  future: { hoverOnlyWhenSupported: true },
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── Colour palette ───────────────────────────────────────────────────
      // Brand-named semantic aliases (preserve legacy class names like
      // `bg-void`, `text-cyan`, `border-border`) AND new functional tokens.
      colors: {
        // ── CSS-variable colour engine (3 scopes) ─────────────────────────
        // Every brand-varying colour resolves through an RGB-triplet CSS var
        // (see globals.css):
        //   :root                              -> Phantera dark neon (exact legacy)
        //   [data-brand='sparx']               -> Spar-x marketing (ivory light)
        //   [data-brand='sparx'] [data-app-shell] -> Spar-x DASHBOARD (dark teal)
        // The `<alpha-value>` syntax keeps every /NN opacity modifier working.
        // `white` = "contrast foreground" across the codebase: remapped per scope.
        white:       'rgb(var(--c-white) / <alpha-value>)',
        void:        'rgb(var(--c-void) / <alpha-value>)',
        obsidian:    'rgb(var(--c-obsidian) / <alpha-value>)',
        surface:     'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface2) / <alpha-value>)',
        muted:       'rgb(var(--c-muted) / <alpha-value>)',
        border:      'rgb(var(--c-border) / <alpha-value>)',

        cyan: {
          DEFAULT: 'rgb(var(--c-cyan) / <alpha-value>)',
          deep:    'rgb(var(--c-cyan-700) / <alpha-value>)',
          glow:    color.glow.cyan,
          300:     'rgb(var(--c-cyan-300) / <alpha-value>)',
          400:     'rgb(var(--c-cyan) / <alpha-value>)',
          500:     'rgb(var(--c-cyan-500) / <alpha-value>)',
          600:     'rgb(var(--c-cyan-600) / <alpha-value>)',
          700:     'rgb(var(--c-cyan-700) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)',
          glow:    color.glow.gold,
          400:     'rgb(var(--c-gold) / <alpha-value>)',
          500:     'rgb(var(--c-gold-500) / <alpha-value>)',
        },

        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          fg:      'rgb(var(--c-success-fg) / <alpha-value>)',
          deep:    'rgb(var(--c-success-deep) / <alpha-value>)',
        },
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger:  'rgb(var(--c-danger) / <alpha-value>)',
        ai: {
          DEFAULT: 'rgb(var(--c-ai) / <alpha-value>)',
          fg:      'rgb(var(--c-ai-fg) / <alpha-value>)',
        },
        highlight: 'rgb(var(--c-highlight) / <alpha-value>)',
      },

      // ── Typography ────────────────────────────────────────────────────────
      fontFamily: {
        display: fontFamily.display.split(',').map((s) => s.trim()),
        body:    fontFamily.body.split(',').map((s) => s.trim()),
        brand:   fontFamily.brand.split(',').map((s) => s.trim()),
        mono:    ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      transitionTimingFunction: {
        signal: 'cubic-bezier(0.2, 0.7, 0.1, 1)',
      },
      fontSize,
      fontWeight: {
        light:    String(fontWeight.light),
        regular:  String(fontWeight.regular),
        medium:   String(fontWeight.medium),
        semibold: String(fontWeight.semibold),
        bold:     String(fontWeight.bold),
        black:    String(fontWeight.black),
      },
      letterSpacing,

      // ── Radius + shadows ─────────────────────────────────────────────────
      borderRadius: {
        ...radius,
      },
      boxShadow: {
        cyan:      shadow.glowCyan,
        'cyan-sm': shadow.glowCyanSm,
        gold:      shadow.glowGold,
        ai:        shadow.glowAi,
        card:      shadow.card,
        'card-hover': shadow.cardHover,
        modal:     shadow.modal,
      },

      // ── Gradients (background images) ────────────────────────────────────
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'dot-grid':
          'radial-gradient(circle, rgba(var(--fg-rgb), 0.06) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-grid': '32px 32px',
      },

      // ── Animation ────────────────────────────────────────────────────────
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        float:        'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'spin-slow':  'spin 20s linear infinite',
        'accordion-down': 'accordionDown 0.2s ease-out',
        'accordion-up':   'accordionUp 0.2s ease-out',
      },
      keyframes: {
        accordionDown: {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        accordionUp: {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%':      { opacity: '1' },
        },
      },

      // ── Breakpoints ──────────────────────────────────────────────────────
      screens: breakpoint,
    },
  },
  plugins: [],
}

export default config
