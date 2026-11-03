/**
 * /design-system: Visual catalogue of Phantera design tokens.
 *
 * Dev/staging only: gated by middleware (only signed-in users in non-prod).
 * Use this page to:
 *   • Verify any new component pulls from the SSOT
 *   • Spot drift between Tailwind classes and token values
 *   • Onboard designers/devs to the brand system
 */
import {
  palette,
  color,
  spacing,
  fontSize,
  fontWeight,
  radius,
  shadow,
} from '@/lib/design/tokens'

export const metadata = {
  title:  'Design System',
  robots: { index: false, follow: false },
}

// ─── Reusable rows ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="font-display text-2xl font-bold text-white mb-2">{title}</h2>
      <div className="h-px bg-gradient-to-r from-cyan/40 via-cyan/10 to-transparent mb-6" />
      {children}
    </section>
  )
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-obsidian p-4">
      <div
        className="h-16 w-full rounded-lg border border-white/[0.05]"
        style={{ background: value }}
      />
      <p className="mt-3 text-xs font-semibold text-white">{name}</p>
      <p className="font-mono text-[10px] text-muted">{value}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-void px-6 py-16 text-white">
      <div className="mx-auto max-w-6xl">

        <header className="mb-16">
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan/60">
            Source of truth · lib/design/tokens.ts
          </span>
          <h1 className="mt-3 font-display text-5xl font-black tracking-tight">
            Design System
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Every visual constant in Phantera. Components must reference these
            tokens via Tailwind utility classes: never paste raw hex values.
          </p>
        </header>

        {/* ── Brand colours ───────────────────────────────────────────────── */}
        <Section title="Brand · Cyan scale">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {Object.entries(palette.cyan).map(([k, v]) => (
              <Swatch key={k} name={`cyan.${k}`} value={v} />
            ))}
          </div>
        </Section>

        <Section title="Brand · Gold">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {Object.entries(palette.gold).map(([k, v]) => (
              <Swatch key={k} name={`gold.${k}`} value={v} />
            ))}
          </div>
        </Section>

        {/* ── Neutrals ────────────────────────────────────────────────────── */}
        <Section title="Surfaces & Neutrals">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Swatch name="void"     value={palette.neutral.void} />
            <Swatch name="obsidian" value={palette.neutral.obsidian} />
            <Swatch name="surface"  value={palette.neutral.surface} />
            <Swatch name="surface2" value={palette.neutral.surface2} />
            <Swatch name="border"   value={palette.neutral.border} />
            <Swatch name="muted"    value={palette.neutral.muted} />
            <Swatch name="muted2"   value={palette.neutral.muted2} />
            <Swatch name="text"     value={palette.neutral.text} />
          </div>
        </Section>

        {/* ── State / status colours ─────────────────────────────────────── */}
        <Section title="State · Functional colours">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Swatch name="success"   value={color.state.success} />
            <Swatch name="successFg" value={color.state.successFg} />
            <Swatch name="warning"   value={color.state.warning} />
            <Swatch name="error"     value={color.state.error} />
            <Swatch name="ai"        value={color.state.ai} />
            <Swatch name="aiSoft"    value={color.state.aiSoft} />
            <Swatch name="highlight" value={color.state.highlight} />
            <Swatch name="info"      value={color.state.info} />
          </div>
        </Section>

        {/* ── Typography ─────────────────────────────────────────────────── */}
        <Section title="Typography · Font sizes">
          <div className="space-y-3 rounded-xl border border-border/60 bg-obsidian p-6">
            {Object.entries(fontSize).map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-4">
                <span className="w-16 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {k}
                </span>
                <span style={{ fontSize: v as string }} className="text-white">
                  Lead generation, reinvented.
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted/60">{v as string}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography · Font weights">
          <div className="space-y-2 rounded-xl border border-border/60 bg-obsidian p-6">
            {Object.entries(fontWeight).map(([k, v]) => (
              <p key={k} style={{ fontWeight: v }} className="text-lg text-white">
                <span className="mr-4 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {k}
                </span>
                The future of B2B prospection ({v})
              </p>
            ))}
          </div>
        </Section>

        {/* ── Spacing ───────────────────────────────────────────────────── */}
        <Section title="Spacing scale">
          <div className="space-y-2 rounded-xl border border-border/60 bg-obsidian p-6">
            {Object.entries(spacing).map(([k, v]) => (
              <div key={k} className="flex items-center gap-4">
                <span className="w-12 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {k}
                </span>
                <div
                  className="h-3 rounded-sm bg-gradient-to-r from-cyan to-cyan/40"
                  style={{ width: `${v}px` }}
                />
                <span className="font-mono text-[10px] text-muted/60">{v}px</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Radius ────────────────────────────────────────────────────── */}
        <Section title="Border radius">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(radius).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border/60 bg-obsidian p-4">
                <div
                  className="h-20 w-full border-2 border-cyan bg-cyan/10"
                  style={{ borderRadius: typeof v === 'number' ? `${v}px` : v }}
                />
                <p className="mt-3 text-xs font-semibold text-white">radius.{k}</p>
                <p className="font-mono text-[10px] text-muted">{String(v)}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Shadows ───────────────────────────────────────────────────── */}
        <Section title="Shadows & Glows">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Object.entries(shadow).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border/60 bg-obsidian p-6">
                <div
                  className="h-20 w-full rounded-lg bg-surface"
                  style={{ boxShadow: v }}
                />
                <p className="mt-4 text-xs font-semibold text-white">shadow.{k}</p>
                <p className="break-all font-mono text-[10px] text-muted">{v}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Usage guidance ───────────────────────────────────────────── */}
        <Section title="Anti-patterns to avoid">
          <div className="rounded-xl border border-danger/20 bg-danger/5 p-6 space-y-2 text-sm">
            <p className="text-danger font-semibold">Never do this:</p>
            <ul className="list-disc pl-6 text-white/70 space-y-1">
              <li>
                <code className="font-mono text-xs text-danger">style={'{{ background: \'var(--brand-primary)\' }}'}</code>
                {' -> use '}
                <code className="font-mono text-xs text-success">className="bg-cyan"</code>
                {' or import from tokens.ts'}
              </li>
              <li>
                <code className="font-mono text-xs text-danger">border-[#1A1A2A]</code>
                {' -> use '}
                <code className="font-mono text-xs text-success">border-border</code>
              </li>
              <li>
                <code className="font-mono text-xs text-danger">text-[#8888A0]</code>
                {' -> use '}
                <code className="font-mono text-xs text-success">text-muted</code>
              </li>
              <li>
                Inventing new shades without adding them to <code className="font-mono text-xs">tokens.ts</code> first
              </li>
            </ul>
          </div>
        </Section>

      </div>
    </main>
  )
}
