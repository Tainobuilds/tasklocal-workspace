'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Loader2, Search, SearchX, TriangleAlert } from 'lucide-react';

import type { ConversationTurn, MatchErrorResponse, MatchResponse } from '@/lib/chat/types';
import {
  appendTurn,
  getTranscriptServerSnapshot,
  getTranscriptSnapshot,
  subscribeTranscript,
  type AssistantTurn,
} from '@/lib/chat/transcript';

import ChatListingCard from './ChatListingCard';

/**
 * The matching chatbot.
 *
 * Describe a job, get the listings from the dataset that actually fit. It does
 * not book, browse, or create listings — it matches, and nothing else.
 *
 * This page renders only what `/api/match` returned. It never filters, ranks,
 * or constructs a listing of its own, so there is no path by which a listing
 * that is not in the dataset can appear on screen. The restored transcript is
 * held to the same bar rather than trusted: `readTranscript` re-validates every
 * match field before a stored turn is allowed back on screen.
 *
 * It is deliberately NOT wired into `WorkspaceHeader`: that component's tab set
 * has no member for this route, and claiming `active="chatbot"` would light up
 * a tab that navigates to a different product. Adding a tab means editing a
 * shared component, which needs its owner's agreement.
 */

const EXAMPLES = [
  'Clean out my garage and move some boxes',
  'Cheap cleaning under $80',
  'Fix a leaking kitchen faucet',
];

/** One assistant turn: its sentence, then whatever it actually returned. */
function AssistantBlock({ turn }: { turn: AssistantTurn }) {
  const { intent } = turn;

  return (
    <div className="flex flex-col gap-3">
      <p
        className={`self-start max-w-[85%] px-4 py-2 rounded-2xl rounded-bl-sm text-sm ${
          turn.failed
            ? 'flex items-start gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
            : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
        }`}
      >
        {turn.failed && <TriangleAlert size={15} className="shrink-0 mt-0.5" />}
        <span>{turn.content}</span>
      </p>

      {/* Nothing is rendered when there are no matches. The sentence above
          already names the constraint worth loosening; filling the gap with a
          listing would be a lie. */}
      {intent !== null && turn.matches.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {turn.matches.map((match) => (
            <ChatListingCard key={match.listing_id} match={match} intent={intent} />
          ))}
        </div>
      )}

      {!turn.failed && turn.matches.length === 0 && (
        <p className="self-start flex items-center gap-2 text-xs text-slate-500">
          <SearchX size={14} />
          No listings to show for that one.
        </p>
      )}
    </div>
  );
}

export default function ChatPage() {
  // The transcript lives in sessionStorage, not in this component, so that
  // navigating to a listing page and back does not discard it. Subscribed to
  // rather than restored in an effect: the server snapshot is always empty, so
  // the first client render matches the server's without a setState cascade.
  const turns = useSyncExternalStore(
    subscribeTranscript,
    getTranscriptSnapshot,
    getTranscriptServerSnapshot,
  );
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // `block: 'end'` plus the bottom padding on <main> keeps the newest reply
  // clear of the sticky input bar. Without both, the reply scrolls to just
  // underneath the bar and looks truncated.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, pending]);


  async function send(message: string) {
    const trimmed = message.trim();
    if (trimmed.length === 0 || pending) return;

    // The history sent up is what was actually said, in order. The server uses
    // it to resolve references only; it never carries a constraint forward.
    const history: ConversationTurn[] = turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    appendTurn({ role: 'user', content: message });
    setInput('');
    setPending(true);

    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationHistory: history }),
      });

      const body = (await response.json()) as MatchResponse | MatchErrorResponse;

      if (!response.ok) {
        const error = 'error' in body ? body.error : 'Something went wrong.';
        appendTurn({
          role: 'assistant',
          content: error,
          matches: [],
          intent: null,
          failed: true,
        });
        return;
      }

      const result = body as MatchResponse;
      appendTurn({
        role: 'assistant',
        content: result.explanation,
        matches: result.matches,
        intent: result.intent,
        failed: false,
      });
    } catch {
      appendTurn({
        role: 'assistant',
        content: 'Could not reach the matching service. Check your connection and try again.',
        matches: [],
        intent: null,
        failed: true,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    // min-h-screen, matching /browse and /: the body is only min-height, so a
    // percentage height here would not resolve and the input bar would float
    // mid-page instead of sitting at the bottom of the viewport.
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <header className="border-b border-slate-200 dark:border-slate-800 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white">
              TL
            </div>
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold text-lg tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
              Find a service
            </h1>
            <p className="text-xs text-slate-500">Describe the job and I will find listings that fit.</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-6 pt-6 pb-28">
        {turns.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-slate-600 dark:text-slate-400">
              Tell me what you need doing, in your own words.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            {turns.map((turn, index) =>
              turn.role === 'user' ? (
                <p
                  key={index}
                  className="self-end max-w-[85%] bg-teal-600 text-white px-4 py-2 rounded-2xl rounded-br-sm text-sm whitespace-pre-wrap break-words"
                >
                  {turn.content}
                </p>
              ) : (
                <AssistantBlock key={index} turn={turn} />
              ),
            )}

            {pending && (
              <p className="self-start flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" />
                Searching the listings…
              </p>
            )}

            <div ref={endRef} />
          </div>
        )}
      </main>

      <div className="sticky bottom-0 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
          className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-2"
        >
          <label htmlFor="chat-input" className="sr-only">
            Describe the job you need doing
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe the job…"
            autoComplete="off"
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-label="Search listings"
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            {pending ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
