'use client';

import Link from 'next/link';
import { CalendarClock, Sparkles } from 'lucide-react';

import type { Intent, Match } from '@/lib/chat/types';
import { formatUsd } from '@/lib/pricing';
import { CATEGORY_PILL_CLASSES, SERVICE_TYPE_LABELS } from '@/lib/types';

/**
 * A matched listing, rendered for the chat.
 *
 * Deliberately a separate component from `src/components/customer/ListingCard`
 * rather than a copy of it or a change to it: that card is Product B's, it
 * requires an `onBook` handler, and Product C does not book. It is matched
 * visually — the Spruce bento shell from DESIGN.md (rounded-2xl, brand-line
 * border, shadow-spruce-sm, brand-primary title and price), the shared
 * category pill, both themes — so that swapping to a genuinely shared card
 * later is a small change.
 *
 * The whole card links to Product B's listing detail page at
 * `/listings/[listingId]`, using the same base and hover/focus classes their
 * `ListingCard` uses, so the two cards behave identically on click.
 *
 * It still takes no action props: Product C matches and hands off. It does not
 * book, and it owns no destination of its own — the id it links with is the
 * one it was matched on, and `matchListings` has already proved that id
 * against the catalogue that page reads from.
 */

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

  if (match.reason.filters.includes('service_type') && intent.service_types.length > 0) {
    parts.push(`${match.service_type} service`);
  }
  if (match.reason.filters.includes('max_price') && intent.max_price !== null) {
    parts.push(`under ${formatUsd(intent.max_price)}`);
  }
  if (match.reason.matchedKeywords.length > 0) {
    parts.push(match.reason.matchedKeywords.map((word) => `“${word}”`).join(', '));
  }

  // Said plainly: this listing is here because the request named its category,
  // not because it out-scored the others.
  if (match.reason.filters.includes('service_type_coverage')) {
    parts.push(`covers your ${match.service_type} request`);
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
    <Link
      href={`/listings/${match.listing_id}`}
      className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 flex flex-col gap-3 shadow-spruce-sm transition-all hover:shadow-spruce-md hover:-translate-y-0.5 hover:border-[#D6D3D1] dark:hover:border-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
    >
      <div className="flex justify-between items-start gap-3">
        <span className={CATEGORY_PILL_CLASSES}>{SERVICE_TYPE_LABELS[match.service_type]}</span>
        <span className="font-display shrink-0 font-bold text-[15px] whitespace-nowrap text-brand-primary dark:text-slate-100">
          {formatPrice(match)}
        </span>
      </div>

      <div>
        <h3 className="font-display text-[17px] font-bold tracking-tight leading-tight text-brand-primary dark:text-slate-100">
          {match.title}
        </h3>
        <p className="text-sm text-brand-slate dark:text-slate-400 mt-1">{match.provider_name}</p>
      </div>

      <p className="text-brand-ink-muted dark:text-slate-400 text-sm line-clamp-2">{match.description}</p>

      <div>
        <div className="flex items-center gap-1.5 text-xs text-brand-slate dark:text-slate-400 mb-2">
          <CalendarClock size={13} />
          <span>Availability</span>
        </div>
        {hasAvailability ? (
          <div className="flex flex-wrap gap-1.5">
            {match.availability.map((slot) => (
              <span
                key={slot}
                className="text-xs bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 text-brand-ink-muted dark:text-slate-300 px-2 py-0.5 rounded-md"
              >
                {slot}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-brand-slate dark:text-slate-400 italic">Contact provider for availability</p>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-brand-primary dark:text-emerald-400 border-t border-brand-line dark:border-slate-800 pt-3 mt-auto">
        <Sparkles size={13} className="shrink-0 mt-px" />
        <span>
          <span className="font-medium">Why this matched:</span> {whyThisMatched(match, intent)}
        </span>
      </p>
    </Link>
  );
}
