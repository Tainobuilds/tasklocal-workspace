/**
 * Wire contract for Product C (the matching chatbot).
 *
 * This is the one place the browser, the route handler and the matcher agree
 * on shapes. It holds types only — no logic, no I/O — so `chat/page.tsx` can
 * import the response type without pulling server modules (or the Anthropic
 * SDK) into the client bundle.
 *
 * Marketplace types are read from the shared `@/lib/types` and never redefined
 * here. Product C owns the conversation contract; it does not own the domain.
 */

import type { ServiceType } from '@/lib/types';

/**
 * How a listing's price should be read, mirroring `listings.price_type` in the
 * agreed SQL schema.
 *
 * TODO(product-c): the shared `CleanListing` in `src/lib/types.ts` carries no
 * `price_type`, and `sanitizeListings` drops the field, so Product C cannot
 * currently learn a listing's real price type. An additive change to add it
 * there is pending Product B's owner. Until that lands, `match.ts` applies the
 * schema default 'flat' locally (`PRICE_TYPE_FALLBACK`). Consequence: a
 * genuinely hourly listing would be presented as a flat price.
 */
export type PriceType = 'flat' | 'hourly';

/** One earlier message in the conversation, as replayed by the browser. */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * `POST /api/match` request body.
 *
 * `conversationHistory` is Product C's own shape rather than the Anthropic
 * SDK's `MessageParam`, so the SDK stays behind the server boundary and the
 * browser is not coupled to a vendor type. `intent.ts` maps between them.
 */
export interface MatchRequest {
  message: string;
  conversationHistory?: ConversationTurn[];
}

/**
 * The search terms the model extracted from one user message.
 *
 * This is a record of what the user actually expressed, and it is logged as
 * training-grade data — so every field is held to that standard:
 *
 * - `null` means "the user did not express this". It never means unknown,
 *   unlimited, or a default. Nothing downstream may coerce a null to a value.
 * - The model supplies these terms; it never chooses results. See `match.ts`.
 */
export interface Intent {
  /**
   * Every category this message asked for, from the team's agreed
   * `SERVICE_TYPES`.
   *
   * `[]` means the user named none. One entry means one. Two or more means
   * the request genuinely spans categories ("clean out my garage and move
   * some boxes"), which the matcher honours by guaranteeing each requested
   * type a place in the results.
   *
   * A single nullable `service_type` cannot express that third case: it would
   * have to record `null` — "the user expressed nothing" — for a request that
   * expressed two things, which is exactly the kind of false record this log
   * must not contain.
   */
  service_types: ServiceType[];
  /**
   * An upper price bound in USD, only when the user stated one.
   * The model is forbidden from inferring a budget from words like "cheap".
   */
  max_price: number | null;
  /**
   * Concrete terms drawn from the user's own words, scored against listing
   * title + description. An empty array means the user expressed no usable
   * keywords — unambiguous on its own, so this field is not nullable.
   */
  keywords: string[];
  /**
   * A timing expression the user made ("this weekend", "3am"), or null.
   *
   * Captured but deliberately NOT used as a filter: the agreed filter chain is
   * status -> service_type -> price -> keyword. Nothing downstream may claim a
   * match honoured this, and `MatchFilter` has no availability member so it
   * cannot be claimed by accident.
   */
  availability_hint: string | null;
}

/**
 * A filter that actually constrained a given match.
 *
 * Machine-readable on purpose: this is what gets logged, so replayed rankings
 * stay comparable. The human "why this matched" sentence is derived from these
 * codes at render time and is never stored.
 *
 * There is intentionally no availability member — see `Intent.availability_hint`.
 */
export type MatchFilter =
  | 'listing_status_active'
  | 'service_type'
  | 'max_price'
  | 'keyword'
  /**
   * This listing holds the slot reserved for one of the requested service
   * types. Recorded separately because it did not earn its rank on score
   * alone, and a ranking model trained on this log would otherwise learn the
   * wrong signal from its position.
   */
  | 'service_type_coverage';

export interface MatchReason {
  /** Filters this listing actually satisfied, in the order they were applied. */
  filters: MatchFilter[];
  /** Keyword score over title + description. 0 when no keywords were expressed. */
  keywordScore: number;
  /** The keywords that actually hit, for an honest, specific explanation. */
  matchedKeywords: string[];
}

/**
 * One returned listing.
 *
 * Every field is carried explicitly rather than nesting a `CleanListing`, so
 * the browser receives exactly what it renders and nothing more. `price`,
 * `description` and `provider_name` are non-nullable here because a null in
 * any of them violates a NOT NULL column in the agreed schema, and `match.ts`
 * rejects such a record before it can become a `Match`.
 */
export interface Match {
  listing_id: string;
  title: string;
  description: string;
  service_type: ServiceType;
  price: number;
  price_type: PriceType;
  provider_name: string;
  /** Pre-formatted slot labels, e.g. ["Mon AM", "Wed PM"]. May be empty. */
  availability: string[];
  reason: MatchReason;
}

/** `POST /api/match` success body. */
export interface MatchResponse {
  /** The intent that actually drove this search. */
  intent: Intent;
  /** At most three listings, best first. Every id exists in the live dataset. */
  matches: Match[];
  /**
   * Listings excluded for data quality — dropped by the shared sanitizer plus
   * those Product C rejected for violating a NOT NULL / CHECK column.
   *
   * Does NOT count flagged or removed listings: those are a business state,
   * not dirty data, and counting them would overstate the data problem.
   */
  rejectedCount: number;
  /** One honest sentence about what was searched, or why nothing came back. */
  explanation: string;
}

/** `POST /api/match` failure body. */
export interface MatchErrorResponse {
  error: string;
}
