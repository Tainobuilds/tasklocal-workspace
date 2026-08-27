/**
 * Matcher tests, run against the real `data/*.json` through the real shared
 * sanitizer. No fixtures and no network: every assertion here is about the
 * deterministic half of the product, which is exactly the half the hard rule
 * governs ("the model chooses the search terms, the code chooses the results").
 *
 * Intents are supplied directly rather than extracted, because extraction
 * needs an API key. Each scenario below names the user message it stands in
 * for, and the end-to-end behaviour still needs one live check.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sanitizeListings } from '@/lib/sanitize';
import type { CleanListing } from '@/lib/types';

import {
  assertNoFabricatedListings,
  FabricatedListingError,
  matchListings,
  selectMatchable,
  TOP_N,
} from './match';
import type { Intent, Match } from './types';

function readData(file: string): unknown {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'data', file), 'utf8'));
}

/** The shared customer catalogue: validated, de-duplicated, active only. */
const catalogue: CleanListing[] = sanitizeListings(
  readData('listings.json'),
  readData('providers.json'),
).listings;

const { matchable, rejected } = selectMatchable(catalogue);
const matchableIds = matchable.map((listing) => listing.listing_id).sort();
const rejectedIds = rejected.map((listing) => listing.listing_id).sort();

function intent(overrides: Partial<Intent> = {}): Intent {
  return {
    service_types: [],
    max_price: null,
    keywords: [],
    availability_hint: null,
    ...overrides,
  };
}

const ids = (matches: readonly Match[]): string[] => matches.map((match) => match.listing_id);

/**
 * One entry per scenario the brief calls out, plus the intents those messages
 * plausibly extract to. Reused by the safety sweeps below so that every
 * invariant is checked against every scenario rather than a chosen few.
 */
const SCENARIOS: Array<{ name: string; message: string; intent: Intent }> = [
  {
    name: 'spans cleaning and moving',
    message: 'clean out my garage and move some boxes',
    intent: intent({ keywords: ['clean', 'garage', 'move', 'boxes'] }),
  },
  {
    name: 'cheap cleaning under $80',
    message: 'cheap cleaning under $80',
    intent: intent({ service_types: ['cleaning'], max_price: 80, keywords: ['cleaning'] }),
  },
  {
    name: 'plumber at 3am',
    message: 'I need a plumber at 3am',
    intent: intent({
      service_types: ['handyman'],
      keywords: ['plumber'],
      availability_hint: '3am',
    }),
  },
  {
    name: 'names the emergency plumbing listing directly',
    message: 'the emergency pipe repair one',
    intent: intent({ keywords: ['emergency', 'pipe', 'repair'] }),
  },
  {
    name: 'names a listing that is flagged',
    message: 'I want the 2-person furniture move',
    intent: intent({ service_types: ['moving'], keywords: ['furniture', 'move'] }),
  },
  {
    name: 'no possible match',
    message: 'underwater basket weaving',
    intent: intent({ keywords: ['underwater', 'basket', 'weaving'] }),
  },
  {
    name: 'emoji only, nothing expressed',
    message: '🧹🧹🧹',
    intent: intent(),
  },
  {
    name: 'timing only, nothing searchable',
    message: 'sometime this weekend',
    intent: intent({ availability_hint: 'this weekend' }),
  },
];

describe('the real dataset, through the shared sanitizer', () => {
  it('leaves 11 active listings after sanitising', () => {
    expect(catalogue).toHaveLength(11);
  });

  it("keeps 9 of them under Product C's stricter NOT NULL policy", () => {
    expect(matchableIds).toEqual([
      'list_102',
      'list_103',
      'list_104',
      'list_105',
      'list_107',
      'list_108',
      'list_109',
      'list_110',
      'list_111',
    ]);
  });

  it('rejects exactly the two records that violate a NOT NULL column', () => {
    expect(rejectedIds).toEqual(['list_113', 'list_114']);
  });

  it('records every reason a record failed, not just the first', () => {
    const garageCleanout = rejected.find((entry) => entry.listing_id === 'list_113');
    expect(garageCleanout?.reasons).toEqual([
      'description_missing',
      'provider_foreign_key_unresolved',
    ]);
  });

  it('rejects the negative-price listing the shared sanitizer repaired', () => {
    const emergencyPipe = rejected.find((entry) => entry.listing_id === 'list_114');
    expect(emergencyPipe?.reasons).toEqual(['price_missing_or_invalid']);
  });
});

