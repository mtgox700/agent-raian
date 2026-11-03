/**
 * Design Tokens (Single Source of Truth): brand-aware.
 *
 * Every visual constant lives here. Tailwind config, runtime JS animations,
 * inline styles, and component themes all derive their values from this file.
 *
 * WHITE-LABEL: the exported `palette` / `color` / `shadow` / `fontFamily`
 * switch on NEXT_PUBLIC_BRAND at BUILD time (each Vercel project ships one
 * brand). Class names like `bg-void` or `text-cyan` are kept for zero
 * component churn: under the sparx brand their VALUES resolve to the
 * Spar-x editorial-light charter (ivory background, teal primary).
 *
 * Why a TS file (not CSS variables only):
 *   • Type-safe: shared Palette type: a brand can't omit a token
 *   • Runtime-accessible: canvas / framer / GSAP can read raw hex
 *   • Single source: Tailwind config imports here, so the two never drift
 */

const IS_SPARX = process.env.NEXT_PUBLIC_BRAND === 'sparx'

// ─── 1. PRIMITIVE PALETTES ───────────────────────────────────────────────────
// Raw colour scales. Never used directly in components: only by semantic
// tokens below and by the Tailwind theme.

// Phantera « Instrument » (Legends League, 2026-10-24): obsidian neutrals
// with the violet cast removed, the logo's exact black and white. Cyan is the
// signal (the logo's point), gold is the human (a reply, the recommended plan).
const phanteraPalette = {
  // Cool neutrals: the "void -> obsidian -> surface" stack
  neutral: {
    void:      '#050508',  // page background (the logo's MARK_DARK)
    obsidian:  '#0B0D13',  // card / surface raised
    surface:   '#11141C',  // surface elevated
    surface2:  '#171B25',  // surface raised 2
    border:    '#1E2330',  // hairline, visible at 1px on the page
    muted:     '#8E94A6',  // text muted: 6.65:1 on void, 5.69:1 on surface2
    muted2:    '#6B7280',  // text muted secondary (slate-500)
    text:      '#F4F4F6',  // text primary (the logo's MARK_LIGHT)
  },

  // Primary brand scale (cyan for Phantera)
  cyan: {
    300:  '#00FFFF',  // bright accent
    400:  '#00D4FF',  // brand primary (DEFAULT)
    500:  '#00AAFF',  // brand secondary
    600:  '#0099CC',  // brand pressed
    700:  '#0077A8',  // brand deep
  },

  // Gold: secondary brand colour (highlights, premium)
  gold: {
    400: '#F0B429',
    500: '#FBBC05',  // Google-yellow
  },

  // Purple: used for "AI / agent" semantic
  purple: {
    400: '#A78BFA',
    500: '#7C3AED',
  },

  // Functional colours
  green: {
    400: '#22C55E',
    500: '#10B981',  // success
    600: '#059669',  // success pressed
  },
  red: {
    400: '#EF4444',  // error / destructive
  },
  orange: {
    400: '#F97316',  // warning
  },
  pink: {
    400: '#EC4899',  // highlight / featured
  },
  blue: {
    500: '#4285F4',  // Google blue
    600: '#0A66C2',  // LinkedIn blue
  },
}

/** Shared shape: a brand palette can't drift structurally. */
export type Palette = typeof phanteraPalette

