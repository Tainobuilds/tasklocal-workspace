# Bookings Supabase Migration + Availability Display Fix (Sub-project A2)

Status: Approved, ready for implementation plan.

## Goal

Extend the listings-to-Supabase migration to bookings: a `bookings` table
becomes the system of record, the existing booking-creation and
status-change endpoints write to it directly, and the Provider Dashboard
gains visibility into real customer bookings (previously only visible on
the customer side) without disturbing its existing, separate
localStorage-backed "Activity & Bookings" ledger. Also fixes a real,
confirmed bug uncovered while investigating this: listing availability
shows correctly on the raw provider feed but as empty on the customer
catalogue, because of a data-format mismatch introduced by the listings
migration's seed data.

## Non-goals

- No migration of the 18 existing historical rows in `data/bookings.json`
  — this migration is forward-only; new bookings go to Supabase, old JSON
  history is not backfilled. (If historical continuity matters later,
  that's a deliberate follow-up, not an accidental gap.)
- The Provider Dashboard's existing localStorage `tasklocal_bookings`
  ledger (fed by the AI Matcher's own booking-confirmation flow) is
  untouched — it's a separate, already-reviewed feature from the prior
  project, not the same thing as the real customer-side booking system
  this migration touches.
- No RLS beyond the same permissive anon-key policy already used for
  `listings` — access control is still out of scope, same as before.

## Bug found during investigation: availability shows empty on `/browse`

`GET /api/listings` (raw, provider-facing) shows each listing's
`availability` correctly — e.g. `[{"day":"Tue","period":"AM"}, ...]` —
because that endpoint passes the field through untouched. `GET
/api/catalogue` (customer-facing, runs through `sanitizeListings()`)
shows `availability: []` for every listing, because `parseSlot()` in
`src/lib/sanitize.ts` explicitly requires a **string** like `"Mon AM"`
(`if (typeof raw !== 'string') return null;`) — the same contract the
original JSON file always used. The listings migration's seed data
(`src/app/api/seed/route.ts`) stored availability as an array of
**objects** (`{ day: 'Tue', period: 'AM' }`) instead, which `parseSlot()`
correctly rejects as unparseable, silently dropping every slot.

Fix: correct the seed data to use the string format `parseSlot()` already
expects (`['Tue AM', 'Thu AM']`, etc.) — no schema change, no
`sanitize.ts` change. The `listings.availability` column stays `jsonb`
(format-agnostic); it's purely a seed-data content bug, not a schema or
parser bug. Re-running the (already idempotent) seed endpoint corrects
the existing rows via `upsert`.

## Architecture

**`supabase/schema.sql`** gains a `bookings` table, structurally
mirroring `data/bookings.json`'s existing shape (booking creation already
has a clean, well-typed record — no messy legacy fields to reconcile,
unlike listings):

```sql
create type booking_status as enum ('confirmed', 'completed', 'cancelled');

create table if not exists bookings (
  booking_id text primary key,
  listing_id text,
  customer_id text,
  scheduled_at timestamptz,
  booking_status booking_status not null default 'confirmed',
  address text,
  payment_intent_id text,
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;

create policy "Allow anon full access (temporary, pre-auth)"
  on bookings for all
  using (true)
  with check (true);
```

No foreign keys to `listings`/`customers` (customers stay JSON-backed;
`listings` is in Supabase but a booking referencing a listing that's
since been removed must still display — same "don't hard-constrain across
a moderation boundary" reasoning the original JSON design already used).

**`readBookings(): Promise<unknown[]>`** — a new helper in
`src/lib/server-data.ts`, sitting alongside `readListings()`, same
degrade-to-`[]`-on-error contract. Every current `readJsonFile('bookings.json')`
call site swaps to it:

| File | Function |
|---|---|
| `src/lib/server-data.ts` | `getCustomerBookings()`, `getTriageData()`, `getProviderDetail()`'s sibling functions — all 3 existing call sites in this file |
| `src/lib/booking-guard.ts` | the shared pre-booking conflict check |
| `src/app/api/reviews/route.ts` | resolving a review's booking before validating it |

**Writes**, like the listings migration, are rewritten per-endpoint:

- `POST /api/bookings` — id generation switches from the JSON-array-length
  scheme (`book_${600 + count}`) to `` `book-${Date.now()}` ``, matching
  the listings migration's convention. Otherwise unchanged: still gated by
  `guardSlot()` (unaffected — it already reads through `readListings()`/
  `readJsonFile('bookings.json')`, the latter becoming `readBookings()`
  in this task), still attributes to the session customer, still writes
  `booking_status: 'confirmed'`.
- `PATCH /api/bookings/[bookingId]` — this endpoint has real business logic
  beyond a status flip (ownership check, "already cancelled" guard,
  "can't cancel a completed booking" guard, "can't complete before the
  scheduled time" guard, "can't cancel after the scheduled time" guard),
  all of which depend on reading the booking's *current* state first. This
  becomes select-current-row → run the exact same checks in application
  code (unchanged) → update. Not a blind `UPDATE ... WHERE`, unlike the
  simpler listing-status PATCH.

## Provider Dashboard visibility (the "reflects across both dashboards" requirement)

The Provider Dashboard's existing `bookings` prop is fed by the
localStorage ledger — a different, already-reviewed feature for the AI
Matcher's own demo booking flow. Rather than repurpose that prop (which
would conflate two different booking systems the prior project
deliberately kept separate), `page.tsx` gets a **second**, independent
10-second poll of `/api/bookings` (mirroring the existing
`catalogueListings` poll pattern) into a new `realBookings` state, passed
to `ProviderDashboard` as a new, separate prop. `ProviderDashboard` gains
a small "Recent Customer Bookings" section listing each real booking's
resolved listing title (joined client-side against the `listings` prop
it already has, by `listing_id`) and status — proving a booking made on
`/browse` is visible to the provider without a reload. This does not
touch the existing "Active Services" grid, the existing "Activity &
Bookings" localStorage drawer, or its badge count.

## Testing / verification plan

- `npx tsc --noEmit` / `npx next build` clean (no automated test suite in
  this repo, consistent with prior tasks).
- Re-run `/api/seed`, confirm `/api/catalogue` now shows non-empty
  `availability` for the 3 listings that have any, and that `/browse`
  and the Provider Dashboard both render real time slots instead of
  "Contact provider for availability" / no availability shown.
- Book a listing via `/browse`'s existing `BookingFlow`, confirm the new
  row appears in Supabase's `bookings` table, and confirm the Provider
  Dashboard's new section shows it (within one 10s poll cycle) without a
  reload.
- Cancel/complete a booking via the existing UI, confirm the guards
  (already-cancelled, completed-cannot-cancel, date checks) still behave
  identically to before — same error messages, same status codes.
- Visit `/bookings`, `/internal/trust-safety`, a listing detail page —
  confirm booking-derived displays (customer's own history, triage queue,
  "Reviews"/"Report" flows that resolve a booking) still work correctly
  through the new `readBookings()` wiring.
