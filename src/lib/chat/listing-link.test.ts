/**
 * The chat result card links to Product B's `/listings/[listingId]` page, and
 * that page calls `notFound()` for any id it cannot resolve. This file guards
 * the invariant that makes the link safe: every `listing_id` in a match
 * response resolves against the same catalogue that page reads from.
 *
 * Deliberately NOT tested against a rebuilt catalogue. `match.test.ts` calls
 * `sanitizeListings` itself, which is right for testing the matcher but would
 * prove nothing here: it would compare the matcher to a second copy of the
 * catalogue rather than to the one the page actually queries. So this file
 * calls the real `getCatalogue` and the real `getListingDetail` — the exact
 * function whose `null` becomes a 404 — and fakes only the network boundary
 * beneath them.
 *
 * The fake serves `data/listings.json`, which is the shape `readListings`
 * gets back from Supabase (see the seed route). No API key and no network.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Intent, Match } from './types';

function readData(file: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
}

// Only the Supabase client is faked. Everything above it — readListings, the
// shared sanitizer, the provider join, the ratings rollup — runs for real, so
// the catalogue under test is built by the same code path the page uses.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: async () =>
        table === 'listings'
          ? { data: readData('listings.json'), error: null }
          : { data: [], error: null },
    }),
  },
}));

const { getCatalogue, getListingDetail } = await import('@/lib/server-data');
const { matchListings } = await import('./match');

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    service_types: [],
    max_price: null,
    keywords: [],
    availability_hint: null,
    ...overrides,
  };
}

/**
 * Intents spanning every shape the matcher can return a result from: one
 * service type, several (which triggers the coverage reservation), a price
 * bound, and keyword-only. Between them these exercise each branch that can
 * put a `listing_id` in front of a customer.
 */
const INTENTS: Array<{ name: string; intent: Intent }> = [
  { name: 'a single service type', intent: intent({ service_types: ['cleaning'] }) },
  { name: 'handyman under a budget', intent: intent({ service_types: ['handyman'], max_price: 150 }) },
  {
    name: 'two service types, which reserves a slot per type',
    intent: intent({ service_types: ['cleaning', 'moving'] }),
  },
  { name: 'keywords only', intent: intent({ keywords: ['deep clean', 'kitchen'] }) },
  { name: 'a keyword that hits a description', intent: intent({ keywords: ['truck'] }) },
  {
    name: 'every service type at once',
    intent: intent({ service_types: ['cleaning', 'handyman', 'moving'] }),
  },
];

describe('every matched listing_id resolves on Product B’s listing page', () => {
  let matchesByIntent: Array<{ name: string; matches: Match[] }>;

  beforeAll(async () => {
    const { listings } = await getCatalogue();

    // Without this the suite could pass on an empty catalogue, proving
    // nothing. Every assertion below is only meaningful if real data loaded.
    expect(listings.length).toBeGreaterThan(0);

    matchesByIntent = INTENTS.map(({ name, intent: value }) => ({
      name,
      matches: matchListings(value, listings).matches,
    }));
  });

  it('produces matches to check in the first place', () => {
    const total = matchesByIntent.reduce((sum, entry) => sum + entry.matches.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it.each(INTENTS.map((entry) => entry.name))('resolves every id matched for %s', async (name) => {
    const { matches } = matchesByIntent.find((entry) => entry.name === name)!;

    for (const match of matches) {
      // This is precisely what the page awaits before calling notFound().
      const detail = await getListingDetail(match.listing_id);
      expect(detail, `/listings/${match.listing_id} would 404`).not.toBeNull();
      expect(detail!.listing.listing_id).toBe(match.listing_id);
    }
  });

  it('resolves an id to the same listing the card rendered', async () => {
    const [{ matches }] = matchesByIntent.filter((entry) => entry.matches.length > 0);
    const match = matches[0];
    const detail = await getListingDetail(match.listing_id);

    // The card shows these; the page the link opens must show the same thing,
    // or the link is a bait-and-switch even though it resolves.
    expect(detail!.listing.title).toBe(match.title);
    expect(detail!.listing.price).toBe(match.price);
    expect(detail!.listing.service_type).toBe(match.service_type);
  });

  it('does not resolve an id that is absent from the catalogue', async () => {
    // Proves the assertions above can fail — getListingDetail really does
    // return null for an unknown id rather than something always truthy.
    await expect(getListingDetail('list_does_not_exist')).resolves.toBeNull();
  });
});
