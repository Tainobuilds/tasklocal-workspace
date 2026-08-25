/**
 * Step 2 of matching: choose the results, deterministically, in code.
 *
 * This module is pure — no network, no filesystem, no clock. It receives the
 * listings and an already-extracted `Intent` and decides everything else. The
 * model never reaches this far: it supplied the search terms, and this file
 * supplies the results. That split is the hard rule, and keeping this module
 * pure is what makes it verifiable without an API key.
 *
 * It also applies Product C's stricter data policy on top of the shared
 * sanitizer. `sanitizeListings` repairs a bad field to `null` and keeps the
 * record; the agreed SQL schema declares those same columns NOT NULL, so for
 * matching purposes a null in any of them is a rejection. See
 * `selectMatchable`.
 */

import { slotKey } from '@/lib/sanitize';
import type { CleanListing } from '@/lib/types';

import type { Intent, Match, MatchFilter, MatchReason, PriceType } from './types';

/**
 * Bumped whenever filtering, scoring or ordering changes.
 *
 * Logged with every turn: a replayed ranking is only comparable to a stored
 * one if you know the two came from the same matcher.
 */
export const MATCHER_VERSION = 'matcher-v1';

/** The brief asks for the top three. */
export const TOP_N = 3;

/**
 * A hit in the title says more about the job than a hit in the body copy.
 * Kept as named constants because they are the whole ranking model — if
 * ordering ever looks wrong, this is the first thing to read.
 */
const TITLE_WEIGHT = 2;
const DESCRIPTION_WEIGHT = 1;

/**
 * Prefix matching is only allowed for stems this long, so that short words
 * ("tv", "fan") must match exactly and cannot prefix-match half the corpus.
 */
const MIN_STEM_LENGTH = 4;

/**
 * TEMPORARY LOCAL FALLBACK — the schema default for `listings.price_type`.
 *
 * TODO(product-c): the shared `CleanListing` carries no `price_type` and
 * `sanitizeListings` drops the field, so Product C cannot currently learn a
 * listing's real price type. An additive change to add it to `src/lib/types.ts`
 * and populate it in `src/lib/sanitize.ts` is pending Product B's owner.
 *
 * Correct for the dataset as it stands today — no record carries a
 * `price_type`, so the SQL default applies to all of them. It stops being
 * correct the moment anyone publishes an hourly listing, which would then be
 * presented as a flat price. Delete this constant when the shared field lands.
 */
export const PRICE_TYPE_FALLBACK: PriceType = 'flat';

/**
 * Why Product C refused a listing the shared sanitizer was willing to keep.
 *
 * Machine-readable, and deliberately coarser than the SQL constraint names for
 * `price`: `sanitizeListings` collapses absent, negative and non-numeric into
 * the same `null`, so by the time we see it the original cause is gone. The
 * code names what is actually observable rather than guessing which
 * constraint was violated.
 */
export type RejectionReason =
  | 'price_missing_or_invalid'
  | 'description_missing'
  | 'provider_id_missing'
  | 'provider_foreign_key_unresolved'
  | 'provider_name_missing';

export interface RejectedListing {
  listing_id: string;
  /** Every reason the record failed, never just the first one found. */
  reasons: RejectionReason[];
}

/** A listing that satisfied every NOT NULL column and is safe to return. */
export interface MatchableListing {
  listing_id: string;
  title: string;
  description: string;
  service_type: CleanListing['service_type'];
  price: number;
  provider_name: string;
  availability: string[];
}

/** How many candidates survived each stage. Drives the empty-state advice. */
export interface FilterCounts {
  /** Active listings that passed Product C's data policy. */
  matchable: number;
  afterServiceType: number;
  afterMaxPrice: number;
  afterKeyword: number;
}

export interface MatchOutcome {
  matches: Match[];
  rejected: RejectedListing[];
  counts: FilterCounts;
  explanation: string;
}

/**
 * Raised when a returned listing is not one that was passed in.
 *
 * This should be structurally impossible — matches are built from the input
 * array — so it exists to make a future refactor fail loudly instead of
 * quietly serving a listing that does not exist.
 */
export class FabricatedListingError extends Error {
  constructor(readonly listingIds: string[]) {
    super(`Match result contained listing ids absent from the dataset: ${listingIds.join(', ')}`);
    this.name = 'FabricatedListingError';
  }
}

