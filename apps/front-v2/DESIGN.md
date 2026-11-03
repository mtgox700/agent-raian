# Body n°2 design system

## Concept: « Arrêt net »

Phantera's promise is in its own content: *a sequence that knows when to go silent*
(`landing.howItWorks.titleLines`, the "Arrêt net" fact, the logo's short third stroke).
The whole body is drawn from that one idea:

- **The sequence line** (`StopShort`): two long strokes, a short one, the point. It opens the
  landing (drawn once), sits beside the auth form, and closes the page (still).
- **The page is a sequence**: sections are numbered steps (`Eyebrow index`), the relay of
  five agents is a rail that ends on the agent that listens (accent point), and nothing follows it.
- **Silence is a material**: generous empty space after the point; one accent per view.

## Principles

1. Words come from content (`lib/content.ts` → `@phantera/content`). Components hold no copy.
2. Colours come from the brand theme only. Never a hex, never `white`/`black`: use the tokens.
3. Server Components first. The landing ships no client component; pricing and FAQ work
   with native radios and `<details>`. Readable and usable without JavaScript.
4. Reality Lock: no invented figure, testimonial or logo. Images are real captures or
   credited photographs (`CREDITS.md`).
5. A link appears only when its page exists in body n°2 (`isBuilt` in `lib/content.ts`).

## Tokens (tailwind.config.ts → app/themes.generated.css)

| Token | Use |
|---|---|
| `canvas` | page ground |
| `raised`, `surface`, `surface-2` | panels, selected states |
| `line` | every hairline and border (ruled grids use `gap-px bg-line`) |
| `ink` / `quiet` | text / secondary text |
| `accent` (`strong`, `soft`) | the point, the one primary action, links on hover |
| `signal` | recommended plan, savings |
| `success`, `warning`, `danger`, `ai` | states (dashboard) |

Type: `font-display` (Syne; Playfair under `data-brand='sparx'` via `--font-display`),
`font-sans` (Inter, body), `font-mono` (JetBrains Mono, the instrument voice: labels, numbers).
Widths: `max-w-page` (76rem column), `max-w-prose` (38rem reading). Easing: `ease-signal`.

## Primitives (`components/ui`)

`Button`/`buttonVariants` (primary | outline | ghost; sm | md | lg), `Container`, `Eyebrow`
(mono label, optional step number), `Heading` (hero | section | card; level independent of size),
`Section` (numbered, titled, labelled by its title), `StopShort` (the signature), `Photo`
(ratio box + credit). Brand: `components/brand/Logo` (the only place that branches on `brand.key`).

## Motion

- Only the signature moves: the sequence draws once on load (strokes 900 ms, staggered 180 ms,
  then the point lands and rings once). UI transitions are 200 ms, colour/transform only.
- Transform and opacity only, no layout animation, no scroll listeners, no animation library
  on public pages (framer-motion and gsap stay out of the landing bundle).
- Everything sits inside `@media (prefers-reduced-motion: no-preference)`: with reduced motion
  the final state is shown immediately. Without CSS animation support nothing is hidden.

## Budgets

Lighthouse performance ≥ 0.95, accessibility / best practices / SEO = 1, CLS ≤ 0.05.
Images carry width/height or a ratio box; the LCP (hero headline) is text, painted by the
server HTML. Focus is always visible (`:focus-visible` accent outline); skip link first.

## For the dashboard

Reuse the tokens and primitives; the theme's `[data-app-shell]` variables repaint the app
area per brand. Add primitives here (inputs, table, badge, dialog) rather than in screens.
