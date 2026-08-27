/**
 * Session-scoped persistence for the chat transcript.
 *
 * Purpose is narrow: clicking a result card navigates to Product B's listing
 * page, and coming back must not have thrown the conversation away. That is a
 * UI convenience and nothing more.
 *
 * It is NOT part of the turn log. `logTurn` runs server-side in the route
 * handler and records the raw message, the intent, the matches and the dataset
 * counts — it does not record `conversationHistory`, so nothing here can
 * change what is logged or what a logged field means. The one thing this
 * module owes the log is faithfulness: `send` replays the restored turns as
 * `conversationHistory`, so a half-restored transcript would put words in the
 * user's mouth on the next request. Hence all-or-nothing — see `parseTranscript`.
 *
 * sessionStorage, not localStorage, and deliberately: the transcript dies with
 * the tab and never crosses between sessions or windows.
 */

import { SERVICE_TYPES, type ServiceType } from '@/lib/types';

import type { Intent, Match, MatchFilter, PriceType } from './types';

export const TRANSCRIPT_KEY = 'tasklocal_chat_transcript';

/**
 * Bumped whenever the stored shape changes. A transcript written by an older
 * build is discarded rather than guessed at — see `parseTranscript`.
 */
export const TRANSCRIPT_VERSION = 1;

export interface UserTurn {
  role: 'user';
  content: string;
}

export interface AssistantTurn {
  role: 'assistant';
  /** The explanation from the API, or the error text. Never invented. */
  content: string;
  matches: Match[];
  intent: Intent | null;
  failed: boolean;
}

export type Turn = UserTurn | AssistantTurn;

interface StoredTranscript {
  version: number;
  turns: Turn[];
}

/**
 * The slice of the Storage API this module uses.
 *
 * Declared structurally rather than as `Storage` so a test can pass a fake —
 * including one that throws, which is what a real browser does when storage is
 * disabled or the quota is gone.
 */
export interface TranscriptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The tab's sessionStorage, or `null` when there isn't one.
 *
 * Merely *touching* `window.sessionStorage` throws in a browser configured to
 * block site data, so even the access is guarded. Returning null here is what
 * makes the caller's degradation path a normal branch rather than an error.
 */
export function defaultStorage(): TranscriptStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServiceType(value: unknown): value is ServiceType {
  return SERVICE_TYPES.includes(value as ServiceType);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

const PRICE_TYPES: readonly PriceType[] = ['flat', 'hourly'];

const MATCH_FILTERS: readonly MatchFilter[] = [
  'listing_status_active',
  'service_type',
  'max_price',
  'keyword',
  'service_type_coverage',
];

/**
 * Validates one match down to every field the card renders.
 *
 * Thorough on purpose. `ChatListingCard` turns `listing_id` into a link to
 * `/listings/[listingId]`, so a record reaching the card is a record deciding
 * where a customer is sent. Anything less than a full shape check would let a
 * hand-edited sessionStorage entry put a listing on screen that the matcher
 * never returned — the exact property `chat/page.tsx` claims to hold.
 */
function isMatch(value: unknown): value is Match {
  if (!isRecord(value)) return false;

  if (typeof value.listing_id !== 'string' || value.listing_id.length === 0) return false;
  if (typeof value.title !== 'string') return false;
  if (typeof value.description !== 'string') return false;
  if (!isServiceType(value.service_type)) return false;
  if (typeof value.price !== 'number' || !Number.isFinite(value.price)) return false;
  if (!PRICE_TYPES.includes(value.price_type as PriceType)) return false;
  if (typeof value.provider_name !== 'string') return false;
  if (!isStringArray(value.availability)) return false;

  const reason = value.reason;
  if (!isRecord(reason)) return false;
  if (!Array.isArray(reason.filters)) return false;
  if (!reason.filters.every((filter) => MATCH_FILTERS.includes(filter as MatchFilter))) return false;
  if (typeof reason.keywordScore !== 'number' || !Number.isFinite(reason.keywordScore)) return false;
  if (!isStringArray(reason.matchedKeywords)) return false;

  return true;
}

/**
 * Validates an intent.
 *
 * `max_price` and `availability_hint` are nullable and their null carries
 * meaning — "the user did not express this" — so null is accepted while
 * `undefined` and a missing key are not. A transcript that lost that
 * distinction would restore an intent the user never stated.
 */
function isIntent(value: unknown): value is Intent {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.service_types) || !value.service_types.every(isServiceType)) return false;
  if (
    value.max_price !== null &&
    (typeof value.max_price !== 'number' || !Number.isFinite(value.max_price))
  ) {
    return false;
  }
  if (!isStringArray(value.keywords)) return false;
  if (value.availability_hint !== null && typeof value.availability_hint !== 'string') return false;
  return true;
}

