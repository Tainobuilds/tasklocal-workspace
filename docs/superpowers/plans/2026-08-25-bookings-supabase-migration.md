# Bookings Supabase Migration + Availability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate bookings from `data/bookings.json` to a real Supabase `bookings` table (mirroring the listings migration's pattern), give the Provider Dashboard live visibility into real customer bookings, and fix a confirmed bug where listing availability shows empty on the customer catalogue.

**Architecture:** Every current `readJsonFile('bookings.json')` call site routes through the same pattern the listings migration already established — a new `readBookings()` helper swaps in at each read site with no business-logic change. The two write endpoints (`POST /api/bookings`, `PATCH /api/bookings/[bookingId]`) are rewritten to Supabase directly; the PATCH endpoint's several business-rule guards (ownership, already-cancelled, date checks) are preserved exactly, just reading their input from a Supabase row instead of a JSON array entry. The Provider Dashboard gets a second, independent poll (mirroring the existing `catalogueListings` poll in `page.tsx`) feeding a new, separate display section — it does not touch or repurpose the existing localStorage-backed booking ledger, which is a different, already-reviewed feature.

**Tech Stack:** Next.js 16 (App Router), `@supabase/supabase-js` (already installed and committed), TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-25-bookings-supabase-migration-design.md`

**Verification approach:** This repo has no automated test framework. Steps that would normally be "write a failing test" are instead "verify via `npx tsc --noEmit` / `npx next build`" plus manual browser/curl checks, matching every prior task in this project.

## Global Constraints

- `booking_id`/`listing_id`/`customer_id` stay plain `text`, matching existing ids (`book_501`, `list_101`, `cust_00042`) and the new `` `book-${Date.now()}` `` generator this plan introduces.
- No historical migration of the 18 existing rows in `data/bookings.json` — forward-only, new bookings go to Supabase.
- No RLS beyond the same permissive anon-key policy already used for `listings`.
- The existing localStorage `tasklocal_bookings` ledger and its "Activity & Bookings" drawer/badge are untouched — a separate, already-reviewed feature, not the same system this plan touches.
- `readBookings()` must degrade to `[]` on any error, never throw — matching `readListings()`'s and `readJsonFile()`'s existing contract.
- The PATCH `/api/bookings/[bookingId]` endpoint's existing business rules (ownership check, already-cancelled guard, completed-cannot-cancel guard, date-based guards for completing/cancelling) must produce byte-identical error messages and status codes to today — only the storage layer changes.

---

## Task 1: Fix the availability format bug in seed data

**Files:**
- Modify: `src/app/api/seed/route.ts`

**Interfaces:** None — this task doesn't produce anything later tasks consume; it's a standalone bug fix.

- [ ] **Step 1: Correct the four `availability` array literals**

`parseSlot()` in `src/lib/sanitize.ts` (unchanged, not part of this task) requires each availability entry to be a string like `"Mon AM"` — it explicitly rejects objects. The seed data currently uses object literals, which is why `/api/catalogue` (and therefore `/browse` and the Matching Chatbot) show every listing with empty availability even though `/api/listings` (which doesn't parse the field) shows it correctly.

Replace:
```typescript
    availability: [{ day: 'Tue', period: 'AM' }, { day: 'Thu', period: 'AM' }],
```
with:
```typescript
    availability: ['Tue AM', 'Thu AM'],
```

Replace:
```typescript
    availability: [{ day: 'Mon', period: 'PM' }, { day: 'Fri', period: 'AM' }],
```
with:
```typescript
    availability: ['Mon PM', 'Fri AM'],
```

Replace:
```typescript
    availability: [{ day: 'Sat', period: 'AM' }],
```
with:
```typescript
    availability: ['Sat AM'],
```

Replace:
```typescript
    availability: [{ day: 'Sat', period: 'PM' }],
```
with:
```typescript
    availability: ['Sat PM'],
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Re-seed and verify the fix**

