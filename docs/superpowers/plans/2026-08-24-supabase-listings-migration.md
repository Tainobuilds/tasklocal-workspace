# Supabase Listings Data Layer Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `data/listings.json` with a real Supabase Postgres table as the system of record for listings, without changing any consumer's business logic or any API's response contract.

**Architecture:** Every existing consumer of `listings.json` already routes through `sanitizeListings()`/`buildListingIndex()` in `src/lib/sanitize.ts`, both of which take a plain array of listing-like objects — they don't care where that array came from. So this migration is a data-source swap at each call site (a new `readListings()` helper replacing `readJsonFile('listings.json')`), not a rewrite of business logic. The two write endpoints (`POST /api/listings`, `PATCH /api/listings/[listingId]`) are rewritten from full-array read-modify-write to targeted Supabase insert/update, since the primary key now enforces what manual JS duplicate-checking used to.

**Tech Stack:** Next.js 16 (App Router), `@supabase/supabase-js` (already installed), TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-supabase-listings-migration-design.md`

**Verification approach:** This repo has no automated test framework (no Jest/Vitest, no test script in `package.json`). Steps that would normally be "write a failing test" are instead "verify via `npx tsc --noEmit` / `npx next build`" plus a manual browser/curl check, matching how every prior task in this project has been verified.

## Global Constraints

- `listing_id`/`provider_id` stay plain `text`, not `uuid` — must match existing IDs (`list_101`, `prov_001`) and the app's own `` `list-${Date.now()}` `` generator exactly.
- `providers.json`, `bookings.json`, `reviews.json`, `reports.json`, `customers.json` are untouched — only listings storage moves.
- No auth, no RLS beyond a permissive policy for the anon key — access control is a separate, later sub-project.
- No Supabase Realtime — the existing 10-second polling stays exactly as it is.
- `readListings()` must degrade to `[]` on any error, never throw — matching `readJsonFile`'s existing contract, since every page already handles an empty listings array gracefully.
- `.env.local` already has real `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` values — no environment setup needed.

---

## Task 1: Supabase client and schema file

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: `supabase` — a configured `SupabaseClient` instance, imported by every later task as `import { supabase } from '@/lib/supabase';` (or `from './supabase';` within `src/lib/`).

- [ ] **Step 1: Write the Supabase client**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```

- [ ] **Step 2: Write the schema file**

```sql
-- supabase/schema.sql
create type service_type as enum ('cleaning', 'handyman', 'moving');
create type listing_status as enum ('active', 'flagged', 'removed', 'pending');

create table if not exists listings (
  listing_id text primary key,
  provider_id text,
  title text not null,
  service_type service_type not null,
  description text,
  price numeric check (price >= 0),
  availability jsonb not null default '[]'::jsonb,
  listing_status listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table listings enable row level security;

create policy "Allow anon full access (temporary, pre-auth)"
  on listings for all
  using (true)
  with check (true);
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (the new file isn't imported anywhere yet, so this just confirms no syntax errors).

- [ ] **Step 4: Human step — apply the schema to the real Supabase project**

This step cannot be automated: Supabase's client libraries don't support arbitrary DDL execution via the anon key used by `src/lib/supabase.ts` — creating tables requires the Supabase dashboard's SQL editor (or a direct Postgres connection), not the JS client.

**Report this task as DONE_WITH_CONCERNS** and tell the controller: "Please run `supabase/schema.sql` in your Supabase project's SQL editor (Supabase dashboard → SQL Editor → paste the file contents → Run), then confirm when done." Do not proceed to write code that queries a table that may not exist yet — later tasks depend on this table being live.

Once the human confirms, verify the table exists before considering this step done:
```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/listings?select=listing_id&limit=1" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
```
(Read the actual values from `.env.local` — do not hardcode them, and do not print them in your report.) Expected: an empty JSON array `[]` (table exists, no rows yet), not a `relation "listings" does not exist` error.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts supabase/schema.sql
git commit -m "Add Supabase client and listings table schema"
```

