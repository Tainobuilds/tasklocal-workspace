/**
 * POST /api/match — the matching chatbot's only endpoint.
 *
 * Deliberately thin. It parses the request, orchestrates four modules, and
 * shapes the response; it makes no matching decision of its own. Everything
 * worth testing lives in `@/lib/chat/*`, which is pure and runs without an API
 * key — a route that owned this logic could only be tested over HTTP.
 *
 * The catalogue is loaded before the intent is parsed so that a failed turn
 * still logs accurate dataset counts rather than zeros.
 */

import { NextResponse } from 'next/server';

import { parseIntent, IntentError, type IntentErrorCode } from '@/lib/chat/intent';
import { logTurn } from '@/lib/chat/log';
import {
  FabricatedListingError,
  matchListings,
  MATCHER_VERSION,
  selectMatchable,
} from '@/lib/chat/match';
import type {
  ConversationTurn,
  MatchErrorResponse,
  MatchRequest,
  MatchResponse,
} from '@/lib/chat/types';
import { getCatalogue } from '@/lib/server-data';

/** An IntentError code becomes the one status that describes it honestly. */
const STATUS_BY_INTENT_ERROR: Record<IntentErrorCode, number> = {
  invalid_input: 400,
  not_configured: 500,
  model_unavailable: 502,
  invalid_output: 502,
};

/**
 * Messages safe to show a customer. The underlying error text can name
 * internals, so it is logged server-side and not returned.
 */
const MESSAGE_BY_INTENT_ERROR: Record<IntentErrorCode, string> = {
  invalid_input: 'Send a message between 1 and 8000 characters.',
  not_configured: 'Matching is not configured on this server.',
  model_unavailable: 'Could not read that request just now. Try again in a moment.',
  invalid_output: 'Could not read that request just now. Try again in a moment.',
};

function fail(status: number, error: string): NextResponse<MatchErrorResponse> {
  return NextResponse.json({ error }, { status });
}

/** Accepts only well-formed turns; `intent.ts` filters the rest. */
function readHistory(raw: unknown): ConversationTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (turn): turn is ConversationTurn =>
      !!turn &&
      typeof turn === 'object' &&
      typeof (turn as ConversationTurn).content === 'string' &&
      ((turn as ConversationTurn).role === 'user' ||
        (turn as ConversationTurn).role === 'assistant'),
  );
}

export async function POST(request: Request): Promise<NextResponse<MatchResponse | MatchErrorResponse>> {
  let body: MatchRequest;
  try {
    body = (await request.json()) as MatchRequest;
  } catch {
    return fail(400, 'Request body must be JSON.');
  }

  if (!body || typeof body !== 'object' || typeof body.message !== 'string') {
    return fail(400, 'Request body must include a "message" string.');
  }

  const message = body.message;
  const history = readHistory(body.conversationHistory);

  // Loaded first so a failed turn still logs what the dataset looked like.
  // getCatalogue never throws; a read failure yields an empty catalogue.
  const { listings, issues } = await getCatalogue();

  // Resolved once, up front, and used on BOTH the success and failure paths.
  // Deriving these separately per branch made the same log field mean two
  // different things depending on which branch ran, which is exactly the kind
  // of inconsistency that quietly corrupts a training corpus.
  const { matchable, rejected: policyRejections } = selectMatchable(listings);

  /** The guard set: only a listing Product C would actually serve. */
  const validListingIds = new Set(matchable.map((listing) => listing.listing_id));

  const matchableCount = matchable.length;

  /** Data-quality exclusions: the sanitizer's drops plus Product C's. */
  const rejectedCount =
    issues.filter((issue) => issue.scope === 'listing' && issue.severity === 'dropped').length +
    policyRejections.length;

  let parsed;
  try {
    parsed = await parseIntent(message, history);
  } catch (error) {
    const code = error instanceof IntentError ? error.code : 'model_unavailable';
    console.error('[tasklocal:match] intent extraction failed:', error);

    // The turn is logged rather than dropped: a corpus that records only the
    // successes understates the real error rate.
    logTurn(
      {
        rawMessage: message,
        intentStatedThisTurn: null,
        intentEffective: null,
        inheritedFields: [],
        intentSource: 'error',
        model: null,
        promptVersion: null,
        matcherVersion: MATCHER_VERSION,
        matches: [],
        matchableCount,
        rejectedCount,
        error: { code, message: error instanceof Error ? error.message : String(error) },
      },
      validListingIds,
    );

    return fail(STATUS_BY_INTENT_ERROR[code], MESSAGE_BY_INTENT_ERROR[code]);
  }

  const { intent } = parsed;

  let outcome;
  try {
    outcome = matchListings(intent, listings);
  } catch (error) {
    // Only FabricatedListingError should be able to land here, and it means a
    // listing that does not exist nearly reached a customer. Fail the request.
    if (error instanceof FabricatedListingError) {
      console.error('[tasklocal:match] CRITICAL: matcher produced unknown listing ids:', error);
      return fail(500, 'Matching failed.');
    }
    console.error('[tasklocal:match] matching failed:', error);
    return fail(500, 'Matching failed.');
  }

  try {
    logTurn(
      {
        rawMessage: message,
        intentStatedThisTurn: intent,
        // Equal by construction: Product C does not carry an unrepeated
        // constraint forward, so no field is ever inherited.
        intentEffective: intent,
        inheritedFields: [],
        intentSource: parsed.source,
        model: parsed.model,
        promptVersion: parsed.promptVersion,
        matcherVersion: MATCHER_VERSION,
        matches: outcome.matches,
        matchableCount,
        rejectedCount,
        error: null,
      },
      validListingIds,
    );
  } catch (error) {
    // The log guard found an id outside the dataset. The matcher's own guard
    // should have caught it first, so refuse to serve the response.
    console.error('[tasklocal:match] CRITICAL: refusing to serve unlogged matches:', error);
    return fail(500, 'Matching failed.');
  }

  return NextResponse.json({
    intent,
    matches: outcome.matches,
    rejectedCount,
    explanation: outcome.explanation,
  });
}
