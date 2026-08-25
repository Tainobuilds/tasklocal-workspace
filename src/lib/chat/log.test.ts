/**
 * Turn-log tests.
 *
 * The log is training-grade data, so these assert the accuracy rules
 * themselves — verbatim message, preserved nulls, machine-readable filters,
 * versions present, and the refusal to log an id that is not in the dataset.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { logTurn, UnknownListingLoggedError, type TurnLogInput, type TurnLogRecord } from './log';
import type { Intent, Match } from './types';

const intent: Intent = {
  service_types: ['cleaning'],
  max_price: null,
  keywords: ['clean'],
  availability_hint: '3am',
};

const match: Match = {
  listing_id: 'list_108',
  title: 'Weekly Recurring Clean',
  description: 'Standard weekly maintenance clean',
  service_type: 'cleaning',
  price: 65,
  price_type: 'flat',
  provider_name: 'Fresh Start Cleaners',
  availability: ['Mon PM', 'Wed PM', 'Fri PM'],
  reason: {
    filters: ['listing_status_active', 'service_type', 'keyword'],
    keywordScore: 2,
    matchedKeywords: ['clean'],
  },
};

function input(overrides: Partial<TurnLogInput> = {}): TurnLogInput {
  return {
    rawMessage: '  I need a CLEAN.  ',
    intentStatedThisTurn: intent,
    intentEffective: intent,
    inheritedFields: [],
    intentSource: 'model',
    model: 'claude-sonnet-4-6',
    promptVersion: 'intent-v3',
    matcherVersion: 'matcher-v1',
    matches: [match],
    matchableCount: 9,
    rejectedCount: 2,
    error: null,
    ...overrides,
  };
}

/** Captures the single stdout line the logger writes. */
function capture(fn: () => void): TurnLogRecord {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    fn();
    expect(spy).toHaveBeenCalledTimes(1);
    return JSON.parse(spy.mock.calls[0][0] as string) as TurnLogRecord;
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

const validIds = new Set(['list_108', 'list_102']);

describe('accuracy rules', () => {
  it('stores the raw message verbatim, untrimmed and unnormalised', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.rawMessage).toBe('  I need a CLEAN.  ');
    expect(record.rawMessageLength).toBe('  I need a CLEAN.  '.length);
  });

  it('preserves intent nulls rather than coercing them', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.intentEffective?.max_price).toBe(null);
    expect(record.intentEffective?.service_types).toEqual(['cleaning']);
  });

  it('records the timing hint that was captured but never filtered on', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.intentEffective?.availability_hint).toBe('3am');
    expect(record.matches[0].filters).not.toContain('availability');
  });

  it('records filters as codes and the score as a number, never as prose', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.matches[0]).toEqual({
      listing_id: 'list_108',
      filters: ['listing_status_active', 'service_type', 'keyword'],
      keywordScore: 2,
      matchedKeywords: ['clean'],
    });
  });

  it('always carries the versions a replay needs', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.schemaVersion).toBe('turn-v2');
    expect(record.matcherVersion).toBe('matcher-v1');
    expect(record.promptVersion).toBe('intent-v3');
    expect(record.model).toBe('claude-sonnet-4-6');
  });

  it('records the dataset the ranking was drawn from', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.matchableCount).toBe(9);
    expect(record.rejectedCount).toBe(2);
  });

  it('states that no intent field was inherited from an earlier turn', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.inheritedFields).toEqual([]);
    expect(record.intentEffective).toEqual(record.intentStatedThisTurn);
  });

  it('logs a failed turn instead of dropping it', () => {
    const record = capture(() =>
      logTurn(
        input({
          intentStatedThisTurn: null,
          intentEffective: null,
          intentSource: 'error',
          model: null,
          promptVersion: null,
          matches: [],
          error: { code: 'model_unavailable', message: 'timed out' },
        }),
        validIds,
      ),
    );
    expect(record.intentSource).toBe('error');
    expect(record.error).toEqual({ code: 'model_unavailable', message: 'timed out' });
    expect(record.returnedListingIds).toEqual([]);
  });

  it('writes exactly one JSON line per turn', () => {
    const record = capture(() => logTurn(input(), validIds));
    expect(record.event).toBe('match_turn');
    expect(typeof record.timestamp).toBe('string');
  });
});

describe('the unknown-listing guard', () => {
  it('refuses to log an id that is not in the dataset', () => {
    const ghost: Match = { ...match, listing_id: 'list_999' };
    expect(() => logTurn(input({ matches: [ghost] }), validIds)).toThrow(UnknownListingLoggedError);
  });

  it('does not emit anything when the guard trips', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const ghost: Match = { ...match, listing_id: 'list_999' };
    expect(() => logTurn(input({ matches: [ghost] }), validIds)).toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
