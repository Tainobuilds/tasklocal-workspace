# Spruce Design System — Japandi-Bento

This is the visual reference for Spruce. "Japandi" describes the palette and
restraint — warm neutrals, natural materials feel, one confident accent used
sparingly, generous whitespace. "Bento" describes the layout pattern — content
lives in self-contained, rounded, modular card containers, like compartments
in a bento box, rather than dividers and rules.

As of 2026-08-26 the exact tokens, logo, and Provider Dashboard component
specimens are sourced from an exported design file ("Spruce Design System.dc.html"
/ "Provider Dashboard.dc.html", packaged as `Spruce dashboard and design
system.zip` in the project root — not committed to git, it's a design-tool
export, not source code). Where this doc gives a hex value, that value is
authoritative; don't approximate it with a nearby Tailwind gray/green.

New UI should match this system. If you're adding a surface that doesn't fit
a pattern below, extend the system deliberately and update this doc, rather
than improvising a one-off.

## Brand mark — "Bough"

`src/components/SpruceLogo.tsx`. Two open chevrons ("boughs") under a solid
amber crown. The crown is the only amber in the mark — never tint the boughs.
Round joins throughout.

- `variant="default"` — amber crown, boughs in `currentColor` (driven by
  `textClassName`, default `text-brand-primary dark:text-emerald-400`). Use
  on light/linen backgrounds.
- `variant="reversed"` — amber crown stays, boughs become `--brand-background`
  (linen). Use on `brand-primary`/dark-emerald backgrounds — the crown is the
  one element that still carries at small sizes on emerald.
- `variant="small"` — single-bough glyph, thicker stroke. Below ~24px the two
  boughs visually merge, so use this instead of scaling the master down.

The source design system has no dark-mode variants at all (see below) — the
`dark:` color on the default variant's boughs is our own addition for
legibility, not part of the spec.

## Color tokens

Defined in `src/app/globals.css` under `:root` / `@theme inline`, available
as Tailwind utilities (`bg-brand-primary`, `text-brand-accent`, etc.).

| Token | Hex | Usage |
|---|---|---|
| `--brand-primary` | `#0B2B22` (Deep Forest Emerald) | Primary CTAs, active nav/segmented state, headline emphasis, card title/price text. |
| `--brand-primary-hover` | `#071F18` | Hover state for solid `brand-primary` buttons. |
| `--brand-accent` | `#D97706` (Warm Amber) | Focus rings, one accent word in a headline, Average-Hourly-Rate icon. |
| `--brand-sage` | `#A3B19B` (Sage) | Kicker/eyebrow text color, and as a `/20` background wash for the Active-Services icon well. Too low-contrast for icon/text foreground on its own. |
| `--brand-background` | `#FAF8F5` (Warm Linen/Cream) | Page canvas. |
| `--brand-surface` | `#FFFFFF` | Card/container fill. |
| `--brand-soft` | `#F4F1EA` | Pill tracks (segmented controls, filter tabs), tags, form inputs, dashed CTA background. |
| `--brand-slate` | `#78716C` | Kicker/caption text, secondary micro-context lines. |
| `--brand-ink-muted` | `#57534E` | Body copy, category tag text, the "Completed" status pill's text — a touch darker/higher-contrast than `--brand-slate`. |
| `--brand-line` | `#E7E5E4` | Borders — every card, pill track, and divider. |
| `--brand-amber-tint` | `#FBF0E0` | "Flagged" badge background, Average-Hourly-Rate icon well. |

Two colored shadows (tinted with the forest emerald, not neutral gray):
`shadow-spruce-sm` = `0 1px 2px rgba(11,43,34,.05)` (resting), `shadow-spruce-md`
= `0 6px 18px rgba(11,43,34,.09)` (hover/elevated).

**Status pill colors** are semantic, not reusable brand tokens — defined as
literal hex/arbitrary-value classes at their call sites (`ProviderDashboard.tsx`),
not in `globals.css`:

| Status | Background | Text | Border |
|---|---|---|---|
| Confirmed | `#E8EFEA` | `--brand-primary` | `#CFE0D5` |
| Completed | `--brand-soft` | `--brand-ink-muted` | `--brand-line` |
| Cancelled | `#FBEFEC` | `#9A3412` | `#F3D9CE` |
| Flagged | `--brand-amber-tint` | `#B45309` | `#F3DFBE` |

