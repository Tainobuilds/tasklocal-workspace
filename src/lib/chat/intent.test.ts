/**
 * Intent tests.
 *
 * Everything here runs without an API key: the input guards fire before any
 * client is constructed, and `parseIntentPayload` is pure. The live call shape
 * is NOT covered — that still needs one real request against the API.
 */

import { describe, expect, it } from 'vitest';

import { IntentError, MAX_MESSAGE_CHARS, parseIntent, parseIntentPayload } from './intent';

const wellFormed = {
  service_types: ['cleaning'],
  max_price: 80,
  keywords: ['garage', 'boxes'],
  availability_hint: 'this weekend',
};

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no-error';
  } catch (error) {
    return error instanceof IntentError ? error.code : 'wrong-error-type';
  }
}

describe('input guards', () => {
  it('rejects an empty message', async () => {
    expect(await codeOf(parseIntent(''))).toBe('invalid_input');
  });

  it('rejects a whitespace-only message', async () => {
    expect(await codeOf(parseIntent('   \n\t  '))).toBe('invalid_input');
  });

  it('refuses an oversized message rather than truncating it', async () => {
    const tooLong = 'a'.repeat(MAX_MESSAGE_CHARS + 1);
    expect(await codeOf(parseIntent(tooLong))).toBe('invalid_input');
  });

  it('accepts a 2000-character message', async () => {
    // It gets past the guards and fails on credentials instead, which is what
    // proves the length was accepted rather than rejected.
    expect(await codeOf(parseIntent('a'.repeat(2000)))).toBe('not_configured');
  });

  it('treats an emoji-only message as valid input', async () => {
    expect(await codeOf(parseIntent('🧹🧹🧹'))).toBe('not_configured');
  });
});

describe('payload validation', () => {
  it('accepts a well-formed payload', () => {
    expect(parseIntentPayload(wellFormed)).toEqual(wellFormed);
  });

  it('preserves nulls rather than substituting defaults', () => {
    const parsed = parseIntentPayload({
      service_types: [],
      max_price: null,
      keywords: [],
      availability_hint: null,
    });
    expect(parsed).toEqual({
      service_types: [],
      max_price: null,
      keywords: [],
      availability_hint: null,
    });
    // The distinction the training corpus depends on: "not stated" is null,
    // never 0 and never "".
    expect(parsed.max_price).not.toBe(0);
  });

  it('keeps a stated price of zero, which is not the same as no price', () => {
    expect(parseIntentPayload({ ...wellFormed, max_price: 0 }).max_price).toBe(0);
  });

  it('rejects a service type outside the agreed set', () => {
    // "relocation" is exactly the value that dirties data/listings.json.
    expect(() => parseIntentPayload({ ...wellFormed, service_types: ['relocation'] })).toThrow(
      IntentError,
    );
    expect(() =>
      parseIntentPayload({ ...wellFormed, service_types: ['cleaning', 'relocation'] }),
    ).toThrow(IntentError);
  });

  it('normalises the casing of a valid service type', () => {
    expect(
      parseIntentPayload({ ...wellFormed, service_types: ['Cleaning'] }).service_types,
    ).toEqual(['cleaning']);
  });

  it('keeps a genuine multi-category request as two entries, in order', () => {
    expect(
      parseIntentPayload({ ...wellFormed, service_types: ['cleaning', 'moving'] }).service_types,
    ).toEqual(['cleaning', 'moving']);
  });

  it('de-duplicates so one category cannot reserve two result slots', () => {
    expect(
      parseIntentPayload({ ...wellFormed, service_types: ['moving', 'moving'] }).service_types,
    ).toEqual(['moving']);
  });

  it('rejects service_types that is not an array of strings', () => {
    expect(() => parseIntentPayload({ ...wellFormed, service_types: 'cleaning' })).toThrow(
      IntentError,
    );
    expect(() => parseIntentPayload({ ...wellFormed, service_types: [1] })).toThrow(IntentError);
  });

  it('rejects a negative price instead of quietly nulling it', () => {
    expect(() => parseIntentPayload({ ...wellFormed, max_price: -40 })).toThrow(IntentError);
  });

  it('rejects a non-numeric price', () => {
    expect(() => parseIntentPayload({ ...wellFormed, max_price: 'call for quote' })).toThrow(
      IntentError,
    );
  });

  it('rejects keywords that are not an array of strings', () => {
    expect(() => parseIntentPayload({ ...wellFormed, keywords: 'garage' })).toThrow(IntentError);
    expect(() => parseIntentPayload({ ...wellFormed, keywords: [1, 2] })).toThrow(IntentError);
  });

  it('trims, drops blanks and de-duplicates keywords case-insensitively', () => {
    const parsed = parseIntentPayload({
      ...wellFormed,
      keywords: ['  Garage ', 'garage', '', '   ', 'Boxes'],
    });
    expect(parsed.keywords).toEqual(['Garage', 'Boxes']);
  });

  it('treats a blank availability hint as no hint at all', () => {
    expect(parseIntentPayload({ ...wellFormed, availability_hint: '   ' }).availability_hint).toBe(
      null,
    );
  });

  it('rejects a payload that is not an object', () => {
    expect(() => parseIntentPayload(null)).toThrow(IntentError);
    expect(() => parseIntentPayload([wellFormed])).toThrow(IntentError);
    expect(() => parseIntentPayload('{}')).toThrow(IntentError);
  });
});
