/**
 * The turn log for Product C.
 *
 * WHAT THIS DATA IS FOR — the rules below only make sense against these uses:
 *   1. Training and evaluating an intent parser (message -> structured intent)
 *      and a retrieval model (message -> the right listings).
 *   2. Offline regression of the matcher: replay stored turns and diff the
 *      rankings after a code change.
 *   3. Supply analytics: the zero-match rate, and which constraint most often
 *      empties the pool — which is really a question about missing supply.
 *
 * THE ACCURACY RULES THAT FOLLOW:
 *   - The raw message is stored verbatim. No trim, no lowercase, no truncation
 *     (use 1 needs the exact model input to be reproducible).
 *   - A null intent field means "the user did not express this". Never a
 *     default, never a zero. Nothing may coerce it.
 *   - Failed turns are logged, not swallowed. A corpus that only records
 *     successes hides the real error rate.
 *   - Filters are recorded as codes plus the numeric score, never as the prose
 *     shown in the UI, because use 2 cannot diff prose.
 *   - `matcherVersion` and `promptVersion` are always present, or a replayed
 *     comparison means nothing.
 *   - Every returned listing id is checked against the live dataset before the
 *     record is written.
 *
 * PII WARNING: `rawMessage` is user-authored free text and will contain
 * addresses, names and phone numbers ("move my stuff to 42 Oak St"). Storing
 * it verbatim is right for reproducibility and means THIS LOG MUST BE SCRUBBED
 * BEFORE IT TRAINS ANYTHING. Product C records the requirement; it does not
 * solve it.
 *
 * SINK: one JSON object per line on stdout. Deliberately not a file in `data/`
 * — four people share this repo and an append-per-turn file would generate
 * constant merge conflicts. Swapping in a real sink means changing `emit`.
 */

import type { Intent, Match } from './types';

/** Bumped when the shape below changes, so old and new records stay sortable. */
export const LOG_SCHEMA_VERSION = 'turn-v2';

/** Per-match filter evidence, in machine-readable form. */
export interface LoggedMatch {
  listing_id: string;
  filters: string[];
  keywordScore: number;
  matchedKeywords: string[];
}

export interface TurnLogInput {
  /** Verbatim, exactly as received. */
  rawMessage: string;
  /** What the user expressed on this turn. Null when extraction failed. */
  intentStatedThisTurn: Intent | null;
  /**
   * The intent that actually drove the search.
   *
   * Equal to `intentStatedThisTurn` today: Product C does not carry unrepeated
   * constraints forward, so `inheritedFields` is always empty. Both are stored
   * anyway — if carry-forward is ever added, records from before and after the
   * change stay directly comparable instead of silently changing meaning.
   */
  intentEffective: Intent | null;
  /** Intent fields inherited from earlier turns. Always [] today. */
  inheritedFields: string[];
  intentSource: 'model' | 'error';
  model: string | null;
  promptVersion: string | null;
  matcherVersion: string;
  matches: readonly Match[];
  /** Active listings that passed Product C's data policy for this turn. */
  matchableCount: number;
  /** Listings excluded for data quality. Excludes flagged/removed. */
  rejectedCount: number;
  error: { code: string; message: string } | null;
}

export interface TurnLogRecord extends Omit<TurnLogInput, 'matches'> {
  event: 'match_turn';
  schemaVersion: string;
  timestamp: string;
  rawMessageLength: number;
  returnedListingIds: string[];
  matches: LoggedMatch[];
}

/**
 * Raised when a turn would log a listing id that is not in the live dataset.
 *
 * The same invariant `match.ts` guards, re-checked at the log boundary: a
 * fabricated id reaching the training corpus is worse than a failed request,
 * because nothing downstream will ever know it was wrong.
 */
export class UnknownListingLoggedError extends Error {
  constructor(readonly listingIds: string[]) {
    super(`Refusing to log listing ids absent from the dataset: ${listingIds.join(', ')}`);
    this.name = 'UnknownListingLoggedError';
  }
}

/** The single write point. Replace this to send turns somewhere real. */
function emit(record: TurnLogRecord): void {
  console.log(JSON.stringify(record));
}

/**
 * Writes one turn.
 *
 * `validListingIds` is the set of ids in the dataset this turn actually
 * searched. Passing it is required rather than optional, so the check cannot
 * be skipped by forgetting an argument.
 */
export function logTurn(input: TurnLogInput, validListingIds: ReadonlySet<string>): void {
  const returnedListingIds = input.matches.map((match) => match.listing_id);

  const unknown = returnedListingIds.filter((id) => !validListingIds.has(id));
  if (unknown.length > 0) throw new UnknownListingLoggedError(unknown);

  const { matches, ...rest } = input;

  emit({
    event: 'match_turn',
    schemaVersion: LOG_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    ...rest,
    rawMessageLength: input.rawMessage.length,
    returnedListingIds,
    matches: matches.map((match) => ({
      listing_id: match.listing_id,
      filters: match.reason.filters,
      keywordScore: match.reason.keywordScore,
      matchedKeywords: match.reason.matchedKeywords,
    })),
  });
}