With the dev server running:
```bash
curl -s http://localhost:3000/api/seed
```
Expected: success (the `upsert` corrects the 4 existing rows in place, no duplicate-key error).
```bash
curl -s http://localhost:3000/api/catalogue | python3 -m json.tool | grep -A3 availability
```
Expected: non-empty `availability` arrays now appear for `list-seed-001`, `list-seed-002`, and `list-seed-003` (matching their corrected slots), confirming `parseSlot()` now successfully parses every entry.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/seed/route.ts
git commit -m "Fix seed data availability format so it parses on the customer catalogue"
```

---

## Task 2: Add the `bookings` table to the schema

**Files:**
- Modify: `supabase/schema.sql`

**Interfaces:**
- Produces: a `bookings` table in the real Supabase project, consumed starting Task 3. Like Task 1 of the listings migration, applying this SQL is a human step — the anon key cannot run DDL.

- [ ] **Step 1: Append the bookings table to the schema file**

Add this to the end of `supabase/schema.sql` (after the existing `listings` table and its policy):

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

No foreign keys to `listings` — a booking must still display correctly even if its listing is later removed, same reasoning the existing JSON-based system already uses (see `getCustomerBookings()`'s doc comment in `src/lib/server-data.ts`).

- [ ] **Step 2: Verify it compiles / is valid**

```bash
npx tsc --noEmit
```
Expected: no errors (SQL file isn't type-checked, this just confirms nothing else broke).

- [ ] **Step 3: Human step — apply the schema addition to the real Supabase project**

Report this task as DONE_WITH_CONCERNS. Ask the controller to relay: "Please run the new `bookings` table SQL (the part appended to `supabase/schema.sql` in this task) in your Supabase project's SQL editor, then confirm when done." Do not attempt to run it yourself — same constraint as the original `listings` table.

Once confirmed, verify the table exists:
```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/bookings?select=booking_id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```
(Read the values from `.env.local` — don't hardcode or print them.) Expected: `[]`, not a `relation "bookings" does not exist` error.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add bookings table to the Supabase schema"
```

---

## Task 3: `readBookings()` helper and its three call sites within `server-data.ts`

**Files:**
- Modify: `src/lib/server-data.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase` (existing).
- Produces: `readBookings(): Promise<unknown[]>`, exported alongside `readListings()`. Consumed by Task 4 (other files) and this file's own three call sites.

- [ ] **Step 1: Add `readBookings()`**

Immediately after the existing `readListings()` function, add:

```typescript
/**
 * Reads all bookings from Supabase. Mirrors readListings()'s contract: a
 * broken or empty source degrades to an empty array rather than throwing.
 */
export async function readBookings(): Promise<unknown[]> {
  const { data, error } = await supabase.from('bookings').select('*');
  if (error) {
    console.error('[tasklocal] Could not read bookings from Supabase:', error);
    return [];
  }
  return data ?? [];
}
```

- [ ] **Step 2: Swap the call site in `getCustomerBookings()`**

Replace:
```typescript
    const [rawBookings, rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('bookings.json'),
      readListings(),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```
with:
```typescript
    const [rawBookings, rawListings, rawProviders, derivedRatings] = await Promise.all([
      readBookings(),
      readListings(),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```

- [ ] **Step 3: Swap the call site in `getTriageData()`**

Replace:
```typescript
    const [rawReports, rawListings, rawProviders, rawBookings, derivedRatings] = await Promise.all([
      readJsonFile('reports.json'),
      readListings(),
      readJsonFile('providers.json'),
      readJsonFile('bookings.json'),
      loadProviderRatings(),
    ]);
```
with:
```typescript
    const [rawReports, rawListings, rawProviders, rawBookings, derivedRatings] = await Promise.all([
      readJsonFile('reports.json'),
      readListings(),
      readJsonFile('providers.json'),
      readBookings(),
      loadProviderRatings(),
    ]);
```

- [ ] **Step 4: Swap the call site in `getReviewableBookingForListing()`**

Replace:
```typescript
    const [rawBookings, rawReviews] = await Promise.all([
      readJsonFile('bookings.json'),
      readJsonFile('reviews.json'),
    ]);
```
with:
```typescript
    const [rawBookings, rawReviews] = await Promise.all([
      readBookings(),
      readJsonFile('reviews.json'),
    ]);
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Verify against the real table**

With the dev server running, `curl http://localhost:3000/api/bookings` (still JSON-backed at this point in the plan, unaffected by this task) to confirm nothing broke, then confirm `getCustomerBookings` still works by loading `/bookings` while signed in — it will show the same 18 historical JSON bookings as before for `getCustomerBookings`'s OWN reads (unaffected — wait, this task changed it to `readBookings()`, so it now reads the EMPTY Supabase table, not the JSON file). Expected: `/bookings` now shows "no bookings yet" (or similar empty state) instead of history, because this task deliberately stops reading `data/bookings.json` — this is expected per the plan's forward-only migration, not a bug. Confirm no server error, just an empty result.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server-data.ts
git commit -m "Add readBookings() and swap it into server-data.ts's three call sites"
```

---

## Task 4: Swap `readBookings()` into `booking-guard.ts` and `reviews/route.ts`

**Files:**
- Modify: `src/lib/booking-guard.ts`
- Modify: `src/app/api/reviews/route.ts`

**Interfaces:**
- Consumes: `readBookings()` from `@/lib/server-data` (Task 3).

- [ ] **Step 1: `src/lib/booking-guard.ts`**

The import currently reads:
```typescript
import { getCatalogue, readJsonFile, readListings } from './server-data';
```
Change to:
```typescript
import { getCatalogue, readBookings, readJsonFile, readListings } from './server-data';
```

The call site currently reads:
```typescript
  const [rawListings, rawProviders, rawBookings] = await Promise.all([
    readListings(),
    readJsonFile('providers.json'),
    readJsonFile('bookings.json'),
  ]);