/**
 * Applies Product C's data contract on top of the shared sanitizer.
 *
 * Every rejection carries a reason and nothing is dropped silently. All
 * reasons are collected: `list_113` fails on both a missing description and an
 * unresolvable provider, and a log that recorded only the first would
 * understate the damage in that record.
 */
export function selectMatchable(listings: readonly CleanListing[]): {
  matchable: MatchableListing[];
  rejected: RejectedListing[];
} {
  const matchable: MatchableListing[] = [];
  const rejected: RejectedListing[] = [];

  for (const listing of listings) {
    const reasons: RejectionReason[] = [];

    if (listing.price === null) reasons.push('price_missing_or_invalid');
    if (listing.description === null) reasons.push('description_missing');

    if (listing.provider_id === null) {
      reasons.push('provider_id_missing');
    } else if (listing.provider === null) {
      reasons.push('provider_foreign_key_unresolved');
    } else if (listing.provider.provider_name === null) {
      reasons.push('provider_name_missing');
    }

    if (reasons.length > 0) {
      rejected.push({ listing_id: listing.listing_id, reasons });
      continue;
    }

    matchable.push({
      listing_id: listing.listing_id,
      title: listing.title,
      // The null checks above narrow these, but TypeScript cannot see that
      // across the loop, so they are re-asserted rather than re-tested.
      description: listing.description as string,
      service_type: listing.service_type,
      price: listing.price as number,
      provider_name: listing.provider?.provider_name as string,
      availability: listing.availability.map(slotKey),
    });
  }

  return { matchable, rejected };
}

/** Lowercases and splits on anything that is not a letter or digit. */
function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

/**
 * True when a keyword and a token are the same word.
 *
 * Prefix matching runs in both directions so that "cleaning" finds "clean" and
 * "clean" finds "cleaning" — without it, the single most common query in this
 * marketplace would miss half the catalogue on a suffix. Guarded by
 * MIN_STEM_LENGTH so short words still have to match exactly.
 */
function isWordMatch(keyword: string, token: string): boolean {
  if (keyword === token) return true;
  if (keyword.length >= MIN_STEM_LENGTH && token.startsWith(keyword)) return true;
  if (token.length >= MIN_STEM_LENGTH && keyword.startsWith(token)) return true;
  return false;
}

/**
 * Scores one listing against the keywords.
 *
 * Each keyword contributes at most once, at its best location, so a listing
 * that repeats a word does not out-rank one that genuinely covers more of the
 * request.
 */
function scoreKeywords(
  listing: MatchableListing,
  keywords: readonly string[],
): { score: number; matched: string[] } {
  const titleTokens = tokenize(listing.title);
  const descriptionTokens = tokenize(listing.description);

  let score = 0;
  const matched: string[] = [];

  for (const keyword of keywords) {
    const needle = keyword.toLowerCase();
    if (titleTokens.some((token) => isWordMatch(needle, token))) {
      score += TITLE_WEIGHT;
      matched.push(keyword);
    } else if (descriptionTokens.some((token) => isWordMatch(needle, token))) {
      score += DESCRIPTION_WEIGHT;
      matched.push(keyword);
    }
  }

  return { score, matched };
}

/** True when the user expressed nothing this module can search on. */
export function isUnsearchableIntent(intent: Intent): boolean {
  return (
    intent.service_type === null && intent.max_price === null && intent.keywords.length === 0
  );
}

function buildExplanation(
  intent: Intent,
  counts: FilterCounts,
  matchCount: number,
): string {
  // Stated but never applied — saying so is the honest alternative to letting
  // the result imply we searched by time. See Intent.availability_hint.
  const timeCaveat =
    intent.availability_hint === null
      ? ''
      : ` I could not search by time, so check each listing's availability for "${intent.availability_hint}".`;

  if (matchCount > 0) {
    const noun = matchCount === 1 ? 'listing' : 'listings';
    return `Found ${matchCount} ${noun} from ${counts.matchable} currently active.${timeCaveat}`;
  }

  if (isUnsearchableIntent(intent)) {
    return `I did not catch what you need.${timeCaveat} Describe the job — for example "deep clean a 2-bedroom flat" or "move a sofa across town".`;
  }

  // Report the first stage that emptied the pool: that is the constraint worth
  // loosening, and it is derived from the counters rather than guessed.
  if (intent.service_type !== null && counts.afterServiceType === 0) {
    return `No active ${intent.service_type} listings at all right now.${timeCaveat} Try a different kind of service.`;
  }
  if (intent.max_price !== null && counts.afterMaxPrice === 0) {
    const scope = intent.service_type === null ? 'listings' : `${intent.service_type} listings`;
    return `No active ${scope} at or under $${intent.max_price}.${timeCaveat} Try raising the budget.`;
  }
  if (intent.keywords.length > 0 && counts.afterKeyword === 0) {
    return `Nothing active matches ${intent.keywords.map((k) => `"${k}"`).join(', ')}.${timeCaveat} Try describing the job in different words.`;
  }

  return `No active listings match that.${timeCaveat} Try loosening one of your constraints.`;
}