---

## Task 2: `readListings()` helper and its four call sites within `server-data.ts`

**Files:**
- Modify: `src/lib/server-data.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase` (Task 1).
- Produces: `readListings(): Promise<unknown[]>`, exported from `src/lib/server-data.ts` alongside the existing `readJsonFile`/`writeJsonFile`. Consumed by Task 3 (other files) and already wired into this file's own four call sites by this task.

- [ ] **Step 1: Add the import**

In `src/lib/server-data.ts`, the imports currently read (in part):
```typescript
import { getSessionCustomerId } from './session';
import { buildTriageData, type TriageData } from './trust-safety';
```
Insert a new import between them:
```typescript
import { getSessionCustomerId } from './session';
import { supabase } from './supabase';
import { buildTriageData, type TriageData } from './trust-safety';
```

- [ ] **Step 2: Add `readListings()`**

Immediately after the existing `writeJsonFile` function (and before the `loadProviderRatings` function that follows it), add:

```typescript
/**
 * Reads all listings from Supabase. Mirrors readJsonFile's contract: a
 * broken or empty source degrades to an empty array rather than throwing,
 * so every page that already handles an empty catalogue continues to.
 */
export async function readListings(): Promise<unknown[]> {
  const { data, error } = await supabase.from('listings').select('*');
  if (error) {
    console.error('[tasklocal] Could not read listings from Supabase:', error);
    return [];
  }
  return data ?? [];
}
```

- [ ] **Step 3: Swap the call site in `getCatalogue()`**

Replace:
```typescript
    const [rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```
with:
```typescript
    const [rawListings, rawProviders, derivedRatings] = await Promise.all([
      readListings(),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```

- [ ] **Step 4: Swap the call site in `getCustomerBookings()`**

Replace:
```typescript
    const [rawBookings, rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('bookings.json'),
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```
with:
```typescript
    const [rawBookings, rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('bookings.json'),
      readListings(),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);
```

- [ ] **Step 5: Swap the call site in `getTriageData()`**

Replace:
```typescript
    const [rawReports, rawListings, rawProviders, rawBookings, derivedRatings] = await Promise.all([
      readJsonFile('reports.json'),
      readJsonFile('listings.json'),
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
      readJsonFile('bookings.json'),
      loadProviderRatings(),
    ]);
```

- [ ] **Step 6: Swap the call site in `getProviderDetail()`**

Replace:
```typescript
    const [rawProviders, rawListings, rawReviews] = await Promise.all([
      readJsonFile('providers.json'),
      readJsonFile('listings.json'),
      readJsonFile('reviews.json'),
    ]);
```
with:
```typescript
    const [rawProviders, rawListings, rawReviews] = await Promise.all([
      readJsonFile('providers.json'),
      readListings(),
      readJsonFile('reviews.json'),
    ]);
```

- [ ] **Step 7: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Verify against the real table**

With the dev server running, hit an endpoint that calls `getCatalogue()` (e.g. `curl http://localhost:3000/api/catalogue`) and confirm it returns `[]` (empty, since the table has no rows yet) with no server error in the terminal running `npm run dev` — confirms `readListings()` is wired correctly end-to-end, not just type-checking.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server-data.ts
git commit -m "Add readListings() and swap it into server-data.ts's four call sites"
```

---

## Task 3: Swap `readListings()` into `booking-guard.ts`, `reports/route.ts`, `reviews/route.ts`

**Files:**
- Modify: `src/lib/booking-guard.ts`
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/api/reviews/route.ts`

**Interfaces:**
- Consumes: `readListings()` from `@/lib/server-data` (Task 2).

These three files each have exactly one `readJsonFile('listings.json')` call, in the same mechanical shape as Task 2 — swap the import and the call site in each.

