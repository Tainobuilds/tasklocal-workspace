# Unified Workspace Header, Theme System, and Real-Time Listing Sync

Status: Approved, ready for implementation plan.

## Goal

Provider App, Matching Chatbot, and Customer Browse (`/browse`) currently look
and behave like three disconnected apps: different headers, incompatible
hardcoded themes (light vs. dark), and no way for a listing created in the
Provider App to ever reach Browse or the Chatbot without a manual data fix.
This unifies all three into one consistent, live-synced workspace.

## Non-goals

- `bookings`, `login`, listing detail (`/listings/[id]`), provider detail
  (`/providers/[id]`) keep their current `SiteHeader` and dark-only styling,
  untouched.
- The internal Trust & Safety console keeps its own separate header/theme by
  design (kanubow's existing comment marks this as deliberate) — not touched.
- No new real-time push infrastructure (SSE/WebSocket). Sync is polling,
  matching the pattern already used by the Provider workspace.

## Architecture

**`src/components/WorkspaceHeader.tsx`** (new, client component) — the single
header for all three views, used identically on `page.tsx` (Provider +
Chatbot tabs) and `browse/page.tsx`. Same component, same layout, same
right-side controls everywhere — nothing conditionally hidden between views.

**Theme system** — `next-themes` (new dependency) provides the toggle:
- `ThemeProvider` wraps `<body>` in `src/app/layout.tsx`, `attribute="class"`,
  `defaultTheme="light"`, `enableSystem={false}`.
- `globals.css` gains `@custom-variant dark (&:where(.dark, .dark *));` so
  Tailwind's `dark:` variant responds to the `.dark` class `next-themes` sets
  on `<html>`, instead of only OS preference (there is currently zero
  dark-mode infrastructure anywhere in this codebase).
- `next-themes` handles the no-flash-of-wrong-theme problem itself (inline
  blocking script before hydration) — no custom script needed.
- Persistence is `next-themes`' own `localStorage` key, automatic.

**`src/app/api/catalogue/route.ts`** (new) — `GET` wrapping kanubow's existing
`getCatalogue()`, returning the same validated, active-only, deduplicated
listings Browse already renders server-side. This is the client-pollable
version of data Browse currently only fetches once per server render.

## Components

### `WorkspaceHeader.tsx`

```
interface Props {
  active: 'provider' | 'chatbot' | 'customer';
  onSelectWorkspaceTab?: (tab: 'provider' | 'chatbot') => void; // page.tsx passes this; browse doesn't
  bookingsBadgeCount: number;
  onOpenBookings?: () => void;   // Provider/Chatbot: opens the local ledger drawer
  bookingsHref?: string;         // Browse: links to /bookings instead
}
```

Renders, identically on every view: logo, the three tabs (Provider App /
Matching Chatbot / Customer App — `Link`s when not `onSelectWorkspaceTab`,
buttons when it's provided, mirroring the pattern `SiteHeader` already uses),
a theme toggle button (sun/moon icon, `useTheme()` from `next-themes`), and
an "Activity & Bookings" button with a count badge.

The Activity & Bookings button always renders in the same place with the
same look. Its behavior is contextual, per the approved tweak:
- On Provider/Chatbot: `onOpenBookings` is passed, opens the existing
  localStorage-backed ledger drawer (unchanged behavior, just now triggered
  from the shared header instead of `page.tsx`'s inline one).
- On Browse: `bookingsHref="/bookings"` is passed instead, so the button
  navigates to the customer's real server-side bookings page. This is a
  different booking system from the ledger drawer (localStorage demo ledger
  vs. real per-customer bookings in `data/bookings.json`) — the button looks
  identical, but correctly routes to whichever system the current view owns,
  rather than showing the wrong one or being hidden.
- The badge count for Browse comes from `getCustomerBookings(customer.id)`
  (already exists in `server-data.ts`), fetched server-side in
  `browse/page.tsx` alongside the existing `getCatalogue()` /
  `getSessionCustomer()` calls, and passed down as `bookingsBadgeCount`. If
  no customer is signed in, this is `0` and the button still links to
  `/bookings` (which already handles the signed-out case).

`page.tsx` deletes its inline `<header>` block and the drawer-trigger button
that lived inside it, replacing both with `<WorkspaceHeader active={...}
onSelectWorkspaceTab={setActiveTab} bookingsBadgeCount={bookings.length}
onOpenBookings={() => setIsBookingsDrawerOpen(true)} />`. The drawer itself
(the sliding panel) stays in `page.tsx` — only the trigger moves into the
shared header.

`browse/page.tsx` replaces `<SiteHeader active="customer" />` with
`<WorkspaceHeader active="customer" bookingsBadgeCount={...}
bookingsHref="/bookings" />`.

### Dark-mode class pass

No new theme-selection logic inside individual components — each just gains
the complementary palette as `dark:`-prefixed classes alongside what it
already has:

- `page.tsx`, `ProviderDashboard.tsx`, `MatchingChatbot.tsx` — currently
  light-only (`bg-slate-50`, `bg-white`, `text-slate-900`, etc.) — add
  `dark:bg-slate-900 dark:text-slate-100` and matching dark variants for
  cards, borders, and secondary text throughout.
- `browse/page.tsx`, `CustomerApp.tsx`, `FilterBar.tsx`, `ListingCard.tsx` —
  currently dark-only (`bg-slate-950`, `text-slate-100`) — their current look
  becomes the `dark:` variant, and a light-mode base (matching the Provider
  side's palette: `bg-white`/`bg-slate-50`, `text-slate-900`) is added.
- Teal (`bg-teal-600` / `text-teal-600` family) stays the one accent color in
  both themes, everywhere — no per-theme accent swap.
- `globals.css`'s existing animation utilities (confetti, glow-badge, range
  slider) are color-neutral enough to leave as-is; not touched.

## Data flow / real-time sync

| View | Data source | Refresh |
|---|---|---|
| Provider Dashboard | `/api/listings` (all statuses, sanitized — existing, unchanged) | 10s poll (existing) |
| Matching Chatbot | **`/api/catalogue`** (active-only — changed from `/api/listings`) | 10s poll (new) |
| Browse | **`/api/catalogue`** via client poll layered on existing server render | 10s poll (new) |

Switching the Chatbot from `/api/listings` to `/api/catalogue` is a small,
deliberate behavior change: today it can technically surface a flagged or
removed listing to a customer mid-conversation; after this change it can't,
matching Browse. This is a bug fix riding along with the sync work, not
scope creep — a customer-facing surface should not be able to recommend a
listing the trust & safety flow has already flagged.

### Required fix: creating a listing must actually reach the catalogue

Traced end-to-end, a listing created via the Provider Dashboard's "New
Listing" form currently **cannot** pass `sanitizeListings()`'s validation,
for three independent reasons: it's built with an `id` field instead of the
`listing_id` the validator requires, a free-text `category` instead of a
`service_type` constrained to the exact enum `['cleaning', 'handyman',
'moving']`, and no `listing_status` at all (validator requires exactly
`'active'`). Polling alone does not fix this — the record is silently
dropped by validation regardless of how fast it's fetched.

Fix, in `ProviderDashboard.tsx`'s create-listing form and `page.tsx`'s
`createListing`:
- The Category field becomes a `<select>` constrained to the three valid
  `SERVICE_TYPES` values (was free text).
- The POST payload is corrected to send `listing_id` (not `id`),
  `service_type` (not `category`), and `listing_status: 'active'`.

This is a required fix for bullet 3 of the request to be possible at all,
not an optional nice-to-have.

## Error handling

- `/api/catalogue` mirrors `getCatalogue()`'s own failure mode: an
  unreadable/corrupt data file yields `{ listings: [] }` rather than a 500,
  same as the existing `/api/listings` behavior.
- Polling failures (network blip) in Browse/Chatbot log to console and keep
  the last-known listings rather than clearing the view — same defensive
  pattern already used by `page.tsx`'s existing poll loop.
- `next-themes` handles the case where `localStorage` is unavailable
  (private browsing, etc.) by falling back to `defaultTheme` — no custom
  handling needed.

## Testing / verification plan

- `next build` must stay clean across all routes.
- Manually verify in the browser: header is pixel-for-pixel identical (same
  component instance) across Provider, Chatbot, and Browse; toggling theme
  on one view and navigating to another preserves the choice; toggling
  affects Provider Dashboard, Chatbot, and Browse consistently with teal as
  the accent in both modes.
- Create a listing in the Provider Dashboard, confirm it appears in Browse
  and is matchable in the Chatbot within one poll cycle (≤10s), without a
  manual page reload.
- Confirm a flagged/removed listing (the existing test fixtures already in
  `data/listings.json`) still shows with a status badge on the Provider
  Dashboard, but does **not** appear on Browse or get matched by the
  Chatbot.
- Confirm the Activity & Bookings button opens the ledger drawer on
  Provider/Chatbot, and navigates to `/bookings` on Browse, with the correct
  badge count in each case.