/**
 * Runs the agreed filter chain and returns the top three.
 *
 * Order of filters is fixed and matches the contract: active status (already
 * applied upstream by the shared catalogue), then service type, then price,
 * then keyword score.
 *
 * Ordering is score descending, then price ascending, then listing id — fully
 * deterministic, and explainable as "best match first; on a tie, the cheaper
 * one; on a further tie, stable by id".
 */
export function matchListings(intent: Intent, listings: readonly CleanListing[]): MatchOutcome {
  const { matchable, rejected } = selectMatchable(listings);

  const counts: FilterCounts = {
    matchable: matchable.length,
    afterServiceType: matchable.length,
    afterMaxPrice: matchable.length,
    afterKeyword: matchable.length,
  };

  // An intent with nothing searchable in it returns nothing. Falling through
  // to "cheapest three" would present arbitrary listings as if we had
  // understood the request.
  if (isUnsearchableIntent(intent)) {
    return {
      matches: [],
      rejected,
      counts: { ...counts, afterServiceType: 0, afterMaxPrice: 0, afterKeyword: 0 },
      explanation: buildExplanation(intent, counts, 0),
    };
  }

  let pool = matchable;

  if (intent.service_type !== null) {
    pool = pool.filter((listing) => listing.service_type === intent.service_type);
  }
  counts.afterServiceType = pool.length;

  if (intent.max_price !== null) {
    const limit = intent.max_price;
    pool = pool.filter((listing) => listing.price <= limit);
  }
  counts.afterMaxPrice = pool.length;

  let scored = pool.map((listing) => ({ listing, ...scoreKeywords(listing, intent.keywords) }));

  // When keywords were expressed, a listing must actually hit one. Without
  // this, a nonsense request would still be answered with real listings.
  if (intent.keywords.length > 0) {
    scored = scored.filter((entry) => entry.score > 0);
  }
  counts.afterKeyword = scored.length;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.listing.price !== b.listing.price) return a.listing.price - b.listing.price;
    return a.listing.listing_id.localeCompare(b.listing.listing_id);
  });

  const matches: Match[] = scored.slice(0, TOP_N).map((entry) => ({
    listing_id: entry.listing.listing_id,
    title: entry.listing.title,
    description: entry.listing.description,
    service_type: entry.listing.service_type,
    price: entry.listing.price,
    price_type: PRICE_TYPE_FALLBACK,
    provider_name: entry.listing.provider_name,
    availability: entry.listing.availability,
    reason: buildReason(intent, entry.score, entry.matched),
  }));

  assertNoFabricatedListings(matches, matchable);

  return { matches, rejected, counts, explanation: buildExplanation(intent, counts, matches.length) };
}

/**
 * Records only the filters that actually constrained this result, in the order
 * they were applied. Note there is no availability member to record.
 */
function buildReason(intent: Intent, score: number, matched: string[]): MatchReason {
  const filters: MatchFilter[] = ['listing_status_active'];
  if (intent.service_type !== null) filters.push('service_type');
  if (intent.max_price !== null) filters.push('max_price');
  if (score > 0) filters.push('keyword');
  return { filters, keywordScore: score, matchedKeywords: matched };
}

/**
 * Guards the critical invariant: every returned listing exists in the dataset
 * we were given. Called before any result leaves this module.
 */
export function assertNoFabricatedListings(
  matches: readonly Match[],
  known: readonly MatchableListing[],
): void {
  const knownIds = new Set(known.map((listing) => listing.listing_id));
  const fabricated = matches
    .map((match) => match.listing_id)
    .filter((id) => !knownIds.has(id));
  if (fabricated.length > 0) throw new FabricatedListingError(fabricated);
}