Dark mode has no equivalents in the source design system (see Typography) —
the `dark:` variants throughout are our own choices for contrast/legibility,
generally staying in the existing `slate`/`emerald`/`red` Tailwind families
rather than trying to invent "dark Japandi" tokens that don't exist upstream.

## Typography

Two typefaces, per the exported design system:

- **Plus Jakarta Sans** (`font-display` utility, weights 500–800) — headlines,
  card titles, metric numbers, section headings. Wired via `next/font/google`
  in `layout.tsx` as `--font-plus-jakarta-sans`.
- **Inter** — body copy, labels, buttons. We use Geist Sans (`font-sans`,
  already wired) as the practical equivalent rather than adding a third font
  family; visually near-identical for UI text at this weight range.
- **JetBrains Mono** (`font-token-mono`) — only for the design system's own
  token-label captions (hex swatches, spec sheets). Not used in product UI.

Scale (from the spec):

| Role | Treatment |
|---|---|
| Page H1 | `font-display font-extrabold text-4xl` (dashboard) up to `text-5xl`/`text-6xl` (landing hero) |
| Section H2 | `font-display font-extrabold text-[22px]` |
| Metric number | `font-display font-extrabold text-[34px]` |
| Card title | `font-display font-bold text-[17px]` |
| Kicker/eyebrow | `text-[11.5px] font-semibold tracking-[0.1em] uppercase text-brand-sage` |
| Body / micro-context | Geist Sans, `text-brand-ink-muted` (body) or `text-brand-slate` (lighter captions) |

The source design system is light-mode only — every value in it is a flat
hex, no `dark:` variants anywhere. Keeping dark mode (a deliberate choice,
not an oversight) means every exact-token color needs its own sensible dark
pairing invented on our end; when in doubt, match the existing `slate-900`/
`slate-800` dark surface convention already used across the app.

## Cards ("Bento" containers)

```
rounded-2xl border border-brand-line dark:border-stone-800
bg-white dark:bg-slate-900
shadow-spruce-sm
```

Interactive/clickable cards add:

```
transition-all hover:shadow-spruce-md hover:-translate-y-0.5
```

Corner radius is `rounded-2xl` (16px) for card-level containers, `rounded-xl`
(12px) for elements nested inside a card that still need a radius of their
own (icon wells). Pills/badges/segmented controls are always `rounded-full`.

## Segmented controls

Two places use the same pattern: the workspace mode-switcher (header) and
the per-listing Active/Paused control (`ProviderDashboard.tsx`).

```
bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700
p-1 rounded-full
```

Each segment is its own button; the selected segment gets a solid
`bg-brand-primary text-white` treatment (mode-switcher) or, for the
Active/Paused pair specifically, the two segments are asymmetric — "Active"
selected = solid `brand-primary`; "Paused" selected = white with
`shadow-spruce-sm`, `text-brand-primary`. Unselected segments are
transparent with `text-brand-slate`.

## Spacing

Baseline: `p-5` for a card's outer padding, `gap-4` between cards in a grid,
`py-8`+ between major page sections (`mt-12` before Recent Customer
Bookings specifically, per the spec).

## Where this applies today

- **Provider Dashboard** (`ProviderDashboard.tsx`, `/provider`): fully
  exact-token-matched — metric cards, the dashed "Create New Listing" tile,
  listing cards (title/price/category/flagged-badge/segmented Active-Paused
  control), and the Recent Customer Bookings filter tabs + table-row list.
- **Workspace header** (`WorkspaceHeader.tsx`): exact-token-matched — Bough
  logo, compact right-aligned segmented mode-switcher, exact shadows/spacing.
  `SiteHeader.tsx` (the dark-themed header on `/bookings`, `/login`, listing/
  provider detail pages) got the Bough logo swap only; its own chrome colors
  are unchanged.
- **Not yet exact-token-matched**: `ListingCard.tsx` on `/browse`,
  `MatchingChatbot.tsx`, and the landing page (`page.tsx`) still use the
  earlier approximate Japandi-Bento palette (`stone-*` borders, `shadow-sm`/
  `shadow-lg`, emerald-600 price text) from before the exact tokens existed.
  They're visually close but not pixel-identical to the spec — bring them in
  line with the tables above when next touched, rather than leaving two
  slightly-different "Spruce" looks live indefinitely.
