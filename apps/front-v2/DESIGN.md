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
(ratio box + credit). Brand: `components/brand/Logo` (the only place that branches on `brand.key`;
`surface="app"` for the signed-in app's ground, `markOnly` for the emblem alone).

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

## Form, data and state primitives (`components/ui`)

| Primitive | Use |
|---|---|
| `Input` (sm \| md), `Field`, `describedBy` | `Field id label hint error` renders the label, hint and error (role=alert) wired by id; give the control `id`, `aria-invalid` and `aria-describedby={describedBy(id, { hint, error })}`. `controlClass` is the shared control look. |
| `Select` (sm \| md) | Native `<select>` with the control look and a chevron; `wrapperClassName` sizes it. |
| `Textarea` | Same look, vertical resize. |
| `Badge tone live dot` | A status: dot + word. Tones: `accent` machine working, `signal` a person answered, `success`, `warning`, `danger`, `ai`, `neutral`. Status → tone maps live in `lib/app-copy.ts` (e.g. `campaignCard.status`). |
| `Table`, `TableCaption`, `TableHeader`, `TableBody`, `TableRow`, `TableHead numeric`, `TableCell numeric` | Ruled table, mono headers, numbers right-aligned; scrolls sideways on a phone. Always a caption (can be `sr-only`) or `aria-label`. |
| `Dialog open onClose title description closeLabel footer size` | Native `<dialog>` modal (focus trap, Escape, focus return by the browser). **Client only: import from `@/components/ui/dialog`**, never through the barrel. |
| `EmptyState icon title action align` | Nothing yet: what will appear and the one action that fills it. |
| `Skeleton` | Shape of what is coming; the waiting container carries `aria-busy` and a label. |
| `Panel title meta action padded` | The dashboard card: raised surface, mono title (`h2`), quiet meta and an action on the right. |

## The signed-in app (`app/(dashboard)`)

- **Gate**: `app/(dashboard)/layout.tsx` loads `views.dashboardShell` and applies its redirect
  (sign-in, invitation, onboarding) before any page renders; then `AuthProviders` + `AppShell`.
  `/onboarding` lives in `app/(auth)/onboarding` behind `views.onboarding`.
- **Chrome** (`components/app`): `AppShell` (`data-app-shell`, drawer state, Escape, toasts),
  `Sidebar` (nav, live counts `inbox.unreadCount` / `touches.queue`, collapse, workspace switcher,
  free-plan upsell), `Topbar` (menu button, `NotificationBell`, Clerk `UserButton`).
  Nav entries are `NAV_ITEMS` in `lib/app-copy.ts`; active rule `isActivePath`.
- **A screen** = `app/(dashboard)/dashboard/<route>/page.tsx` (server): `loadView('views.<id>', input)`,
  apply its redirect if it has one, render `<AppPage title description actions>` around components
  from `components/dashboard/<screen>/`. Pieces used by several screens go in
  `components/dashboard/shared/` (`CampaignCard`, `InsightsPanel`, `InsightActions`, `SenderPicker`,
  `Drawer`, `LeadDetailDrawer`, `LeadPhoneTouch`, `PhoneRevealButton`, `LeadSearchDrawer`,
  `LeadSearchProgress`, `SequenceTimeline`, `ScoreGauge`, `LeadScoreBadge`, `errors`).
  Add `loading.tsx` with `Skeleton`s in the page's shape; `dashboard/error.tsx` covers errors.
- **Data**: server via `loadView`; client via `api` from `@/lib/front/api` (`api.call(id, input)`,
  `api.url(id, input)` for an EventSource or a link), `useApi()` from `@/lib/front/use-api` for
  `stepUp` endpoints. Never a hand-written `/api/...` string. View types come from the contract
  (`lib/front/types.ts`: add aliases there).
- **Words**: body n°1's exact French strings, one section per screen in `lib/app-copy.ts`.
- **Colour**: tokens only; charts use the theme variables (`rgb(var(--c-cyan))`…). Inside
  `[data-app-shell]` the theme repaints the tokens (Spar-x: dark teal), and `Logo surface="app"`
  picks the logo for that ground.
- **Motion**: no count-up, no layout animation; spinners and pulses stop under reduced motion.

## Analytics and consent

- Body n°1's wiring: `PostHogProvider` + `PostHogPageView` + `CookieConsentBanner` in the root
  layout, `PostHogIdentify` + `SessionRefetch` in `AuthProviders`. Nothing from PostHog is
  downloaded or sent before the visitor accepts (`@/lib/analytics/consent`, key `phantera.consent`,
  12 months); the footer's « Gérer les cookies » reopens the banner. These are the only client
  components the public pages ship, and PostHog itself is a dynamic import.
- Product events go through `track()` from `lib/analytics/events.ts` (body n°1's names and
  properties). No screen defines its own helper.
