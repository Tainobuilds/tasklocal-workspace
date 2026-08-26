'use client';

import Link from 'next/link';
import { BadgeCheck, CalendarClock, Star, UserRound } from 'lucide-react';

import { slotKey } from '@/lib/sanitize';
import { formatUsd } from '@/lib/pricing';
import { CATEGORY_PILL_CLASSES, SERVICE_TYPE_LABELS, type CleanListing } from '@/lib/types';

// Same deterministic-tint approach used for the AI Matcher's provider
// avatars — no real photo exists, so the placeholder should at least be
// stable per listing rather than random on every render.
const AVATAR_TINTS = [
  'bg-brand-primary/10 text-brand-primary dark:text-emerald-400',
  'bg-brand-accent/10 text-brand-accent',
  'bg-brand-sage/25 text-brand-primary dark:text-emerald-400',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Why this listing can't be booked right now, or `null` when it can be.
 * A listing with no bookable slot or no usable price would otherwise lead the
 * customer into a flow that cannot complete.
 */
export function bookingBlockedReason(listing: CleanListing): string | null {
  if (listing.availability.length === 0) return 'No bookable times published';
  if (listing.price === null) return 'Price unavailable';
  return null;
}

/** Renders "4.6 (47 reviews)", degrading to a placeholder when unusable. */
function RatingLine({ listing }: { listing: CleanListing }) {
  const rating = listing.provider?.provider_avg_rating ?? null;
  const count = listing.provider?.provider_review_count ?? null;

  if (rating === null || count === null || count === 0) {
    return <span className="text-slate-500">No reviews yet</span>;
  }

  return (
    <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
      <Star size={13} className="fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      <span className="text-slate-500">
        ({count} {count === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  );
}

interface Props {
  listing: CleanListing;
  onBook: (listing: CleanListing) => void;
}

export default function ListingCard({ listing, onBook }: Props) {
  const blocked = bookingBlockedReason(listing);
  const hasAvailability = listing.availability.length > 0;

  return (
    // The whole card is the link to the detail page; the Book button below
    // stops the click so it can still open the flow directly.
    <Link
      href={`/listings/${listing.listing_id}`}
      className="group bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 flex flex-col gap-3 shadow-spruce-sm hover:shadow-spruce-md hover:-translate-y-0.5 transition-all focus:outline-none focus-visible:border-brand-accent"
    >
      <div className="flex justify-between items-start gap-3">
        <span className={CATEGORY_PILL_CLASSES}>{SERVICE_TYPE_LABELS[listing.service_type]}</span>
        {listing.price === null ? (
          <span className="text-sm text-slate-500 italic whitespace-nowrap">Price unavailable</span>
        ) : (
          <span className="font-display shrink-0 font-bold text-[15px] whitespace-nowrap text-brand-primary dark:text-slate-100">
            {formatUsd(listing.price)}
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">/hr</span>
          </span>
        )}
      </div>

      <div>
        <h3 className="font-display text-[17px] font-bold tracking-tight leading-tight text-brand-primary dark:text-slate-100 group-hover:opacity-90">
          {listing.title}
        </h3>
        {listing.provider?.provider_name ? (
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{listing.provider.provider_name}</p>
        ) : (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                AVATAR_TINTS[hashString(listing.listing_id) % AVATAR_TINTS.length]
              }`}
            >
              <UserRound size={11} />
            </span>
            <span className="flex items-center gap-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/50 px-2 py-0.5 rounded-full">
              <BadgeCheck size={10} /> Verified Pro
            </span>
          </div>
        )}
      </div>

      <div className="text-sm">
        <RatingLine listing={listing} />
      </div>

      <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2">
        {listing.description ?? <span className="italic text-slate-500">No description provided</span>}
      </p>

      <div className="mt-auto pt-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
          <CalendarClock size={13} />
          <span>Availability</span>
        </div>
        {hasAvailability ? (
          <div className="flex flex-wrap gap-1.5">
            {listing.availability.map((slot) => (
              <span
                key={slotKey(slot)}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full"
              >
                {slotKey(slot)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">Contact provider for availability</p>
        )}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onBook(listing);
        }}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        className="mt-2 w-full bg-brand-primary hover:opacity-90 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:opacity-100 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-all"
      >
        {blocked ? `Unavailable — ${blocked}` : 'Book'}
      </button>
    </Link>
  );
}
