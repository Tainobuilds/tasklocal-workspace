'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

import BookingFlow from './BookingFlow';
import ReportDialog from './ReportDialog';
import { bookingBlockedReason } from './ListingCard';
import type { CleanListing } from '@/lib/types';

interface Props {
  listing: CleanListing;
  defaultAddress: string | null;
  signedIn: boolean;
}

/** The interactive controls on the listing detail page: Book, Report. Review lives in ReviewsSection. */
export default function ListingDetailActions({
  listing,
  defaultAddress,
  signedIn,
}: Props) {
  const [booking, setBooking] = useState(false);
  const [reporting, setReporting] = useState(false);

  const blocked = bookingBlockedReason(listing);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setBooking(true)}
          disabled={blocked !== null}
          title={blocked ?? undefined}
          className="flex-1 min-w-[10rem] bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          {blocked ? `Unavailable — ${blocked}` : 'Book this service'}
        </button>

        <button
          type="button"
          onClick={() => setReporting(true)}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-800 text-slate-400 hover:text-rose-300 hover:border-rose-800/60 transition-colors"
        >
          <Flag size={14} />
          Report
        </button>
      </div>

      {booking && (
        <BookingFlow
          listing={listing}
          defaultAddress={defaultAddress}
          signedIn={signedIn}
          onClose={() => setBooking(false)}
        />
      )}

      {reporting && (
        <ReportDialog listing={listing} signedIn={signedIn} onClose={() => setReporting(false)} />
      )}
    </>
  );
}