describe('no rejected, flagged or removed listing is ever returned', () => {
  it.each(SCENARIOS)('$name', ({ intent: parsed }) => {
    const returned = ids(matchListings(parsed, catalogue).matches);

    for (const id of returned) {
      expect(matchableIds).toContain(id);
      expect(rejectedIds).not.toContain(id);
    }
    // list_106 is flagged and list_101 resolves to a removed record.
    expect(returned).not.toContain('list_106');
    expect(returned).not.toContain('list_101');
  });

  it('never returns the -40 listing even when its own words are searched', () => {
    // "plumbing" appears verbatim in list_114's description, so this listing
    // would rank first if the price rejection were not applied.
    const outcome = matchListings(intent({ keywords: ['plumbing'] }), catalogue);
    expect(ids(outcome.matches)).not.toContain('list_114');
    expect(outcome.matches).toHaveLength(0);
  });

  it('never returns more than the top three', () => {
    for (const scenario of SCENARIOS) {
      expect(matchListings(scenario.intent, catalogue).matches.length).toBeLessThanOrEqual(TOP_N);
    }
  });
});

describe('scenario results', () => {
  it('"cheap cleaning under $80" returns the two cleaning listings in budget, cheapest first', () => {
    const outcome = matchListings(SCENARIOS[1].intent, catalogue);
    expect(ids(outcome.matches)).toEqual(['list_108', 'list_102']);
    expect(outcome.counts.afterServiceType).toBe(4);
    expect(outcome.counts.afterMaxPrice).toBe(2);
  });

  it('"clean out my garage and move some boxes" ranks the listing hitting both words first', () => {
    const outcome = matchListings(SCENARIOS[0].intent, catalogue);
    // list_107 "Move-Out Deep Clean" is the only listing matching both
    // "clean" and "move", so it scores 4 against everything else's 2.
    expect(ids(outcome.matches)).toEqual(['list_107', 'list_108', 'list_102']);
    expect(outcome.matches[0].reason.keywordScore).toBe(4);
    expect(outcome.matches[0].reason.matchedKeywords).toEqual(['clean', 'move']);
  });

  it('"I need a plumber at 3am" finds nothing and says why', () => {
    const outcome = matchListings(SCENARIOS[2].intent, catalogue);
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.counts.afterKeyword).toBe(0);
    expect(outcome.explanation).toContain('different words');
  });

  it('"underwater basket weaving" finds nothing and suggests loosening', () => {
    const outcome = matchListings(SCENARIOS[5].intent, catalogue);
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.explanation).toContain('different words');
  });

  it('naming the flagged furniture move returns the other moving listing instead', () => {
    const outcome = matchListings(SCENARIOS[4].intent, catalogue);
    expect(ids(outcome.matches)).toEqual(['list_105']);
  });

  it('naming the emergency pipe repair returns the other repair listings instead', () => {
    const outcome = matchListings(SCENARIOS[3].intent, catalogue);
    expect(ids(outcome.matches)).toEqual(['list_103', 'list_104']);
  });

  it('an intent expressing nothing returns nothing rather than arbitrary listings', () => {
    for (const scenario of [SCENARIOS[6], SCENARIOS[7]]) {
      const outcome = matchListings(scenario.intent, catalogue);
      expect(outcome.matches).toHaveLength(0);
      expect(outcome.explanation).toContain('did not catch');
    }
  });

  it('reports the real matchable count rather than the raw file size', () => {
    const outcome = matchListings(SCENARIOS[1].intent, catalogue);
    expect(outcome.counts.matchable).toBe(9);
    expect(outcome.rejected).toHaveLength(2);
  });
});

