import Link from 'next/link';
import { AlertTriangle, CalendarClock, MapPin } from 'lucide-react';

import BookingActions from './BookingActions';
import { formatUsd, priceBreakdown } from '@/lib/pricing';
import type { BookingStatus, CleanBooking } from '@/lib/types';

const STATUS_STYLES: Record<BookingStatus | 'unknown', { label: string; className: string }> = {
  confirmed: {
    label: 'Confirmed',
    className: 'bg-[#E8EFEA] text-brand-primary border-[#CFE0D5] dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900',
  },
  pending: {
    label: 'Pending',
    className: 'bg-brand-amber-tint text-[#B45309] border-[#F3DFBE] dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900',
  },
  completed: {
    label: 'Completed',
    className: 'bg-brand-soft text-brand-ink-muted border-brand-line dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-[#FBEFEC] text-[#9A3412] border-[#F3D9CE] dark:bg-red-950/40 dark:text-red-400 dark:border-red-900',
  },
  unknown: {
    label: 'Status unknown',
    className: 'bg-brand-soft text-brand-slate border-brand-line dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700',
  },
};

/**
 * Formats in UTC deliberately. Slots are stored at the hour they were picked
 * (09:00/14:00Z), so rendering them in UTC shows the customer the same time
 * they selected, and keeps server output stable.
 */
function formatScheduledAt(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${day} at ${time}`;
}

interface Props {
  booking: CleanBooking;
  /** Whether the scheduled time has already passed, decided on the server. */
  isPast: boolean;
  hasReview: boolean;
}

export default function BookingCard({ booking, isPast, hasReview }: Props) {
  const status = STATUS_STYLES[booking.status];
  const listing = booking.listing;
  const address = booking.address;
  const breakdown = listing?.price != null ? priceBreakdown(listing.price) : null;

  return (
    <article className="rounded-2xl border border-brand-line dark:border-stone-800 bg-white dark:bg-slate-900 shadow-spruce-sm p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-brand-primary dark:text-slate-100 leading-snug">
            {listing?.title ?? (
              <span className="italic text-brand-slate dark:text-slate-500">Service details unavailable</span>
            )}
          </h3>
          <p className="text-sm text-brand-ink-muted dark:text-slate-400 mt-0.5">
            {listing?.provider?.provider_id ? (
              <Link
                href={`/providers/${listing.provider.provider_id}`}
                className="hover:text-brand-primary dark:hover:text-slate-200 hover:underline transition-colors"
              >
                {listing.provider.provider_name ?? 'View provider'}
              </Link>
            ) : (
              <span className="italic text-brand-slate dark:text-slate-500">Provider information unavailable</span>
            )}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${status.className}`}
          title={booking.status === 'unknown' && booking.rawStatus ? `Raw value: ${booking.rawStatus}` : undefined}
        >
          {status.label}
        </span>
      </div>

      {/* A listing pulled from the marketplace still owes the customer an explanation. */}
      {listing?.withdrawn && (
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          This service is no longer offered on Spruce. Your booking is unaffected — contact the
          provider with any questions.
        </p>
      )}

      {!listing && booking.listingId && (
        <p className="flex items-start gap-2 text-xs text-brand-ink-muted dark:text-slate-400 bg-brand-soft dark:bg-slate-950 border border-brand-line dark:border-slate-800 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          We couldn&apos;t find the service record for this booking
          <span className="font-mono text-brand-slate dark:text-slate-500"> ({booking.listingId})</span>.
        </p>
      )}

      <div className="flex items-start gap-2 text-sm">
        <CalendarClock size={15} className="text-brand-slate dark:text-slate-500 shrink-0 mt-0.5" />
        {booking.scheduledAt ? (
          <span className="text-brand-ink-muted dark:text-slate-300">{formatScheduledAt(booking.scheduledAt)}</span>
        ) : (
          <span className="text-brand-slate dark:text-slate-500 italic">Time to be confirmed</span>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm">
        <MapPin size={15} className="text-brand-slate dark:text-slate-500 shrink-0 mt-0.5" />
        {address ? (
          <span className="text-brand-ink-muted dark:text-slate-300 whitespace-pre-line">{address}</span>
        ) : (
          <span className="text-brand-slate dark:text-slate-500 italic">No address recorded</span>
        )}
      </div>

      <div className="flex justify-between items-baseline gap-3 pt-2 mt-auto border-t border-brand-line dark:border-slate-800">
        <span className="text-xs text-brand-slate dark:text-slate-600 font-mono">{booking.booking_id}</span>
        {breakdown ? (
          <span className="text-sm">
            <span className="text-brand-slate dark:text-slate-500">Total </span>
            <span className="font-semibold text-brand-primary dark:text-emerald-400">{formatUsd(breakdown.total)}</span>
          </span>
        ) : (
          <span className="text-sm text-brand-slate dark:text-slate-500 italic">Price unavailable</span>
        )}
      </div>

      <BookingActions booking={booking} isPast={isPast} hasReview={hasReview} />
    </article>
  );
}
