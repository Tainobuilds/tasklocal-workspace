'use client';

import Link from 'next/link';
import { CalendarClock, Star } from 'lucide-react';

import { slotKey } from '@/lib/sanitize';
import { formatUsd } from '@/lib/pricing';
import type { CleanListing } from '@/lib/types';

const SERVICE_LABELS: Record<CleanListing['service_type'], string> = {
  cleaning: 'Cleaning',
  handyman: 'Handyman',
  moving: 'Moving',
};

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
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-all focus:outline-none focus-visible:border-teal-500"
    >
      <div className="flex justify-between items-start gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {SERVICE_LABELS[listing.service_type]}
        </span>
        {listing.price === null ? (
          <span className="text-sm text-slate-500 italic whitespace-nowrap">Price unavailable</span>
        ) : (
          <span className="font-bold text-emerald-400 whitespace-nowrap">{formatUsd(listing.price)}</span>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 leading-snug group-hover:text-slate-950 dark:group-hover:text-white">
          {listing.title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {listing.provider?.provider_name ?? (
            <span className="italic text-slate-500">Provider information unavailable</span>
          )}
        </p>
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
                className="text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md"
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
        className="mt-2 w-full bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {blocked ? `Unavailable — ${blocked}` : 'Book'}
      </button>
    </Link>
  );
}
