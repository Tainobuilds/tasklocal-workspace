# Supabase Listings Data Layer Migration (Sub-project A)

Status: Approved, ready for implementation plan.

## Goal

Replace `data/listings.json` with a real Supabase Postgres table as the
system of record for listings, without changing any consumer's business
logic or API contract. This is the first of two sub-projects toward a
Supabase-backed TaskLocal; the second (unified Supabase Auth + role-based
routing) is deliberately out of scope here and will get its own spec once
this one has landed and been verified.

## Non-goals

- No auth, no RLS beyond a permissive policy for the anon key. Real access
  control is Sub-project B's job — this migration doesn't change who can
  read or write listings, only where they're stored.
- `providers.json`, `bookings.json`, `reviews.json`, `reports.json`,
  `customers.json` stay exactly as they are. Only `listings.json` moves.
- No Supabase Realtime. The existing 10-second polling (Provider →
  Browse → Chatbot, built and reviewed in the prior header/theme project)
  is untouched — this migration is a storage swap, not a sync-mechanism
  change.
- No literal migration of `data/listings.json`'s deliberately-malformed QA
  fixtures (duplicate `listing_id`, negative price, missing
  `service_type`) — see "Schema" below for why, and what does carry over.

## Architecture

**`src/lib/supabase.ts`** (new) — a single shared client:
```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
```
No `@supabase/ssr` cookie-aware client/server split here — that's about
session handling, which doesn't exist yet (Sub-project B's job). A single
`createClient()` instance using the anon key is safe to import from both
Route Handlers and, later if needed, client components.

