'use client';

import { CalendarClock, Sparkles } from 'lucide-react';

import type { Intent, Match } from '@/lib/chat/types';
import { formatUsd } from '@/lib/pricing';

/**
 * A matched listing, rendered for the chat.
 *
 * Deliberately a separate component from `src/components/customer/ListingCard`
 * rather than a copy of it or a change to it: that card is Product B's, it
 * requires an `onBook` handler, and Product C does not book. It is matched
 * visually — same shell, same teal accent, same slot chips, both themes — so
 * that swapping to a genuinely shared card later is a small change.
 *
 * This card takes no action props on purpose. Product C matches and nothing
 * else: no booking, no navigation, no browsing.
 */

const SERVICE_LABELS: Record<Match['service_type'], string> = {
  cleaning: 'Cleaning',
  handyman: 'Handyman',
  moving: 'Moving',
};

/**
 * Formats the price according to its `price_type`, as the brief requires.
 *
 * Every listing is 'flat' today because the shared `CleanListing` carries no
 * price_type — see PRICE_TYPE_FALLBACK in `@/lib/chat/match`. The hourly
 * branch is not speculative: it is the schema's other legal value, and
 * rendering an hourly price as a flat one would misstate what a customer pays.
 */
function formatPrice(match: Match): string {
  return match.price_type === 'hourly' ? `${formatUsd(match.price)}/hr` : formatUsd(match.price);
}

/**
 * Builds the "why this matched" line from the filters that actually hit.
 *
 * Derived at render time from machine-readable codes rather than stored as
 * prose, so the log stays diffable and this line can never claim a filter the
 * matcher did not apply. In particular there is no availability clause,
 * because availability is never filtered on.
 */
function whyThisMatched(match: Match, intent: Intent): string {
  const parts: string[] = [];

  if (match.reason.filters.includes('service_type') && intent.service_type !== null) {
    parts.push(`${intent.service_type} service`);
  }
  if (match.reason.filters.includes('max_price') && intent.max_price !== null) {
    parts.push(`under ${formatUsd(intent.max_price)}`);
  }
  if (match.reason.matchedKeywords.length > 0) {
    parts.push(match.reason.matchedKeywords.map((word) => `“${word}”`).join(', '));
  }

  return parts.length > 0 ? parts.join(' · ') : 'Currently active';
}

interface Props {
  match: Match;
  /** The intent behind this search, so the reason can name its real values. */
  intent: Intent;
}

export default function ChatListingCard({ match, intent }: Props) {
  const hasAvailability = match.availability.length > 0;

  return (
    <article className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {SERVICE_LABELS[match.service_type]}
        </span>
        {/* emerald-600 in light, not the card's emerald-400, which is too low
            contrast on white. See the note in the step-4 report. */}
        <span className="font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          {formatPrice(match)}
        </span>
      </div>

      <div>
        <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 leading-snug">
          {match.title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{match.provider_name}</p>
      </div>

      <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2">{match.description}</p>

      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          <CalendarClock size={13} />
          <span>Availability</span>
        </div>
        {hasAvailability ? (
          <div className="flex flex-wrap gap-1.5">
            {match.availability.map((slot) => (
              <span
                key={slot}
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md"
              >
                {slot}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">Contact provider for availability</p>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-teal-700 dark:text-teal-400 border-t border-slate-200 dark:border-slate-800 pt-3 mt-auto">
        <Sparkles size={13} className="shrink-0 mt-px" />
        <span>
          <span className="font-medium">Why this matched:</span> {whyThisMatched(match, intent)}
        </span>
      </p>
    </article>
  );
}