// Spar-x: editorial light (charter: teal #006D71 from the official logo SVG,
// ivory page, charcoal text; see .war-room/TEAM_MEMORY.md § CHARTE SPAR-X).
// This is an identity TRANSLATION of the dark stack, not a color swap:
// "void" (page) = ivory, "obsidian" (raised card) = off-white, borders warm.
// Functional colours are darkened variants for AA contrast on light ground.
const sparxPalette: Palette = {
  neutral: {
    void:      '#F5F3EE',  // page background (ivory)
    obsidian:  '#FBFFFE',  // card / surface raised (brand off-white)
    surface:   '#EFECE3',  // surface elevated (deeper ivory)
    surface2:  '#E7E3D8',  // surface raised 2
    border:    '#E2DED2',  // border subtle (warm)
    muted:     '#45453F',  // text muted (dark warm gray — founder: readable, not washed)
    muted2:    '#605F57',  // text muted secondary
    text:      '#1A1A1A',  // text primary (charcoal)
  },

  // Primary brand scale (teal: 400 is the exact logo fill)
  cyan: {
    300:  '#0E8A8F',
    400:  '#006D71',
    500:  '#005D61',
    600:  '#004F53',
    700:  '#003B3E',
  },

  // Spar-x design direction (founder rule): SOBER: the brand lives in ONE
  // hue (teal) + charcoal + ivory. Decorative accents that are purple/pink/
  // loud-gold under Phantera collapse into muted teal/bronze tones here so
  // marketing surfaces stay monochrome-premium. Functional status colours
  // (success/error/warning) stay semantic for the dashboard.
  gold: {
    400: '#715F3A',  // muted bronze, AA on ivory for small text
    500: '#665534',
  },

  purple: {
    400: '#33787C',  // "AI" accent — teal-toned, no purple under Spar-x
    500: '#1F6468',
  },

  green: {
    400: '#059669',
    500: '#047857',
    600: '#065F46',
  },
  red: {
    400: '#DC2626',
  },
  orange: {
    400: '#B45309',
  },
  pink: {
    400: '#557F82',  // "highlight" — muted teal-gray, no pink under Spar-x
  },
  blue: {
    500: '#4285F4',
    600: '#0A66C2',
  },
}

export const palette: Palette = IS_SPARX ? sparxPalette : phanteraPalette

// ─── 2. SEMANTIC COLOUR TOKENS ───────────────────────────────────────────────
// What components actually consume. Mapped from the active palette; the few
// literal alpha strings are brand-switched explicitly.

export const color = {
  // Backgrounds
  bg: {
    base:      palette.neutral.void,
    elevated:  palette.neutral.obsidian,
    surface:   palette.neutral.surface,
    surface2:  palette.neutral.surface2,
  },

  // Borders
  border: {
    default: palette.neutral.border,
    strong:  IS_SPARX ? '#D3CEBF' : '#2A2A40',
    accent:  IS_SPARX ? 'rgba(0,109,113,0.25)' : 'rgba(0,212,255,0.20)',
  },

  // Text
  text: {
    primary:   palette.neutral.text,
    secondary: IS_SPARX ? 'rgba(26,26,26,0.75)' : 'rgba(255,255,255,0.70)',
    muted:     palette.neutral.muted,
    muted2:    palette.neutral.muted2,
    accent:    palette.cyan[400],
    inverse:   palette.neutral.void,
  },

  // Brand
  brand: {
    primary:        palette.cyan[400],
    primaryDeep:    palette.cyan[700],
    primaryPressed: palette.cyan[600],
    secondary:      palette.gold[400],
  },

  // State / status
  state: {
    success:     palette.green[500],
    successFg:   palette.green[400],
    warning:     palette.orange[400],
    error:       palette.red[400],
    info:        palette.cyan[400],
    ai:          palette.purple[500],
    aiSoft:      palette.purple[400],
    highlight:   palette.pink[400],
  },

  // Glows (used in box-shadow + radial gradients)
  glow: IS_SPARX
    ? {
        cyan:    'rgba(0,109,113,0.12)',
        gold:    'rgba(181,138,60,0.12)',
        ai:      'rgba(105,65,198,0.10)',
        success: 'rgba(4,120,87,0.12)',
      }
    : {
        cyan:    'rgba(0,212,255,0.15)',
        gold:    'rgba(240,180,41,0.15)',
        ai:      'rgba(124,58,237,0.15)',
        success: 'rgba(16,185,129,0.15)',
      },
} as const

// ─── 3. SPACING SCALE ────────────────────────────────────────────────────────
// 4px grid. Use the named tokens in components instead of raw pixel values.

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const

// ─── 4. TYPOGRAPHY ───────────────────────────────────────────────────────────
// Phantera: geometric display (Syne 600/700) + Inter + JetBrains Mono for
//          data, labels and sequence steps (--font-mono, app/layout.tsx).
// Spar-x:  editorial serif display (--font-serif, loaded in app/layout.tsx),
//          same functional body (Inter) for product legibility.

export const fontFamily = IS_SPARX
  ? {
      display: 'var(--font-serif), Georgia, serif',
      body:    'var(--font-inter), sans-serif',
      brand:   'var(--font-serif), Georgia, serif',
    }
  : {
      display: 'var(--font-syne), sans-serif',
      body:    'var(--font-inter), sans-serif',
      brand:   'var(--font-mono), ui-monospace, monospace',
    }

