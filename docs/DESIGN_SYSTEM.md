# 🎨 Phantera Design System

> Single source of truth: `apps/web/lib/design/tokens.ts`
> Live catalogue (dev only): http://localhost:3000/design-system

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│   apps/web/lib/design/tokens.ts                          │
│   ├─ palette  (raw colours, never used in components)    │
│   ├─ color    (semantic mappings — what components use)  │
│   ├─ spacing  fontSize  fontWeight  letterSpacing        │
│   ├─ radius   shadow    motion       zIndex              │
│   └─ breakpoint                                          │
└────────────────────────┬─────────────────────────────────┘
                         │ imports
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌───────────────────┐         ┌──────────────────────┐
│ tailwind.config   │         │ /design-system       │
│ (utility classes) │         │ (visual catalogue)   │
└───────────────────┘         └──────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────┐
│  React components — consume via className="bg-cyan"  │
│  OR import { color } from '@/lib/design/tokens' for  │
│  runtime animation values.                           │
└──────────────────────────────────────────────────────┘
```

---

## How to use tokens in components

### ✅ Via Tailwind utility classes (preferred)

```tsx
<div className="bg-obsidian text-white border border-border rounded-lg p-4">
  <h2 className="font-display text-xl font-bold text-cyan">
    Phantera
  </h2>
</div>
```

### ✅ Via direct import (when runtime value needed)

```tsx
import { motion } from 'framer-motion'
import { color, motion as m } from '@/lib/design/tokens'

<motion.div
  animate={{ backgroundColor: color.brand.primary }}
  transition={{ duration: m.duration.base / 1000, ease: m.easing.standard }}
/>
```

### ❌ Never paste raw hex

```tsx
// DON'T — hard to maintain, breaks design consistency
<div style={{ background: '#00D4FF', color: '#FFFFFF' }} />

// DO — single source of truth
<div className="bg-cyan text-white" />
```

---

## Token reference

### Brand colours

| Token | Hex | Usage |
|-------|-----|-------|
| `cyan` / `cyan.400` | `#00D4FF` | Primary brand · CTAs · accents |
| `cyan.deep` / `cyan.700` | `#0077A8` | Brand deep · borders |
| `gold` | `#F0B429` | Secondary brand · premium tier highlight |

### Surfaces

| Token | Hex | Usage |
|-------|-----|-------|
| `void` | `#050508` | Page background |
| `obsidian` | `#0A0A14` | Card / surface raised |
| `surface` | `#111120` | Surface elevated |
| `surface-2` | `#16162A` | Surface raised 2 |
| `border` | `#1A1A2A` | Default border |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `white` | `#FFFFFF` | Primary text |
| `white/70` | rgba | Secondary text |
| `muted` | `#8888A0` | Muted text |

### State

| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#10B981` | Positive actions, conversions |
| `success.fg` | `#22C55E` | Success badges, foreground |
| `warning` | `#F97316` | Warnings, attention |
| `danger` | `#EF4444` | Errors, destructive actions |
| `ai` | `#7C3AED` | AI / Agent actions |
| `highlight` | `#EC4899` | Featured items, hot leads |

---

## Typography

```
Display  · Syne     · headings, hero, brand
Body     · Inter    · paragraphs, UI labels
Brand    · Orbitron · brand mark, mono displays
```

Font sizes: `2xs` (10px) -> `5xl` (48px), 4px base scale.
Weights: `light` (300) -> `black` (900).

---

## Spacing

4px grid. Use Tailwind utilities (`p-4`, `gap-3`, etc.): they map onto this scale automatically.

```
xs (4) · sm (8) · md (12) · lg (16) · xl (24) · 2xl (32) · 3xl (48) · 4xl (64)
```

---

## Motion

```typescript
duration.fast     150ms   → hover states, micro-feedback
duration.base     250ms   → standard transitions
duration.slow     400ms   → modals, drawers
duration.slower   600ms   → page transitions, hero animations

easing.standard   [0.22, 1, 0.36, 1]   → entrance (ease-out-cubic)
easing.spring     damping 28, stiffness 340 → drawer slide-in
```

---

## Migration guide (from raw hex)

Run this audit to find raw hex usage in components:

```bash
cd apps/web
grep -rohE "#[0-9a-fA-F]{3,8}" --include="*.tsx" components | sort | uniq -c | sort -rn
```

Top offenders today (May 31, 2026):

| Hex | Count | Replace with |
|-----|------:|--------------|
| `#00D4FF` | 103× | `bg-cyan` / `text-cyan` / `color.brand.primary` |
| `#F0B429` | 58× | `bg-gold` / `text-gold` |
| `#10B981` | 44× | `bg-success` / `text-success` |
| `#7C3AED` | 35× | `bg-ai` / `text-ai` |
| `#6B7280` | 32× | `text-muted2` (via `lib/design/tokens`: add Tailwind alias) |

Replace progressively when touching a file: never do a giant find/replace PR.

---

## Adding a new token

1. Edit `lib/design/tokens.ts`: add the value to the right scale (`palette` for raw, `color.xxx` for semantic).
2. If it's a colour and you want a Tailwind utility, add it to `tailwind.config.ts` `theme.extend.colors`.
3. Add a visual entry to `app/(dev)/design-system/page.tsx`.
4. Document the use case here in `docs/DESIGN_SYSTEM.md`.

**Never** add a colour to Tailwind that isn't first declared in `tokens.ts`.

---

## Anti-patterns to avoid

❌ `style={{ background: '#00D4FF' }}`
❌ `className="border-[#1A1A2A]"`
❌ `text-[#8888A0]`
❌ Inventing new colours without adding them to `tokens.ts` first
❌ Duplicating shadow definitions inline

✅ `className="bg-cyan border-border text-muted"`
✅ `import { color } from '@/lib/design/tokens'` for runtime values
✅ Every new colour goes through tokens.ts first