function isTurn(value: unknown): value is Turn {
  if (!isRecord(value)) return false;
  if (typeof value.content !== 'string') return false;

  if (value.role === 'user') return true;

  if (value.role === 'assistant') {
    if (typeof value.failed !== 'boolean') return false;
    if (!Array.isArray(value.matches) || !value.matches.every(isMatch)) return false;
    if (value.intent !== null && !isIntent(value.intent)) return false;
    return true;
  }

  return false;
}

/**
 * Parses a stored transcript, or returns `[]` for anything it cannot vouch for.
 *
 * All-or-nothing: one bad turn discards the whole transcript rather than that
 * turn. A conversation with a hole in it is not a shorter version of what was
 * said, it is a different conversation — and it is the one that would be
 * replayed to the model as `conversationHistory` on the next request.
 *
 * Never throws. Malformed JSON, a wrong version, a truncated write, a value
 * left by something else on this origin — all land on the same empty
 * conversation the user would have had anyway.
 */
export function parseTranscript(raw: string | null): Turn[] {
  if (raw === null || raw.length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!isRecord(parsed)) return [];
  if (parsed.version !== TRANSCRIPT_VERSION) return [];
  if (!Array.isArray(parsed.turns)) return [];
  if (!parsed.turns.every(isTurn)) return [];

  return parsed.turns as Turn[];
}

/** The stored form. Versioned so a future shape change discards rather than guesses. */
export function serializeTranscript(turns: readonly Turn[]): string {
  const stored: StoredTranscript = { version: TRANSCRIPT_VERSION, turns: turns as Turn[] };
  return JSON.stringify(stored);
}

/**
 * Reads the transcript for this tab. Returns `[]` when there is none, when
 * storage is unavailable, or when what is stored does not parse.
 */
export function readTranscript(storage: TranscriptStorage | null = defaultStorage()): Turn[] {
  if (storage === null) return [];
  try {
    return parseTranscript(storage.getItem(TRANSCRIPT_KEY));
  } catch {
    // getItem itself can throw in a browser blocking site data.
    return [];
  }
}

/**
 * Writes the transcript for this tab, quietly doing nothing if it cannot.
 *
 * A failed write costs the user their conversation on the next navigation,
 * which is exactly what they had before this existed. Not worth an error.
 */
export function writeTranscript(
  turns: readonly Turn[],
  storage: TranscriptStorage | null = defaultStorage(),
): void {
  if (storage === null) return;
  try {
    if (turns.length === 0) {
      storage.removeItem(TRANSCRIPT_KEY);
      return;
    }
    storage.setItem(TRANSCRIPT_KEY, serializeTranscript(turns));
  } catch {
    // Quota exceeded, storage disabled mid-session, private-mode quirks.
  }
}

/* --------------------------------------------------------------------------
 * The store the page subscribes to.
 *
 * sessionStorage is external state, so the page reads it through
 * `useSyncExternalStore` rather than restoring it in an effect. That is what
 * keeps the first client render identical to the server's — `serverSnapshot`
 * is always empty, because the server has no tab to have a transcript in —
 * without a post-mount setState cascade.
 *
 * The cached snapshot is deliberately module-level: it is tab-scoped state
 * mirroring tab-scoped storage, and it means returning from a listing page
 * restores the conversation from memory without re-reading storage at all.
 * -------------------------------------------------------------------------- */

/** Stable empty reference. A fresh [] each call would loop the store. */
const EMPTY: readonly Turn[] = Object.freeze([]);

let snapshot: readonly Turn[] | null = null;
const listeners = new Set<() => void>();

export function subscribeTranscript(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The current transcript, read through on first use and cached after.
 *
 * Must return the same reference until something actually changes, or
 * `useSyncExternalStore` will re-render forever.
 */
export function getTranscriptSnapshot(): readonly Turn[] {
  if (snapshot === null) {
    const restored = readTranscript();
    snapshot = restored.length === 0 ? EMPTY : restored;
  }
  return snapshot;
}

/** There is no sessionStorage on the server, so the first paint is empty. */
export function getTranscriptServerSnapshot(): readonly Turn[] {
  return EMPTY;
}

/** Replaces the transcript, persists it, and notifies subscribers. */
export function setTranscript(turns: readonly Turn[]): void {
  snapshot = turns.length === 0 ? EMPTY : turns;
  writeTranscript(snapshot);
  for (const listener of listeners) listener();
}

/**
 * Appends one turn to whatever is current.
 *
 * Reads the snapshot at call time rather than closing over it, which is what
 * the functional form of `setState` was doing before: two turns appended in
 * the same tick must not drop the first.
 */
export function appendTurn(turn: Turn): void {
  setTranscript([...getTranscriptSnapshot(), turn]);
}

/** Drops the cached snapshot so the next read hits storage again. For tests. */
export function resetTranscriptCache(): void {
  snapshot = null;
}