- [ ] **Step 1: `src/lib/booking-guard.ts`**

The import currently reads:
```typescript
import { getCatalogue, readJsonFile } from './server-data';
```
Change to:
```typescript
import { getCatalogue, readJsonFile, readListings } from './server-data';
```

The call site currently reads:
```typescript
  const [rawListings, rawProviders, rawBookings] = await Promise.all([
    readJsonFile('listings.json'),
    readJsonFile('providers.json'),
    readJsonFile('bookings.json'),
  ]);
```
Change to:
```typescript
  const [rawListings, rawProviders, rawBookings] = await Promise.all([
    readListings(),
    readJsonFile('providers.json'),
    readJsonFile('bookings.json'),
  ]);
```

- [ ] **Step 2: `src/app/api/reports/route.ts`**

The import currently reads:
```typescript
import { readJsonFile, writeJsonFile } from '@/lib/server-data';
```
Change to:
```typescript
import { readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
```

The call site currently reads:
```typescript
    const rawListings = await readJsonFile('listings.json');
```
Change to:
```typescript
    const rawListings = await readListings();
```

- [ ] **Step 3: `src/app/api/reviews/route.ts`**

The import currently reads:
```typescript
import { readJsonFile, writeJsonFile } from '@/lib/server-data';
```
Change to:
```typescript
import { readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
```

The call site currently reads:
```typescript
    const rawListings = await readJsonFile('listings.json');
```
Change to:
```typescript
    const rawListings = await readListings();
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Verify no regression**

With the dev server running: submit a report against a listing via the customer app's Report dialog, and submit a review against a completed booking. Both should still succeed (they'll just find the listing/provider lookup returns nothing meaningful until Task 6 seeds real data — that's expected at this point in the plan; confirm no server-side crash or `500`, not that the lookups find real data yet).

- [ ] **Step 6: Commit**

```bash
git add src/lib/booking-guard.ts src/app/api/reports/route.ts src/app/api/reviews/route.ts
git commit -m "Swap readListings() into booking-guard, reports, and reviews routes"
```

---

## Task 4: Rewrite `/api/listings/route.ts` (GET and POST)

**Files:**
- Modify: `src/app/api/listings/route.ts`

**Interfaces:**
- Consumes: `readListings()` from `@/lib/server-data` (Task 2), `supabase` from `@/lib/supabase` (Task 1), `coercePrice` from `@/lib/sanitize` (existing, unchanged).
- Produces: unchanged response shape for both GET and POST — no other file depends on new interfaces from this task.

- [ ] **Step 1: Replace the full file**

```typescript
import { NextResponse } from 'next/server';

import { readListings } from '@/lib/server-data';
import { coercePrice } from '@/lib/sanitize';
import { supabase } from '@/lib/supabase';

/**
 * Listing data for the provider dashboard and matching chatbot: every
 * listing_status is kept (not just "active"), so providers can still see
 * and manage their own flagged/removed/pending listings — unlike the
 * customer catalogue in getCatalogue(), which filters to active only.
 */
