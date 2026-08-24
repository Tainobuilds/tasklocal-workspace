'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';

import ReviewDialog from './ReviewDialog';
import type { CleanListing } from '@/lib/types';

interface Props {
  listing: CleanListing;
  signedIn: boolean;
  /**
   * A not-yet-reviewed booking this customer has for this listing. Any booking
   * counts — pending, confirmed, or completed — so a review can be left at any
   * time. `null` means there is nothing they are eligible to review yet.
   */
  reviewableBookingId: string | null;
}

/**
 * The "Write a review" control shown inside the reviews section. Reviews stay
 * tied to a real booking (even one that is still upcoming), so feedback cannot
 * be left for work that never happened.
 */
export default function WriteReview({ listing, signedIn, reviewableBookingId }: Props) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const startReview = () => {
    if (!signedIn) {
      setNotice('Sign in to review a service you have booked.');
      return;
    }
    if (!reviewableBookingId) {
      setNotice('Book this service first — you can leave a review as soon as a booking exists.');
      return;
    }
    setNotice(null);
    setReviewing(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={startReview}
        className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
          reviewableBookingId
            ? 'border-amber-700/60 text-amber-300 hover:border-amber-500'
            : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
        }`}
      >
        <Star size={14} className={reviewableBookingId ? 'fill-amber-400 text-amber-400' : ''} />
        Write a review
      </button>

      {notice && (
        <p className="text-xs text-slate-400 bg-slate-950 border border-slate-800 rounded-lg p-3">
          {notice}
          {!signedIn && (
            <>
              {' '}
              <Link
                href={`/login?next=/listings/${listing.listing_id}`}
                className="text-indigo-400 hover:text-indigo-300 underline"
              >
                Sign in
              </Link>
            </>
          )}
        </p>
      )}

      {reviewing && reviewableBookingId && (
        <ReviewDialog
          bookingId={reviewableBookingId}
          listingTitle={listing.title}
          onClose={() => setReviewing(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}