export const fontSize = {
  '2xs': '0.625rem',  // 10px
  xs:    '0.75rem',   // 12px
  sm:    '0.875rem',  // 14px
  base:  '1rem',      // 16px
  lg:    '1.125rem',  // 18px
  xl:    '1.25rem',   // 20px
  '2xl': '1.5rem',    // 24px
  '3xl': '1.875rem',  // 30px
  '4xl': '2.25rem',   // 36px
  '5xl': '3rem',      // 48px
} as const

export const fontWeight = {
  light:    300,
  regular:  400,
  medium:   500,
  semibold: 600,
  bold:     700,
  black:    900,
} as const

export const letterSpacing = {
  tight:   '-0.02em',
  normal:  '0',
  wide:    '0.05em',
  wider:   '0.10em',
  widest:  '0.20em',
} as const

// ─── 5. RADIUS ───────────────────────────────────────────────────────────────

export const radius = {
  none: '0',
  sm:   '0.375rem',  // 6px
  md:   '0.5rem',    // 8px
  lg:   '0.75rem',   // 12px
  xl:   '1rem',      // 16px
  '2xl': '1.5rem',   // 24px
  full: '9999px',
} as const

// ─── 6. SHADOWS (with glow variants) ─────────────────────────────────────────
// Light mode swaps deep black drops for soft warm elevation.

export const shadow = IS_SPARX
  ? {
      card:        '0 1px 3px rgba(26,26,26,0.08), 0 1px 2px rgba(26,26,26,0.05)',
      cardHover:   '0 20px 50px rgba(26,26,26,0.10), 0 0 0 1px rgba(0,109,113,0.15)',
      glowCyan:    '0 0 40px rgba(0,109,113,0.15)',
      glowCyanSm:  '0 0 20px rgba(0,109,113,0.10)',
      glowGold:    '0 0 40px rgba(181,138,60,0.15)',
      glowAi:      '0 0 32px rgba(105,65,198,0.12)',
      modal:       '0 24px 60px -20px rgba(26,26,26,0.25)',
    }
  : {
      card:        '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
      cardHover:   '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.2)',
      glowCyan:    '0 0 40px rgba(0,212,255,0.2)',
      glowCyanSm:  '0 0 20px rgba(0,212,255,0.15)',
      glowGold:    '0 0 40px rgba(240,180,41,0.2)',
      glowAi:      '0 0 32px rgba(124,58,237,0.18)',
      modal:       '0 24px 60px -20px rgba(0,0,0,0.7)',
    }

// ─── 7. MOTION / ANIMATION ───────────────────────────────────────────────────

export const motion = {
  duration: {
    instant: 0,
    fast:    150,
    base:    250,
    slow:    400,
    slower:  600,
  },
  easing: {
    standard: [0.22, 1, 0.36, 1] as const,   // ease-out-cubic (entrance)
    decel:    [0.0, 0.0, 0.2, 1] as const,   // material decelerate
    accel:    [0.4, 0.0, 1, 1] as const,     // material accelerate
    sharp:    [0.4, 0.0, 0.6, 1] as const,   // material sharp
    /** The one marketing curve (Legends League): reveals, sweeps, UI. */
    signal:   [0.2, 0.7, 0.1, 1] as const,
    spring: {
      damping:   28,
      stiffness: 340,
    },
  },
} as const

// ─── 8. Z-INDEX SCALE ────────────────────────────────────────────────────────

export const zIndex = {
  base:     0,
  raised:   10,
  sticky:   20,
  dropdown: 30,
  topbar:   40,
  drawer:   50,
  modal:    60,
  toast:    70,
  tooltip:  80,
  max:      9999,
} as const

// ─── 9. BREAKPOINTS ──────────────────────────────────────────────────────────

export const breakpoint = {
  xs:   '375px',
  sm:   '640px',
  md:   '768px',
  lg:   '1024px',
  xl:   '1280px',
  '2xl': '1440px',
} as const

// ─── 10. TYPED EXPORT ────────────────────────────────────────────────────────

export const tokens = {
  palette,
  color,
  spacing,
  fontFamily,
  fontSize,
  fontWeight,
  letterSpacing,
  radius,
  shadow,
  motion,
  zIndex,
  breakpoint,
} as const

export type DesignTokens = typeof tokens