export async function GET() {
  const raw = await readListings();

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = String(record.listing_id ?? '');
    if (!id) continue;
    byId.set(id, { ...record, price: coercePrice(record.price) });
  }

  return NextResponse.json([...byId.values()]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a listing object.' }, { status: 400 });
    }

    // listing_status is never trusted from the client: this endpoint only ever
    // publishes new active listings, so a POST body can't be used to smuggle a
    // listing back into the catalogue under a status a moderator already revoked.
    const newListing = { ...(body as Record<string, unknown>), listing_status: 'active' };

    const { data, error } = await supabase.from('listings').insert(newListing).select().single();

    if (error) {
      // Postgres unique_violation on the listing_id primary key.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A listing with id ${(body as Record<string, unknown>).listing_id} already exists.` },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, listing: data });
  } catch (error) {
    console.error('[tasklocal] Failed to save new listing:', error);
    return NextResponse.json({ error: 'Failed to save new listing' }, { status: 500 });
  }
}
```

Note: the dedup-by-id `Map` in `GET` is now defensive rather than load-bearing — the primary key makes true duplicates impossible at the database level — but it's kept because it's harmless and costs nothing to leave in place; do not remove it as part of this task, that would be unrelated cleanup.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify against the real table**

With the dev server running:
```bash
curl -s -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -d '{"listing_id":"list-test-001","title":"Test Listing","service_type":"cleaning","price":50,"description":"Verification test"}'
```
Expected: `{"success":true,"listing":{...}}` with `listing_status: "active"` in the response regardless of what was sent.

Repeat the exact same POST a second time. Expected: `409` with a message naming `list-test-001`, not a `500` or a silent duplicate.

Then:
```bash
curl -s http://localhost:3000/api/listings
```
Expected: the test listing appears in the array. Delete it from the Supabase table editor afterward so it doesn't pollute later verification steps (there's no DELETE endpoint yet — remove it directly in the Supabase dashboard's table editor).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/listings/route.ts
git commit -m "Rewrite /api/listings to read and write Supabase directly"
```

---

## Task 5: Rewrite `/api/listings/[listingId]/route.ts` (PATCH)

**Files:**
- Modify: `src/app/api/listings/[listingId]/route.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase` (Task 1).
- Produces: unchanged response shape — no other file depends on new interfaces from this task.

- [ ] **Step 1: Replace the full file**

```typescript
import { NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';

const LISTING_STATUSES = ['active', 'flagged', 'removed'] as const;

/**
 * Changes a listing's moderation status from the trust & safety panel.
 * This is the enforcement half of triage: flagging or removing a listing
 * withdraws it from the customer catalogue immediately.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/listings/[listingId]'>) {
  try {
    const { listingId } = await ctx.params;
    const body = await request.json().catch(() => null);

    const status =
      body && typeof body.listing_status === 'string' ? body.listing_status.toLowerCase() : null;
    if (!status || !(LISTING_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `listing_status must be one of ${LISTING_STATUSES.join(', ')}.` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ listing_status: status })
      .eq('listing_id', listingId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ error: `No listing found with id ${listingId}.` }, { status: 404 });
    }

    return NextResponse.json({ success: true, listingId, listing_status: status, updated: data.length });
  } catch (error) {
    console.error('[tasklocal] Failed to update listing status:', error);
    return NextResponse.json({ error: 'Could not update the listing.' }, { status: 500 });
  }
}
```

Note: the primary key makes the old "duplicate listing_ids exist, update every copy" scenario impossible, so this is now always a single-row update — the response's `updated` count will always be `0` or `1`, never more.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify against the real table**