**`supabase/schema.sql`** (new) — the `listings` table:
```sql
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

`listing_id`/`provider_id` stay plain `text`, not `uuid` — matches the
existing IDs (`list_101`, `prov_001`) and the app's own
`` `list-${Date.now()}` `` generator, so nothing about ID generation
changes. `provider_id` has no foreign key constraint since `providers`
isn't in Supabase in this sub-project. `availability` stays `jsonb`,
matching its current shape (`[{ day: "Mon", period: "AM" }, ...]`) —
`parseAvailability()` in `sanitize.ts` keeps validating whatever comes
back, unchanged.

**Why the malformed fixtures don't carry over:** a `CHECK (price >= 0)`
rejects a negative-price insert outright; a duplicate `listing_id`
violates the primary key. These aren't things the schema can be
configured to "allow" without also weakening the guarantee the schema
exists to provide. `flagged`/`removed`/`pending` are legitimate business
states (valid enum values), so the Trust & Safety flagged/removed demo
still works after migration — it's specifically the *invalid* fixtures
(duplicate id, bad price, missing required field) that can't be
represented. If equivalent test coverage for "the app handles bad data
gracefully" matters later, that becomes a test of Supabase-error-handling
(network failure, unexpected response shape), not a seeded-data trick —
out of scope here.

## Data flow

Every current consumer of `listings.json` already goes through
`sanitizeListings()` or `buildListingIndex()` (both in `src/lib/sanitize.ts`),
which take a plain array of listing-like objects as input — they don't
care whether that array came from a JSON file or a database query. That
means the migration is a single-point swap, not a rewrite of business
logic, at every one of these call sites:

| File | Current call | Becomes |
|---|---|---|
| `src/lib/server-data.ts` — `getCatalogue()` | `readJsonFile('listings.json')` | `readListings()` |
| `src/lib/server-data.ts` — `getCustomerBookings()` | `readJsonFile('listings.json')` | `readListings()` |
| `src/lib/server-data.ts` — `getTriageData()` | `readJsonFile('listings.json')` | `readListings()` |
| `src/lib/server-data.ts` — `getProviderDetail()` | `readJsonFile('listings.json')` | `readListings()` |
| `src/lib/booking-guard.ts` | `readJsonFile('listings.json')` | `readListings()` |
| `src/app/api/reports/route.ts` | `readJsonFile('listings.json')` | `readListings()` |
| `src/app/api/reviews/route.ts` | `readJsonFile('listings.json')` | `readListings()` |
| `src/app/api/listings/route.ts` — GET | `readJsonFile('listings.json')` | `readListings()` |

`readListings(): Promise<unknown[]>` is a new helper in
`src/lib/server-data.ts`, sitting alongside `readJsonFile`/`writeJsonFile`:
queries `supabase.from('listings').select('*')`, returns `data ?? []` on
success, logs and returns `[]` on error (matching `readJsonFile`'s
existing "a broken source degrades to empty, never throws" contract, so
every page that already handles an empty catalogue gracefully continues
to).

**Writes** don't fit the same read-swap pattern — they're rewritten
per-endpoint since a full-array read-modify-write becomes a targeted
insert/update:
- `src/app/api/listings/route.ts` — POST: `supabase.from('listings').insert({ ...body, listing_status: 'active' })`. The existing manual JS duplicate-id check is replaced by catching Postgres's unique-violation error (code `23505`) and translating it to the same `409` response the endpoint already returns — the primary key now enforces what the JS check used to.
- `src/app/api/listings/[listingId]/route.ts` — PATCH (the trust & safety moderation endpoint): `supabase.from('listings').update({ listing_status: status }).eq('listing_id', listingId).select()`. The existing "duplicate ids exist, update every copy" comment and logic no longer applies — the primary key makes duplicates impossible, so this becomes a single-row update. If the query returns zero rows, that's the existing 404 case.
- `src/app/api/seed/route.ts` — fixed (currently has its entire file contents duplicated, which won't compile) and rewritten to `supabase.from('listings').upsert([...], { onConflict: 'listing_id' })` with a small, stable-ID seed set (e.g. `list-seed-001` etc.) including at least one `flagged` listing, so re-running the seed is idempotent and the Trust & Safety queue still has something to show immediately after seeding.

## Component refactor

Once every consumer reads clean, schema-validated data, three components'
defensive fallback chains — written to tolerate the old JSON file's
inconsistencies — become unnecessary:
- `ProviderDashboard.tsx`: `item.price_per_hour ?? item.price ?? item.rate` → `item.price`; `item.category ?? item.service_type ?? item.type` → `item.service_type`.
- `MatchingChatbot.tsx`: the same two fallback families, same simplification.
- `CustomerApp.tsx` and its children already consume `CleanListing[]` (the sanitizer's output type) exclusively, so they need no change — this is confirmation the boundary is already correctly drawn there, not a gap.

This is a mechanical read-the-canonical-field-directly pass, not a
redesign — API response shapes for `/api/listings` and `/api/catalogue`
are unchanged, so no other frontend code needs to change.

## Error handling

- `readListings()` degrades to `[]` on any Supabase error, matching
  `readJsonFile`'s existing contract — every page already handles an
  empty listings array (empty states exist throughout the app).
- POST/PATCH endpoints catch Supabase errors the same way they currently
  catch file-write errors: log server-side, return a `500` with a generic
  message, except the specific `23505` unique-violation case, which maps
  to the existing `409` duplicate-id response.
- `.env.local` already has real `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` values (confirmed present) — no new
  environment setup needed, only the schema needs to be applied to that
  project (via the Supabase SQL editor, run by the user — this plan
  writes the SQL file, it doesn't execute it against their project).

## Testing / verification plan

- `npx tsc --noEmit` and `npx next build` clean across all 18 routes (no
  automated test suite exists in this repo, consistent with how every
  prior task in this project has verified).
- Run `supabase/schema.sql` against the user's Supabase project (manual
  step, user's own SQL editor), then hit `/api/seed` once and confirm
  rows appear in the Supabase table editor.
- Provider Dashboard still shows all listings including the seeded
  flagged one with its status badge; Browse/Chatbot still only show
  active listings — confirms the two-endpoint boundary survived the
  migration.
- Create a listing via the Provider Dashboard form, confirm it appears in
  Supabase's table editor and becomes visible/searchable on Browse and in
  the Chatbot within one poll cycle — confirms the write path and the
  existing sync mechanism both still work end-to-end.
- Flag a listing via the Trust & Safety console, confirm it's withdrawn
  from Browse/Chatbot immediately and still shows on the Provider
  Dashboard with its badge — confirms the PATCH endpoint's single-row
  update.
- Attempt to create two listings with a colliding id (or re-POST the same
  body twice), confirm a `409`, not a `500` or a silent duplicate —
  confirms the unique-violation translation.