```
Change to:
```typescript
  const [rawListings, rawProviders, rawBookings] = await Promise.all([
    readListings(),
    readJsonFile('providers.json'),
    readBookings(),
  ]);
```

- [ ] **Step 2: `src/app/api/reviews/route.ts`**

The import currently reads:
```typescript
import { readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
```
Change to:
```typescript
import { readBookings, readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
```

The call site currently reads:
```typescript
    const rawBookings = await readJsonFile('bookings.json');
```
Change to:
```typescript
    const rawBookings = await readBookings();
```

Note: this is the exact same shape of change Task 3 of the listings migration made to this same style of call site — if `npx tsc --noEmit` reports a type error here about `Array.isArray` narrowing (the same class of issue documented in that earlier task), apply the same fix: wrap with `as unknown` — `const rawBookings = (await readBookings()) as unknown;` — only if `tsc` actually requires it. Verify first; don't add the cast speculatively.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (with or without the conditional cast from Step 2's note, whichever `tsc` actually requires).

- [ ] **Step 4: Verify no regression**

With the dev server running, confirm `guardSlot()`'s conflict-checking still runs without a server error when attempting to book a listing (the booking will succeed since the Supabase `bookings` table is empty, so there's nothing to conflict with yet — that's expected at this point in the plan).

- [ ] **Step 5: Commit**

```bash
git add src/lib/booking-guard.ts src/app/api/reviews/route.ts
git commit -m "Swap readBookings() into booking-guard and reviews routes"
```

---

## Task 5: Rewrite `/api/bookings/route.ts` (GET and POST)

**Files:**
- Modify: `src/app/api/bookings/route.ts`

**Interfaces:**
- Consumes: `readBookings()` from `@/lib/server-data` (Task 3), `supabase` from `@/lib/supabase` (existing), `guardSlot` from `@/lib/booking-guard` (existing, updated in Task 4).
- Produces: unchanged response shape for both GET and POST.

- [ ] **Step 1: Replace the full file**

```typescript
import { NextResponse } from 'next/server';

import { guardSlot } from '@/lib/booking-guard';
import { readBookings } from '@/lib/server-data';
import { getSessionCustomerId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const bookings = await readBookings();
  return NextResponse.json(bookings);
}

/**
 * Creates a booking for the signed-in customer.
 *
 * The slot is re-validated here even though the client already ran the
 * pre-payment check, because the provider's calendar can change in between.
 */
export async function POST(request: Request) {
  try {
    // Attribution comes from the session cookie, never the request body, so a
    // booking cannot be filed against another customer.
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in to book.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) {
      return NextResponse.json({ error: 'A service address is required.' }, { status: 400 });
    }

    const guard = await guardSlot(body.listing_id, body.date, body.period);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const booking = {
      booking_id: `book-${Date.now()}`,
      listing_id: guard.listing.listing_id,
      customer_id: customerId,
      scheduled_at: guard.scheduledAt,
      booking_status: 'confirmed',
      address,
      payment_intent_id: typeof body.payment_intent_id === 'string' ? body.payment_intent_id : null,
    };

    const { data, error } = await supabase.from('bookings').insert(booking).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, booking: data });
  } catch (error) {
    console.error('[tasklocal] Booking creation failed:', error);
    return NextResponse.json({ error: 'Could not create the booking.' }, { status: 500 });
  }
}
```

Note: `nextBookingId()` (the old array-length-based id generator) is removed entirely — ids are now `` `book-${Date.now()}` ``, matching the listings migration's `` `list-${Date.now()}` `` convention. A collision is astronomically unlikely (server-generated, millisecond-resolution, not client-supplied), so unlike the listings POST there's no special 409-on-duplicate handling here — any Supabase error falls through to the existing 500 path.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify against the real table**

With the dev server running and signed in as a customer (via `/login`), book a listing through the existing `/browse` UI flow (or `curl -X POST http://localhost:3000/api/bookings` with a valid session cookie and a real `listing_id`/`date`/`period` from a seeded listing's availability). Confirm the response includes `success: true` and a `booking_id` starting with `book-`. Then `curl http://localhost:3000/api/bookings` and confirm the new booking appears.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bookings/route.ts
git commit -m "Rewrite /api/bookings to read and write Supabase directly"
```

---

## Task 6: Rewrite `/api/bookings/[bookingId]/route.ts` (PATCH)

**Files:**
- Modify: `src/app/api/bookings/[bookingId]/route.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase` (existing).
- Produces: unchanged response shape and unchanged business-rule behavior.

This endpoint has real logic beyond a status flip — ownership check, an "already cancelled" guard, a "completed cannot be cancelled" guard, and date-based guards for both completing and cancelling — all of which read the booking's *current* state first. Unlike the simpler listing-status PATCH, this becomes select-then-check-then-update, not a blind `UPDATE ... WHERE`.

- [ ] **Step 1: Replace the full file**

```typescript
import { NextResponse } from 'next/server';

