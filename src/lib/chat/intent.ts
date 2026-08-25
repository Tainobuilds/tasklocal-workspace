/**
 * Step 1 of matching: turn one user message into structured search terms.
 *
 * This module holds the only Anthropic call in Product C, and it deliberately
 * cannot see the listing dataset. That is how the hard rule is enforced
 * structurally rather than by discipline: the model chooses the SEARCH TERMS,
 * `match.ts` chooses the RESULTS. A module with no access to listings cannot
 * invent one.
 *
 * The JSON shape is guaranteed by the API's structured outputs
 * (`output_config.format`), not by asking the model nicely for "no markdown
 * fences". The system prompt is left to carry the rules structured outputs
 * cannot express — above all, that an unstated price must stay null.
 */

import Anthropic from '@anthropic-ai/sdk';

import { SERVICE_TYPES, type ServiceType } from '@/lib/types';

import type { ConversationTurn, Intent } from './types';

/** Named by the team. Do not change without changing PROMPT_VERSION too. */
export const INTENT_MODEL = 'claude-sonnet-4-6';

/**
 * Bumped whenever the prompt or the output schema changes.
 *
 * Logged with every turn: without it, comparing rankings across a prompt
 * change is meaningless, because the intents behind them are not comparable.
 */
export const PROMPT_VERSION = 'intent-v2';

/**
 * Refused rather than truncated. Silently cutting a long message would log an
 * intent derived from input the user never finished giving us.
 */
export const MAX_MESSAGE_CHARS = 8000;

/** Older turns are dropped from the head; they carry little reference value. */
const MAX_HISTORY_TURNS = 10;

export type IntentErrorCode =
  /** Caller sent an empty or oversized message. Maps to 400. */
  | 'invalid_input'
  /** No API credentials. A deployment fault, not a user fault. Maps to 500. */
  | 'not_configured'
  /** The API call failed or was refused. Maps to 502. */
  | 'model_unavailable'
  /** The model returned something that is not a usable intent. Maps to 502. */
  | 'invalid_output';

export class IntentError extends Error {
  constructor(
    readonly code: IntentErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'IntentError';
  }
}

/**
 * The output schema. `service_type` is pinned to the team's agreed set by
 * reference, so adding a service type in `@/lib/types` widens this schema
 * automatically and the two can never drift apart.
 */
const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['service_type', 'max_price', 'keywords', 'availability_hint'],
  properties: {
    service_type: {
      anyOf: [{ type: 'string', enum: [...SERVICE_TYPES] }, { type: 'null' }],
      description: 'The service category the user asked for, or null if they did not name one.',
    },
    max_price: {
      // No `minimum` here: structured outputs reject numeric range keywords
      // ("For 'number' type, property 'minimum' is not supported"). The bound
      // is enforced in parseIntentPayload instead, which rejects a negative
      // price rather than quietly nulling it.
      anyOf: [{ type: 'number' }, { type: 'null' }],
      description: 'An upper price in USD the user explicitly stated, or null. Never negative.',
    },
    keywords: {
      // No `maxItems`: structured outputs reject array size keywords too. A
      // code-side cap is deliberately NOT substituted — truncating would log
      // an intent the model did not produce. `max_tokens` already bounds the
      // list, and scoring cost is trivial at this corpus size.
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete task words taken from the message itself.',
    },
    availability_hint: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'A timing expression the user made, or null.',
    },
  },
};

const SYSTEM_PROMPT = [
  'You extract search terms for a local-services marketplace. You do not choose results, rank listings, or talk to the user. You only report what this message asked for.',
  '',
  'Fill exactly these four fields:',
  '',
  `service_type - one of: ${SERVICE_TYPES.join(', ')}. Use null if the message does not ask for one of these, even when the request is a real job. Do not stretch a request to fit a category.`,
  '',
  'If one message asks for work spanning more than one of those categories ("clean out my garage and move some boxes" is both cleaning and moving), service_type is null. This field is single-valued, so picking one category silently discards the other half of the request; leaving it null lets the keywords carry both.',
  '',
  'max_price - a number, only when the message states an upper price ("under $80", "no more than 100"). NEVER infer one. "cheap", "affordable", "budget", "not too expensive" and "as low as possible" all mean null. Inventing a number that was not stated is the worst error you can make here.',
  '',
  'keywords - concrete task words taken from the message itself: the objects, places and actions ("garage", "boxes", "move", "faucet"). Drop filler and politeness. Do not add synonyms, related services, or words that were not used. Use [] when the message contains nothing concrete.',
  '',
  'availability_hint - the timing words as stated ("this weekend", "3am", "Monday morning"). null when no timing was mentioned.',
  '',
  'Rules:',
  '- Report only what THIS message expresses. Earlier messages are context for resolving references ("the moving one", "that second one") - never for carrying a constraint forward. If an upper price was stated three messages ago and not repeated, max_price is null now.',
  '- Never guess in order to be helpful. null is a correct and useful answer.',
  '- A nonsense, empty or off-topic message yields nulls and an empty keyword list. That is the right output, not a failure.',
].join('\n');