With the dev server running, create a test listing (same curl as Task 4 Step 3), then:
```bash
curl -s -X PATCH http://localhost:3000/api/listings/list-test-001 \
  -H "Content-Type: application/json" \
  -d '{"listing_status":"flagged"}'
```
Expected: `{"success":true,"listingId":"list-test-001","listing_status":"flagged","updated":1}`.
```bash
curl -s -X PATCH http://localhost:3000/api/listings/list-does-not-exist \
  -H "Content-Type: application/json" \
  -d '{"listing_status":"flagged"}'
```
Expected: `404`. Remove the test listing from the Supabase table editor afterward.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/listings/[listingId]/route.ts"
git commit -m "Rewrite listing moderation PATCH to update Supabase directly"
```

---

## Task 6: Fix and rewrite `/api/seed/route.ts`

**Files:**
- Modify: `src/app/api/seed/route.ts`

**Interfaces:**
- Consumes: `supabase` from `@/lib/supabase` (Task 1).

The current file has its entire contents duplicated (two copies of the same imports and `GET` function pasted back to back), which does not compile. This task replaces it entirely with a small, idempotent seed set.

- [ ] **Step 1: Replace the full file**

```typescript
import { NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';

/**
 * Seeds a small set of representative listings, including one flagged
 * listing so the Trust & Safety queue has something to show immediately.
 * Uses stable ids and upsert so re-running this endpoint is safe.
 */
const SEED_LISTINGS = [
  {
    listing_id: 'list-seed-001',
    provider_id: 'prov_001',
    title: 'Studio Apartment Standard Clean',
    service_type: 'cleaning',
    description: 'Light dusting, vacuuming, and kitchen wipe-down',
    price: 75,
    availability: [{ day: 'Tue', period: 'AM' }, { day: 'Thu', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-002',
    provider_id: 'prov_002',
    title: 'Leaky Faucet Repair',
    service_type: 'handyman',
    description: 'Fix or replace kitchen and bathroom faucets',
    price: 60,
    availability: [{ day: 'Mon', period: 'PM' }, { day: 'Fri', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-003',
    provider_id: 'prov_003',
    title: 'Studio Move - Local',
    service_type: 'moving',
    description: 'Load, transport, and unload within 10 miles',
    price: 200,
    availability: [{ day: 'Sat', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-004',
    provider_id: 'prov_003',
    title: '2-Person Furniture Move',
    service_type: 'moving',
    description: 'Two movers, one truck, up to 3 hours',
    price: 150,
    availability: [{ day: 'Sat', period: 'PM' }],
    listing_status: 'flagged',
  },
];

export async function GET() {
  const { data, error } = await supabase
    .from('listings')
    .upsert(SEED_LISTINGS, { onConflict: 'listing_id' })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, seeded: data });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (this also confirms the duplicate-content compile error from the old file is gone).

- [ ] **Step 3: Run the seed and verify idempotency**

With the dev server running:
```bash
curl -s http://localhost:3000/api/seed
```
Expected: `{"success":true,"seeded":[...4 listings...]}`. Run the exact same command again. Expected: the same success response, not a `409` or duplicate-key error — confirms `upsert` makes this safe to re-run.

```bash
curl -s http://localhost:3000/api/listings | python3 -m json.tool
```
Expected: all 4 seeded listings present, including `list-seed-004` with `listing_status: "flagged"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/seed/route.ts
git commit -m "Fix and rewrite the seed route to upsert into Supabase"
```

---

## Task 7: Component refactor — drop legacy fallback chains

**Files:**
- Modify: `src/components/ProviderDashboard.tsx`
- Modify: `src/components/MatchingChatbot.tsx`

**Interfaces:**
- Consumes: the now-clean, schema-validated data flowing through `/api/listings` (Task 4).

Now that `/api/listings` only ever returns Supabase rows (real `service_type`, real numeric `price`, no legacy `category`/`price_per_hour`/`type`/`rate`/`id` fields), the defensive fallback chains that existed to tolerate the old JSON file's inconsistencies can be simplified to read the canonical fields directly.

- [ ] **Step 1: `src/components/ProviderDashboard.tsx`**

Replace:
```tsx
            const title = item.title || item.name || item.service_name || 'Unnamed Service';
            const category = item.category || item.service_type || item.type || 'General';
            const rate = item.price_per_hour ?? item.price ?? item.rate;
```
with:
```tsx
            const title = item.title || 'Unnamed Service';
            const category = item.service_type || 'General';
            const rate = item.price;
```

Replace:
```typescript
  const validRates = listings
    .map((item) => item.price_per_hour ?? item.price ?? item.rate)
    .filter((rate) => typeof rate === 'number' && Number.isFinite(rate));
```
with:
```typescript
  const validRates = listings
    .map((item) => item.price)
    .filter((rate) => typeof rate === 'number' && Number.isFinite(rate));
```

- [ ] **Step 2: `src/components/MatchingChatbot.tsx`**

Replace each of the four hash-seed lines' `item.listing_id || item.id || item.title || item.name || 'service'` pattern (all four share this prefix, differing only in their suffix string) with `item.listing_id || item.title || 'service'` — i.e. drop `item.id` and `item.name` from the chain, keep the rest of each line (including its own `-rt`/`-verified`/`-avail` suffix) unchanged.

Replace:
```tsx
          const cat = item.category || item.service_type || item.type || '';
```
with:
```tsx
          const cat = item.service_type || '';
```

Replace:
```tsx
        category: bookingListing?.category || bookingListing?.service_type || bookingListing?.type || 'General',
```
with:
```tsx
        category: bookingListing?.service_type || 'General',
```

Replace:
```tsx
                              {item.category || item.service_type || 'General'}
```
with:
```tsx
                              {item.service_type || 'General'}
```

Replace the price fallback chains — every instance of `item.price_per_hour || item.price || item.rate || 0` — with `item.price || 0`, and `bookingListing.price_per_hour || bookingListing.price || bookingListing.rate || 0` with `bookingListing.price || 0`. Search the file for all occurrences of `price_per_hour` to find every site; there are more than the one shown in earlier tasks' context, since this file has its own independent copies of the same fallback pattern in several places (the results-list render, the booking-confirmation flow, and the hourly-rate display).

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open the Provider Dashboard: confirm titles, categories, and prices still display correctly for the seeded listings (including the flagged one showing its badge). Switch to the Matching Chatbot: search "cleaning", confirm a result appears with the correct title/category/price, and confirm booking it still works end to end.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProviderDashboard.tsx src/components/MatchingChatbot.tsx
git commit -m "Drop legacy field-fallback chains now that listing data is schema-clean"
```

---

## Task 8: End-to-end verification

**Files:** none (verification only; fix forward in the relevant task's file if something fails)

- [ ] **Step 1: Full production build**

```bash
npx next build
```
Expected: all 18 routes compile with zero errors.

- [ ] **Step 2: Two-endpoint boundary check**

Confirm the Provider Dashboard shows all 4 seeded listings including the flagged one with its status badge, while Browse and the Matching Chatbot show only the 3 active ones and never the flagged one — confirms `/api/listings` (all statuses) and `/api/catalogue` (active-only via `getCatalogue()` → `readListings()` → `sanitizeListings()`) both correctly read the same Supabase table but preserve their different filtering.

- [ ] **Step 3: Live create-and-sync check**

Create a new listing via the Provider Dashboard form. Confirm it appears in the Supabase table editor immediately, then confirm it becomes visible on Browse and searchable in the Chatbot within one 10-second poll cycle (same check pattern used throughout the prior header/theme project — open both tabs, create in one, wait ~12s, confirm in the other without reloading).

- [ ] **Step 4: Moderation check**

Flag the newly-created listing via the Trust & Safety console's report/moderation flow (or directly via the PATCH endpoint verified in Task 5). Confirm it's withdrawn from Browse and the Chatbot immediately, and still shows on the Provider Dashboard with a "Flagged" badge.

- [ ] **Step 5: Duplicate-id check**

Attempt to POST a listing with an id that already exists (reuse `list-seed-001`). Confirm `409`, not `500` or a silent duplicate.

- [ ] **Step 6: Regression check on untouched data**

Visit `/bookings`, `/login`, a listing detail page, a provider detail page, and `/internal/trust-safety` — confirm all still work correctly (bookings/reviews/reports still resolve listing titles/providers correctly through `readListings()`, per Task 3's wiring).

- [ ] **Step 7: Clean up test data**

Remove any test listings created during verification (`list-test-001` from Tasks 4/5, if not already removed) from the Supabase table editor, so the seeded data set stays clean for whoever picks up Sub-project B next.

- [ ] **Step 8: Final commit (only if Steps 1-7 required fixes)**

If any check above required a fix, commit it with a message describing what broke and the fix — otherwise no commit needed for this task.