import { getSessionCustomerId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ALLOWED = ['cancelled', 'completed'] as const;

/**
 * Cancels or completes a booking.
 *
 * Both transitions are gated on time as well as ownership: a job cannot be
 * completed before it has happened, and a past job cannot be cancelled.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/bookings/[bookingId]'>) {
  try {
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { bookingId } = await ctx.params;
    const body = await request.json().catch(() => null);
    const status = body && typeof body.booking_status === 'string' ? body.booking_status.toLowerCase() : null;

    if (!status || !(ALLOWED as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `booking_status must be one of ${ALLOWED.join(', ')}.` },
        { status: 400 },
      );
    }

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) {
      return NextResponse.json({ error: 'No such booking.' }, { status: 404 });
    }

    // A customer may only act on their own bookings.
    if (booking.customer_id !== customerId) {
      return NextResponse.json({ error: 'That booking belongs to another account.' }, { status: 403 });
    }

    const current = typeof booking.booking_status === 'string' ? booking.booking_status.toLowerCase() : '';
    if (current === 'cancelled') {
      return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 });
    }
    if (current === 'completed' && status === 'cancelled') {
      return NextResponse.json({ error: 'A completed booking cannot be cancelled.' }, { status: 409 });
    }

    const scheduledMs = new Date(booking.scheduled_at).getTime();
    const hasValidDate = Number.isFinite(scheduledMs);

    if (status === 'completed') {
      if (!hasValidDate) {
        return NextResponse.json(
          { error: 'This booking has no valid scheduled time, so it cannot be completed.' },
          { status: 409 },
        );
      }
      if (scheduledMs > Date.now()) {
        return NextResponse.json(
          { error: 'This booking cannot be marked complete until its scheduled time has passed.' },
          { status: 409 },
        );
      }
    }

    if (status === 'cancelled' && hasValidDate && scheduledMs <= Date.now()) {
      return NextResponse.json(
        { error: 'This booking is in the past and can no longer be cancelled.' },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ booking_status: status })
      .eq('booking_id', bookingId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    console.error('[tasklocal] Failed to update booking:', error);
    return NextResponse.json({ error: 'Could not update the booking.' }, { status: 500 });
  }
}
```

Every guard's condition and error message/status code is copied verbatim from the current file — only the data source (a Supabase `select` instead of a JSON-array `findIndex`, a Supabase `update` instead of a JSON-array splice + `writeJsonFile`) changed.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify against the real table**

Using the booking created in Task 5's verification:
```bash
curl -s -X PATCH http://localhost:3000/api/bookings/<booking_id> \
  -H "Content-Type: application/json" \
  --cookie "<the session cookie from being signed in>" \
  -d '{"booking_status":"cancelled"}'
```
Expected: if the booking's `scheduled_at` is in the future, `success: true` with `booking_status: "cancelled"`. Then repeat the exact same request. Expected: `409` "This booking is already cancelled." Also verify the 401 (no session) and 404 (nonexistent id) paths behave as before.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/bookings/[bookingId]/route.ts"
git commit -m "Rewrite booking status PATCH to read and update Supabase directly"
```

---

## Task 7: Provider Dashboard visibility into real bookings

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ProviderDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/bookings` (Task 5).
- Produces: `ProviderDashboard` gains a new prop, `realBookings: any[]`, additive to its existing `listings`/`bookings`/`onCreateListing` props — the existing `bookings` prop (the localStorage ledger) is untouched.

This does NOT change the existing "Active Services" grid, the existing "Activity & Bookings" drawer, or its badge count — those remain fed by the untouched localStorage ledger. This adds a new, separate section.

- [ ] **Step 1: Add a second, independent poll in `page.tsx`**

Add a new state near the existing `catalogueListings` state:
```typescript
  const [realBookings, setRealBookings] = useState<any[]>([]);
```

Add a new effect immediately after the existing catalogue-polling effect (the one with the `fetchCatalogue` function), mirroring its exact shape:
```typescript
  // Independent poll so the Provider Dashboard can show real customer
  // bookings made on /browse — separate from the localStorage ledger above,
  // which is a different, unrelated booking system fed by the AI Matcher.
  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await fetch('/api/bookings');
        const data = await res.json();
        setRealBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchBookings();
    const interval = setInterval(fetchBookings, 10000);
    return () => clearInterval(interval);
  }, []);
```

Change the `ProviderDashboard` render call from:
```tsx
              <ProviderDashboard listings={listings} bookings={bookings} onCreateListing={createListing} />
```
to:
```tsx
              <ProviderDashboard listings={listings} bookings={bookings} realBookings={realBookings} onCreateListing={createListing} />
```

- [ ] **Step 2: Add the new prop and section to `ProviderDashboard.tsx`**

Update the `Props` interface:
```typescript
interface Props {
  listings: any[];
  bookings: any[];
  realBookings: any[];
  onCreateListing: (formData: { title: string; service_type: string; price: string; description: string }) => Promise<boolean>;
}
```

Update the component signature:
```typescript
export default function ProviderDashboard({ listings, bookings, realBookings, onCreateListing }: Props) {
```

Immediately after the closing `)}` of the existing listing grid / empty-state block (the one ending right before the `{/* Create New Listing Modal */}` comment), add a new section:

```tsx
      {realBookings.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Recent Customer Bookings</h2>
          <div className="space-y-2">
            {realBookings.map((booking, idx) => {
              const listing = listings.find((item) => item.listing_id === booking.listing_id);
              const listingTitle = listing?.title || booking.listing_id || 'Unknown service';
              const status = typeof booking.booking_status === 'string' ? booking.booking_status : 'confirmed';
              const statusClassName =
                status === 'cancelled'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : status === 'completed'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <div
                  key={booking.booking_id || idx}
                  className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5"
                >
                  <span className="text-sm text-slate-900 dark:text-slate-100 truncate">{listingTitle}</span>
                  <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-full shrink-0 ${statusClassName}`}>
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Book a listing via `/browse` (signed in as a customer). Without reloading the Provider Dashboard tab, wait up to 10 seconds and confirm a new "Recent Customer Bookings" section appears (or gains a row) showing the correct listing title and a "confirmed" badge — confirms the independent poll works end to end and doesn't interfere with the existing "Active Services" grid or the localStorage-backed "Activity & Bookings" drawer (open that drawer too and confirm it's unaffected, still showing only AI-Matcher-originated demo bookings).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/ProviderDashboard.tsx
git commit -m "Give the Provider Dashboard live visibility into real customer bookings"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only; fix forward in the relevant task's file if something fails)

- [ ] **Step 1: Full production build**

```bash
npx next build
```
Expected: all 19 routes compile with zero errors.

- [ ] **Step 2: Availability fix check**

Confirm `/browse` and the Provider Dashboard both now show real time slots (e.g. "Tue AM, Thu AM") for the 3 seeded listings that have them, instead of "Contact provider for availability" / no availability shown.

- [ ] **Step 3: Full booking lifecycle check**

Book a listing via `/browse`. Confirm it appears in Supabase's `bookings` table, on the customer's `/bookings` page, and (within one 10s poll cycle, no reload) in the Provider Dashboard's new "Recent Customer Bookings" section. Cancel it via the existing UI/endpoint and confirm the status updates in all three places.

- [ ] **Step 4: Guard regression check**

Attempt to cancel an already-cancelled booking (409, not 500), attempt to complete a booking scheduled in the future (409), and attempt to act on another customer's booking if you can construct that scenario (403) — confirm all three match their pre-migration behavior exactly.

- [ ] **Step 5: Regression check on untouched surfaces**

Visit `/internal/trust-safety` (triage data depends on `readBookings()` now) and a listing detail page (review submission depends on booking lookups) — confirm both still function correctly.

- [ ] **Step 6: Clean up test data**

Cancel or otherwise leave in a clean state any test bookings created during verification — there's no DELETE endpoint, so this just means not leaving confusing half-finished state; document what you created if it can't be cleaned up.

- [ ] **Step 7: Final commit (only if Steps 1-6 required fixes)**

If any check above required a fix, commit it with a message describing what broke and the fix — otherwise no commit needed for this task.