/** Trims, drops blanks, and de-duplicates case-insensitively, keeping the model's casing. */
function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new IntentError('invalid_output', 'keywords was not an array');
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new IntentError('invalid_output', 'keywords contained a non-string entry');
    }
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Re-validates the model's payload in code.
 *
 * Structured outputs already constrain the shape, so this is belt and braces —
 * but the alternative to a redundant check is a malformed intent entering the
 * training log, and that is not recoverable later.
 */
export function parseIntentPayload(raw: unknown): Intent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IntentError('invalid_output', 'intent payload was not an object');
  }
  const record = raw as Record<string, unknown>;

  const rawService = record['service_type'];
  let service_type: ServiceType | null = null;
  if (rawService !== null && rawService !== undefined) {
    if (typeof rawService !== 'string') {
      throw new IntentError('invalid_output', 'service_type was not a string or null');
    }
    const normalized = rawService.trim().toLowerCase();
    if (!(SERVICE_TYPES as readonly string[]).includes(normalized)) {
      throw new IntentError(
        'invalid_output',
        `service_type ${JSON.stringify(rawService)} is outside the agreed set`,
      );
    }
    service_type = normalized as ServiceType;
  }

  const rawPrice = record['max_price'];
  let max_price: number | null = null;
  if (rawPrice !== null && rawPrice !== undefined) {
    if (typeof rawPrice !== 'number' || !Number.isFinite(rawPrice) || rawPrice < 0) {
      // Not coerced to null: a bad number means the extraction misfired, and
      // silently nulling it would hide that from the log.
      throw new IntentError(
        'invalid_output',
        `max_price ${JSON.stringify(rawPrice)} is not a usable price`,
      );
    }
    max_price = rawPrice;
  }

  const rawHint = record['availability_hint'];
  let availability_hint: string | null = null;
  if (rawHint !== null && rawHint !== undefined) {
    if (typeof rawHint !== 'string') {
      throw new IntentError('invalid_output', 'availability_hint was not a string or null');
    }
    const trimmed = rawHint.trim();
    availability_hint = trimmed.length > 0 ? trimmed : null;
  }

  return {
    service_type,
    max_price,
    keywords: normalizeKeywords(record['keywords']),
    availability_hint,
  };
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    // Loud rather than degraded: falling back to a keyword-only guess would log
    // an intent the model never produced, and hide a broken deployment.
    throw new IntentError('not_configured', 'ANTHROPIC_API_KEY is not set');
  }
  cachedClient = new Anthropic({ timeout: 20_000 });
  return cachedClient;
}

function toMessageParams(
  message: string,
  history: ConversationTurn[] | undefined,
): Anthropic.MessageParam[] {
  const recent = (history ?? []).slice(-MAX_HISTORY_TURNS);
  const params: Anthropic.MessageParam[] = [];

  for (const turn of recent) {
    if (!turn || typeof turn.content !== 'string' || turn.content.trim().length === 0) continue;
    if (turn.role !== 'user' && turn.role !== 'assistant') continue;
    params.push({ role: turn.role, content: turn.content });
  }

  // The API requires the first message to come from the user.
  while (params.length > 0 && params[0].role !== 'user') params.shift();

  params.push({ role: 'user', content: message });
  return params;
}

export interface ParsedIntent {
  intent: Intent;
  /** Always 'model' today. Logged so a future degraded path stays visible. */
  source: 'model';
  model: string;
  promptVersion: string;
}

/**
 * Extracts the search terms for one message.
 *
 * `history` is given to the model for reference resolution only; the prompt
 * forbids carrying an unrepeated constraint forward, so the returned intent is
 * what THIS message expressed. Throws `IntentError` rather than returning a
 * guessed intent.
 */
export async function parseIntent(
  message: string,
  history?: ConversationTurn[],
): Promise<ParsedIntent> {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new IntentError('invalid_input', 'message must be a non-empty string');
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new IntentError(
      'invalid_input',
      `message is ${message.length} characters; the limit is ${MAX_MESSAGE_CHARS}`,
    );
  }

  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: INTENT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: toMessageParams(message, history),
      output_config: {
        // A slot fill; deeper reasoning would cost more and add nothing.
        effort: 'low',
        format: { type: 'json_schema', schema: INTENT_SCHEMA },
      },
    });
  } catch (error) {
    if (error instanceof IntentError) throw error;
    throw new IntentError('model_unavailable', 'The intent model could not be reached', error);
  }

  if (response.stop_reason === 'refusal') {
    throw new IntentError('model_unavailable', 'The intent model declined this message');
  }
  if (response.stop_reason === 'max_tokens') {
    // The JSON is truncated; parsing it would yield a partial intent.
    throw new IntentError('invalid_output', 'The intent model ran out of output tokens');
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (text.length === 0) {
    throw new IntentError('invalid_output', 'The intent model returned no text');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new IntentError('invalid_output', 'The intent model returned unparseable JSON', error);
  }

  return {
    intent: parseIntentPayload(payload),
    source: 'model',
    model: INTENT_MODEL,
    promptVersion: PROMPT_VERSION,
  };
}
