# Spruce Design System — Japandi-Bento

This is the visual reference for Spruce. "Japandi" describes the palette and
restraint — warm neutrals, natural materials feel, one confident accent used
sparingly, generous whitespace. "Bento" describes the layout pattern — content
lives in self-contained, rounded, modular card containers, like compartments
in a bento box, rather than dividers and rules.

New UI should match this system. If you're adding a surface that doesn't fit
a pattern below, extend the system deliberately and update this doc, rather
than improvising a one-off.

## Color tokens

Defined in `src/app/globals.css` under `:root` / `@theme inline`, available
as Tailwind utilities (`bg-brand-primary`, `text-brand-accent`, etc.).

| Token | Hex | Tailwind utility | Usage |
|---|---|---|---|
| `--brand-primary` | `#0B2B22` (Deep Forest Emerald) | `bg-brand-primary`, `text-brand-primary` | Primary CTAs, active nav state, headline emphasis. The "confident" color — used deliberately, not as a background fill for large areas. |
| `--brand-accent` | `#D97706` (Warm Amber) | `bg-brand-accent`, `text-brand-accent` | Highlights, focus rings, one accent word in a headline, primary badge tint. |
| `--brand-sage` | `#A3B19B` (Sage) | `bg-brand-sage` (as a `/20`–`/25` opacity wash) | Secondary badge/icon-well *background* tint — alternates with amber so two adjacent badges/icons aren't identical. Sage is too light and low-contrast to use as `text-brand-sage`/icon-foreground color on its own; pair a sage background wash with a `text-brand-primary` (or `dark:text-emerald-400`) foreground instead. Never used for primary CTAs. |
| `--brand-background` | `#FAF8F5` (Warm Linen/Cream) | `bg-brand-background` | Page canvas. Not pure white — this is what makes the palette feel warm rather than clinical. |
| `--brand-surface` | `#FFFFFF` | `bg-brand-surface` | Card/container fill, sitting on top of the canvas so cards read as distinct "bento compartments." |

Card borders use Tailwind's `stone` family directly (see Cards below), not a
custom token — `stone-200` is warmer than `slate-200` and reads as part of
the same neutral family as the linen canvas.

Dark mode keeps the existing `slate`-based dark surfaces (`dark:bg-slate-900`
/ `dark:bg-slate-950`) — the Japandi palette is a light-mode identity; dark
mode's job is contrast and legibility, not matching the linen tone.

## Typography

Font family is Geist Sans (already wired via `next/font` in `layout.tsx`) —
clean, geometric, no pairing needed. Hierarchy comes from weight and size
contrast, not multiple typefaces:

| Role | Treatment |
|---|---|
| Hero / page H1 | `text-4xl` to `text-6xl`, `font-bold`, near-black (`text-slate-900` / `dark:text-slate-100`) |
| Section H2 | `text-2xl` to `text-3xl`, `font-bold` |
| Card title | `text-lg`, `font-semibold` |
| Body / subhead | `text-base` to `text-lg`, regular weight, muted (`text-slate-600` / `dark:text-slate-400`) — deliberately lower contrast than headers so the eye lands on headlines first |
| Caption / badge text | `text-xs` to `text-[11px]`, `font-medium` |

Headers should feel notably heavier and darker than the body text beneath
them — that jump in weight/color is what reads as "high-trust" rather than
flat.

## Cards ("Bento" containers)

The one pattern every card-like surface should share:

```
rounded-2xl border border-stone-200 dark:border-stone-800
bg-white dark:bg-slate-900
shadow-sm
```

Interactive/clickable cards add a hover state:

```
transition-all hover:shadow-lg hover:-translate-y-0.5
```

Non-interactive cards (stat tiles, static info panels) keep the resting
`shadow-sm` without the hover lift.

Corner radius is always `rounded-2xl` for a card-level container. Smaller
elements nested inside a card (pills, badges, buttons) use smaller radii
(`rounded-full` for pills/badges, `rounded-lg` or `rounded-xl` for buttons).

## Spacing

Generous internal padding is part of the "high-trust" feel — don't crowd a
bento card. Baseline: `p-5` to `p-6` for a card's outer padding, `gap-4` to
`gap-6` between cards in a grid, `py-8`+ between major page sections.

## Where this applies today

- **Navigation** (`WorkspaceHeader.tsx`, `SiteHeader.tsx`): brand-primary for
  active tab state, brand-accent for focus rings. Header chrome itself
  (the header bar's own border, the tab-bar pill) is not a "card" and keeps
  neutral slate — the stone/card treatment is reserved for actual content
  cards, not app chrome.
- **Service cards** (`ListingCard.tsx` on `/browse`, `ProviderDashboard.tsx`'s
  listing and stat cards on `/provider`): the card pattern above.
- **Matching Chatbot** (`MatchingChatbot.tsx`): its main panel, provider
  match result cards, and booking confirmation modal follow the card
  pattern. Small functional/status colors inside it (a success checkmark, a
  rating badge) are semantic, not brand identity, and are left alone.
- **Landing page** (`page.tsx`): linen canvas, emerald headline with one
  amber-highlighted word, and a bento feature grid using the card pattern
  with amber/sage-alternating icon tints.