describe('multi-word keywords', () => {
  // Regression: live extraction returns phrases as often as single words
  // ("clean out", "Emergency Pipe Repair"). Compared whole against a single
  // word-token, a phrase could never match, so naming a real listing returned
  // nothing at all. Found against the live API, not by the tests above, which
  // had fed the matcher pre-split keywords.
  it('matches a phrase keyword the model returns as one string', () => {
    const outcome = matchListings(intent({ keywords: ['Emergency Pipe Repair'] }), catalogue);
    expect(ids(outcome.matches)).toEqual(['list_103', 'list_104']);
  });

  it('still refuses the rejected listing the phrase actually names', () => {
    const outcome = matchListings(intent({ keywords: ['Emergency Pipe Repair'] }), catalogue);
    expect(ids(outcome.matches)).not.toContain('list_114');
  });

  it('matches "clean out" against cleaning listings', () => {
    const outcome = matchListings(intent({ keywords: ['clean out'] }), catalogue);
    expect(outcome.matches.length).toBeGreaterThan(0);
    for (const id of ids(outcome.matches)) expect(matchableIds).toContain(id);
  });
});

describe('service-type coverage for multi-category requests', () => {
  // "clean out my garage and move some boxes" is the brief's own example, and
  // it is the demo query. On score alone it returns three cleaning listings
  // and no move: list_107 scores 4, then four candidates tie on 2 and the
  // price tie-break puts the cheap cleans ahead of the $200 move. A request
  // for two things answered with one is a wrong answer, not a cosmetic one.
  const spanning = intent({
    service_types: ['cleaning', 'moving'],
    keywords: ['clean out', 'garage', 'move', 'boxes'],
  });

  it('guarantees each requested type a place in the top three', () => {
    const matches = matchListings(spanning, catalogue).matches;
    const types = new Set(matches.map((match) => match.service_type));
    expect(types.has('cleaning')).toBe(true);
    expect(types.has('moving')).toBe(true);
    expect(matches.length).toBe(TOP_N);
  });

  it('keeps the best overall match first rather than reordering for coverage', () => {
    const matches = matchListings(spanning, catalogue).matches;
    // list_107 "Move-Out Deep Clean" is the only listing hitting both halves.
    expect(matches[0].listing_id).toBe('list_107');
    expect(matches[0].reason.keywordScore).toBe(4);
  });

  it('flags the reserved listing so the log does not imply it out-ranked others', () => {
    const matches = matchListings(spanning, catalogue).matches;
    const move = matches.find((match) => match.service_type === 'moving');
    expect(move?.reason.filters).toContain('service_type_coverage');

    // The listing that led on merit is not labelled as coverage.
    expect(matches[0].reason.filters).not.toContain('service_type_coverage');
  });

  it('still returns only listings from the validated set', () => {
    for (const id of ids(matchListings(spanning, catalogue).matches)) {
      expect(matchableIds).toContain(id);
      expect(rejectedIds).not.toContain(id);
    }
  });

  it('reserves nothing for a requested type the dataset cannot serve', () => {
    // No handyman listing mentions these words, so handyman burns no slot and
    // the three cleaning matches are returned instead of two.
    const outcome = matchListings(
      intent({ service_types: ['cleaning', 'handyman'], keywords: ['clean'] }),
      catalogue,
    );
    expect(outcome.matches.length).toBe(TOP_N);
    for (const match of outcome.matches) expect(match.service_type).toBe('cleaning');
  });

  it('leaves a single-type request completely untouched', () => {
    const single = intent({ service_types: ['cleaning'], keywords: ['clean'] });
    // Plain score/price/id order: every cleaning listing scores 2 on "clean"
    // alone, so the tie-break on price decides, and list_107 ($180) misses out.
    const before = ['list_108', 'list_102', 'list_110'];
    expect(ids(matchListings(single, catalogue).matches)).toEqual(before);
    for (const match of matchListings(single, catalogue).matches) {
      expect(match.reason.filters).not.toContain('service_type_coverage');
    }
  });

  it('leaves a no-type request completely untouched', () => {
    const none = intent({ keywords: ['clean'] });
    for (const match of matchListings(none, catalogue).matches) {
      expect(match.reason.filters).not.toContain('service_type_coverage');
    }
  });
});

