import { AlertTriangle, CalendarClock, MapPin } from 'lucide-react';

import { formatUsd, priceBreakdown } from '@/lib/pricing';
import type { BookingStatus, CleanBooking } from '@/lib/types';

const STATUS_STYLES: Record<BookingStatus | 'unknown', { label: string; className: string }> = {
  confirmed: { label: 'Confirmed', className: 'bg-emerald-950 text-emerald-400 border-emerald-800/60' },
  pending: { label: 'Pending', className: 'bg-amber-950 text-amber-400 border-amber-800/60' },
  completed: { label: 'Completed', className: 'bg-slate-800 text-slate-300 border-slate-700' },
  cancelled: { label: 'Cancelled', className: 'bg-rose-950 text-rose-400 border-rose-900/60' },
  unknown: { label: 'Status unknown', className: 'bg-slate-800 text-slate-400 border-slate-700' },
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

function formatAddress(booking: CleanBooking): string | null {
  if (!booking.address) return null;
  const { line1, line2, city, state, postal_code: postal } = booking.address;
  const region = [city, state].filter(Boolean).join(', ');
  return [line1, line2, [region, postal].filter(Boolean).join(' ')]
    .filter((part) => part && part.trim().length > 0)
    .join('\n');
}

export default function BookingCard({ booking }: { booking: CleanBooking }) {
  const status = STATUS_STYLES[booking.status];
  const listing = booking.listing;
  const address = formatAddress(booking);
  const breakdown = listing?.price != null ? priceBreakdown(listing.price) : null;

  return (
    <article className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-100 leading-snug">
            {listing?.title ?? (
              <span className="italic text-slate-500">Service details unavailable</span>
            )}
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            {listing?.provider?.provider_name ?? (
              <span className="italic text-slate-500">Provider information unavailable</span>
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
        <p className="flex items-start gap-2 text-xs text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          This service is no longer offered on TaskLocal. Your booking is unaffected — contact the
          provider with any questions.
        </p>
      )}

      {!listing && booking.listingId && (
        <p className="flex items-start gap-2 text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          We couldn&apos;t find the service record for this booking
          <span className="font-mono text-slate-500"> ({booking.listingId})</span>.
        </p>
      )}

      <div className="flex items-start gap-2 text-sm">
        <CalendarClock size={15} className="text-slate-500 shrink-0 mt-0.5" />
        {booking.scheduledAt ? (
          <span className="text-slate-300">{formatScheduledAt(booking.scheduledAt)}</span>
        ) : (
          <span className="text-slate-500 italic">Time to be confirmed</span>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm">
        <MapPin size={15} className="text-slate-500 shrink-0 mt-0.5" />
        {address ? (
          <span className="text-slate-300 whitespace-pre-line">{address}</span>
        ) : (
          <span className="text-slate-500 italic">No address recorded</span>
        )}
      </div>

      <div className="flex justify-between items-baseline gap-3 pt-2 mt-auto border-t border-slate-800">
        <span className="text-xs text-slate-600 font-mono">{booking.booking_id}</span>
        {breakdown ? (
          <span className="text-sm">
            <span className="text-slate-500">Total </span>
            <span className="font-semibold text-emerald-400">{formatUsd(breakdown.total)}</span>
          </span>
        ) : (
          <span className="text-sm text-slate-500 italic">Price unavailable</span>
        )}
      </div>
    </article>
  );
}
