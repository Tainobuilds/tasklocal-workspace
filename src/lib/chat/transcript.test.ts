/**
 * Tests for the chat transcript's sessionStorage persistence.
 *
 * Two properties matter here and they pull in opposite directions:
 *
 * 1. A transcript that round-trips must come back byte-for-byte, because the
 *    restored turns are replayed to the model as `conversationHistory`.
 * 2. Anything that cannot be vouched for must degrade to an empty
 *    conversation, silently, without throwing.
 *
 * The environment is node, so there is no real sessionStorage; every case
 * injects a fake through the `TranscriptStorage` seam — including fakes that
 * throw, which is what a browser blocking site data actually does.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TRANSCRIPT_KEY,
  TRANSCRIPT_VERSION,
  appendTurn,
  getTranscriptServerSnapshot,
  getTranscriptSnapshot,
  parseTranscript,
  readTranscript,
  resetTranscriptCache,
  serializeTranscript,
  setTranscript,
  subscribeTranscript,
  writeTranscript,
  type TranscriptStorage,
  type Turn,
} from './transcript';
import type { Match } from './types';

/** An in-memory stand-in for one tab's sessionStorage. */
function fakeStorage(seed: Record<string, string> = {}): TranscriptStorage & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

/** Storage that throws on every operation, as a locked-down browser does. */
const throwingStorage: TranscriptStorage = {
  getItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
  setItem() {
    throw new DOMException('Quota exceeded.', 'QuotaExceededError');
  },
  removeItem() {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
};

const match: Match = {
  listing_id: 'list_101',
  title: 'Deep Clean 2-Bedroom Apartment',
  description: 'Full kitchen and bathroom scrub',
  service_type: 'cleaning',
  price: 120,
  price_type: 'flat',
  provider_name: 'Sparkle Clean Co. LLC',
  availability: ['Mon AM', 'Wed PM'],
  reason: {
    filters: ['listing_status_active', 'service_type', 'keyword'],
    keywordScore: 2,
    matchedKeywords: ['deep clean'],
  },
};

const conversation: Turn[] = [
  { role: 'user', content: 'Cheap cleaning under $80' },
  {
    role: 'assistant',
    content: 'Found 1 listing from 3 currently active.',
    matches: [match],
    intent: {
      service_types: ['cleaning'],
      max_price: 80,
      keywords: ['cleaning'],
      availability_hint: null,
    },
    failed: false,
  },
];

/** Stores `value` under the transcript key without going through serialize. */
function storedRaw(value: unknown): TranscriptStorage {
  return fakeStorage({ [TRANSCRIPT_KEY]: JSON.stringify(value) });
}

describe('round-tripping a transcript', () => {
  it('restores a conversation exactly as it was written', () => {
    const storage = fakeStorage();
    writeTranscript(conversation, storage);

    // Deep equality, not a spot check: the restored turns become the next
    // request's conversationHistory, so any drift is a false record of what
    // the user said.
    expect(readTranscript(storage)).toEqual(conversation);
  });

  it('preserves a null intent and a failed turn', () => {
    const failed: Turn[] = [
      { role: 'user', content: 'nonsense' },
      {
        role: 'assistant',
        content: 'Could not reach the matching service.',
        matches: [],
        intent: null,
        failed: true,
      },
    ];
    const storage = fakeStorage();
    writeTranscript(failed, storage);
    expect(readTranscript(storage)).toEqual(failed);
  });

  it('preserves a null max_price rather than dropping the key', () => {
    // null means "the user expressed no budget". Restoring it as undefined or
    // as a number would invent a constraint they never stated.
    const turns: Turn[] = [
      {
        role: 'assistant',
        content: 'Found 2 listings.',
        matches: [],
        intent: {
          service_types: ['moving'],
          max_price: null,
          keywords: [],
          availability_hint: 'this weekend',
        },
        failed: false,
      },
    ];
    const storage = fakeStorage();
    writeTranscript(turns, storage);

    const [restored] = readTranscript(storage);
    expect(restored.role).toBe('assistant');
    const intent = (restored as Extract<Turn, { role: 'assistant' }>).intent;
    expect(intent).not.toBeNull();
    expect(intent!.max_price).toBeNull();
    expect('max_price' in intent!).toBe(true);
  });

  it('writes under a session-scoped key and stamps the version', () => {
    const storage = fakeStorage();
    writeTranscript(conversation, storage);

    const raw = storage.dump()[TRANSCRIPT_KEY];
    expect(raw).toBeDefined();
    expect(JSON.parse(raw).version).toBe(TRANSCRIPT_VERSION);
  });

  it('clears the key when the conversation is empty', () => {
    const storage = fakeStorage({ [TRANSCRIPT_KEY]: serializeTranscript(conversation) });
    writeTranscript([], storage);
    expect(storage.dump()[TRANSCRIPT_KEY]).toBeUndefined();
    expect(readTranscript(storage)).toEqual([]);
  });
});

describe('degrading to an empty conversation', () => {
  it('returns [] when there is no storage at all', () => {
    expect(readTranscript(null)).toEqual([]);
  });

  it('returns [] when storage throws on read', () => {
    expect(() => readTranscript(throwingStorage)).not.toThrow();
    expect(readTranscript(throwingStorage)).toEqual([]);
  });

  it('does not throw when storage throws on write', () => {
    expect(() => writeTranscript(conversation, throwingStorage)).not.toThrow();
    expect(() => writeTranscript([], throwingStorage)).not.toThrow();
    expect(() => writeTranscript(conversation, null)).not.toThrow();
  });

  it('returns [] for nothing stored', () => {
    expect(readTranscript(fakeStorage())).toEqual([]);
    expect(parseTranscript(null)).toEqual([]);
    expect(parseTranscript('')).toEqual([]);
  });

  it.each([
    ['malformed JSON', '{"version":1,"turns":['],
    ['a bare string', '"hello"'],
    ['a JSON array at the top level', '[]'],
    ['null', 'null'],
    ['a number', '42'],
  ])('returns [] for %s', (_name, raw) => {
    expect(parseTranscript(raw)).toEqual([]);
  });

  it('discards a transcript written by a different version', () => {
    const storage = storedRaw({ version: TRANSCRIPT_VERSION + 1, turns: conversation });
    expect(readTranscript(storage)).toEqual([]);
  });

  it('discards a transcript with no version stamp', () => {
    expect(readTranscript(storedRaw({ turns: conversation }))).toEqual([]);
  });

  it('discards a transcript whose turns are not an array', () => {
    expect(readTranscript(storedRaw({ version: TRANSCRIPT_VERSION, turns: {} }))).toEqual([]);
  });

  it.each([
    ['an unknown role', { role: 'system', content: 'hi' }],
    ['a missing role', { content: 'hi' }],
    ['non-string content', { role: 'user', content: 42 }],
    ['an assistant turn with no matches array', { role: 'assistant', content: 'x', intent: null, failed: false }],
    ['an assistant turn with a non-boolean failed', { role: 'assistant', content: 'x', matches: [], intent: null, failed: 'no' }],
    ['an assistant turn with a missing intent key', { role: 'assistant', content: 'x', matches: [], failed: false }],
    ['an intent with an unknown service type', {
      role: 'assistant', content: 'x', matches: [], failed: false,
      intent: { service_types: ['plumbing'], max_price: null, keywords: [], availability_hint: null },
    }],
    ['an intent with an undefined max_price', {
      role: 'assistant', content: 'x', matches: [], failed: false,
      intent: { service_types: [], keywords: [], availability_hint: null },
    }],
  ])('discards a transcript containing %s', (_name, badTurn) => {
    expect(readTranscript(storedRaw({ version: TRANSCRIPT_VERSION, turns: [badTurn] }))).toEqual([]);
  });

  it('discards the whole transcript when only one turn is bad', () => {
    // All-or-nothing. Restoring turns 1 and 3 without turn 2 would replay a
    // conversation that never happened.
    const storage = storedRaw({
      version: TRANSCRIPT_VERSION,
      turns: [conversation[0], { role: 'system', content: 'injected' }, conversation[1]],
    });
    expect(readTranscript(storage)).toEqual([]);
  });
});

describe('a stored match cannot become a listing the matcher never returned', () => {
  /** The valid conversation with one field of its single match overridden. */
  function withMatchField(field: string, value: unknown): TranscriptStorage {
    const tampered = { ...match, [field]: value };
    return storedRaw({
      version: TRANSCRIPT_VERSION,
      turns: [{ ...conversation[1], matches: [tampered] }],
    });
  }

  it.each([
    ['listing_id', 123],
    ['listing_id', ''],
    ['listing_id', null],
    ['title', null],
    ['description', undefined],
    ['service_type', 'plumbing'],
    ['price', 'free'],
    ['price', Number.NaN],
    ['price_type', 'weekly'],
    ['provider_name', 42],
    ['availability', 'Mon AM'],
    ['availability', [1, 2]],
    ['reason', null],
  ])('rejects a match whose %s is %p', (field, value) => {
    expect(readTranscript(withMatchField(field, value))).toEqual([]);
  });

  it.each([
    ['an unknown filter code', { filters: ['availability'], keywordScore: 0, matchedKeywords: [] }],
    ['a non-array filters', { filters: 'keyword', keywordScore: 0, matchedKeywords: [] }],
    ['a non-numeric keywordScore', { filters: [], keywordScore: 'high', matchedKeywords: [] }],
    ['non-string matchedKeywords', { filters: [], keywordScore: 0, matchedKeywords: [7] }],
  ])('rejects a match whose reason has %s', (_name, reason) => {
    expect(readTranscript(withMatchField('reason', reason))).toEqual([]);
  });

  it('rejects a listing id smuggled in beside a valid one', () => {
    const storage = storedRaw({
      version: TRANSCRIPT_VERSION,
      turns: [{ ...conversation[1], matches: [match, { listing_id: 'list_fabricated' }] }],
    });
    expect(readTranscript(storage)).toEqual([]);
  });
});

describe('the store the page subscribes to', () => {
  beforeEach(() => {
    resetTranscriptCache();
    setTranscript([]);
  });

  it('returns a stable reference while nothing changes', () => {
    // useSyncExternalStore re-renders whenever getSnapshot returns a new
    // reference. A fresh array per call would loop the page forever.
    expect(getTranscriptSnapshot()).toBe(getTranscriptSnapshot());

    setTranscript(conversation);
    expect(getTranscriptSnapshot()).toBe(getTranscriptSnapshot());
  });

  it('serves an empty, stable server snapshot', () => {
    // The server has no tab, so it has no transcript. Equality with the
    // client's empty snapshot is what keeps hydration from mismatching.
    expect(getTranscriptServerSnapshot()).toEqual([]);
    expect(getTranscriptServerSnapshot()).toBe(getTranscriptServerSnapshot());

    setTranscript([]);
    expect(getTranscriptSnapshot()).toBe(getTranscriptServerSnapshot());
  });

  it('notifies subscribers when the transcript changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeTranscript(listener);

    setTranscript(conversation);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getTranscriptSnapshot()).toEqual(conversation);

    unsubscribe();
    setTranscript([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps both turns appended in the same tick', () => {
    // This is what the functional form of setState was protecting: `send`
    // appends the user turn and then the assistant turn, and reading a stale
    // snapshot for the second would silently drop the first.
    appendTurn(conversation[0]);
    appendTurn(conversation[1]);

    expect(getTranscriptSnapshot()).toEqual(conversation);
  });
});

describe('the turn log is untouched', () => {
  it('does not write anything to the console', () => {
    // The log is a training-grade corpus emitted by logTurn via console.log.
    // This module sharing that channel — even for a warning about a discarded
    // transcript — would put a record in the corpus that is not a turn.
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );

    try {
      writeTranscript(conversation, fakeStorage());
      writeTranscript(conversation, throwingStorage);
      readTranscript(throwingStorage);
      readTranscript(storedRaw({ version: 99, turns: [] }));
      parseTranscript('{"broken"');

      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('stores nothing beyond the turns themselves', () => {
    // No timestamps, no ids, no counters. Anything extra here would be a
    // second, unversioned record of a conversation that the log already owns.
    const storage = fakeStorage();
    writeTranscript(conversation, storage);

    const stored = JSON.parse(storage.dump()[TRANSCRIPT_KEY]);
    expect(Object.keys(stored).sort()).toEqual(['turns', 'version']);
  });
});