describe('ordering is stable and explainable', () => {
  const scenario = SCENARIOS[0];

  it('returns the same order for the same intent', () => {
    const first = ids(matchListings(scenario.intent, catalogue).matches);
    const second = ids(matchListings(scenario.intent, catalogue).matches);
    expect(second).toEqual(first);
  });

  it('does not depend on the order listings arrive in', () => {
    const expected = ids(matchListings(scenario.intent, catalogue).matches);
    const reversed = ids(matchListings(scenario.intent, [...catalogue].reverse()).matches);
    expect(reversed).toEqual(expected);
  });

  it('breaks score ties by price, then by listing id', () => {
    const outcome = matchListings(intent({ keywords: ['clean'] }), catalogue);
    const scores = outcome.matches.map((match) => match.reason.keywordScore);
    expect(new Set(scores).size).toBe(1); // every match scored the same
    const prices = outcome.matches.map((match) => match.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe('availability is captured but never acted on', () => {
  it('never records an availability filter on a match', () => {
    for (const scenario of SCENARIOS) {
      for (const match of matchListings(scenario.intent, catalogue).matches) {
        expect(match.reason.filters).not.toContain('availability');
        expect(match.reason.filters).not.toContain('availability_hint');
      }
    }
  });

  it('returns identical results with and without a timing hint', () => {
    const withHint = intent({ keywords: ['clean'], availability_hint: 'tomorrow at 6am' });
    const withoutHint = intent({ keywords: ['clean'] });
    expect(ids(matchListings(withHint, catalogue).matches)).toEqual(
      ids(matchListings(withoutHint, catalogue).matches),
    );
  });

  it('says plainly that it could not search by time', () => {
    const outcome = matchListings(
      intent({ keywords: ['clean'], availability_hint: 'tomorrow at 6am' }),
      catalogue,
    );
    expect(outcome.explanation).toContain('could not search by time');
  });
});

describe('match reasons record only the filters that actually hit', () => {
  it('records service_type and max_price only when the user expressed them', () => {
    const constrained = matchListings(SCENARIOS[1].intent, catalogue).matches[0];
    expect(constrained.reason.filters).toEqual([
      'listing_status_active',
      'service_type',
      'max_price',
      'keyword',
    ]);

    const unconstrained = matchListings(intent({ keywords: ['clean'] }), catalogue).matches[0];
    expect(unconstrained.reason.filters).toEqual(['listing_status_active', 'keyword']);
  });
});

describe('the fabricated-listing guard', () => {
  it('throws when a match is not present in the dataset', () => {
    const invented = { ...matchListings(intent({ keywords: ['clean'] }), catalogue).matches[0] };
    invented.listing_id = 'list_999';
    expect(() => assertNoFabricatedListings([invented], matchable)).toThrow(FabricatedListingError);
  });

  it('passes for every real result', () => {
    for (const scenario of SCENARIOS) {
      const outcome = matchListings(scenario.intent, catalogue);
      expect(() => assertNoFabricatedListings(outcome.matches, matchable)).not.toThrow();
    }
  });
});

describe('price_type', () => {
  it('falls back to the schema default until the shared field lands', () => {
    // TODO(product-c): tighten this once CleanListing carries price_type.
    for (const match of matchListings(intent({ keywords: ['clean'] }), catalogue).matches) {
      expect(match.price_type).toBe('flat');
    }
  });
});
