'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Loader2, Star, TriangleAlert, XCircle } from 'lucide-react';

import ReviewDialog from './ReviewDialog';
import type { CleanBooking } from '@/lib/types';

interface Props {
  booking: CleanBooking;
  /** Computed on the server so the button set never shifts during hydration. */
  isPast: boolean;
  hasReview: boolean;
}

export default function BookingActions({ booking, isPast, hasReview }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const title = booking.listing?.title ?? 'this service';

  const transition = async (status: 'cancelled' | 'completed') => {
    setBusy(status);
    setError(null);
    try {
      const response = await fetch(`/api/bookings/${booking.booking_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_status: status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'That action could not be completed.');
        return;
      }
      router.refresh();
      // Completing a job is the natural moment to ask for a review.
      if (status === 'completed') setReviewing(true);
    } catch (caught) {
      console.error('[tasklocal] Booking action failed:', caught);
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  };

  const buttons: React.ReactNode[] = [];

  // A review can be left from the moment a booking exists — it no longer has
  // to wait for the job to be marked completed. Only cancelled bookings are out.
  if (booking.status !== 'cancelled') {
    if (hasReview) {
      buttons.push(
        <span key="reviewed" className="flex items-center gap-1.5 text-xs text-slate-500">
          <Star size={13} className="fill-amber-400 text-amber-400" />
          Review submitted
        </span>,
      );
    } else {
      buttons.push(
        <button
          key="review"
          type="button"
          onClick={() => setReviewing(true)}
          className="flex items-center justify-center gap-1.5 flex-1 text-xs font-medium py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          <Star size={13} />
          Leave a review
        </button>,
      );
    }
  }

  if (booking.status === 'completed') {
    // Nothing else to do on a completed booking.
  } else if (booking.status !== 'cancelled') {
    if (booking.scheduledAt === null) {
      buttons.push(
        <span key="nodate" className="text-xs text-slate-500 italic">
          Needs a scheduled time before it can be cancelled or completed.
        </span>,
      );
    } else if (isPast) {
      buttons.push(
        <button
          key="complete"
          type="button"
          disabled={busy !== null}
          onClick={() => transition('completed')}
          className="flex items-center justify-center gap-1.5 flex-1 text-xs font-medium py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white transition-colors"
        >
          {busy === 'completed' ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />}
          Mark completed
        </button>,
      );
    } else {
      buttons.push(
        <button
          key="cancel"
          type="button"
          disabled={busy !== null}
          onClick={() => transition('cancelled')}
          className="flex items-center justify-center gap-1.5 flex-1 text-xs font-medium py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-rose-800/60 hover:text-rose-300 disabled:opacity-50 transition-colors"
        >
          {busy === 'cancelled' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
          Cancel booking
        </button>,
      );
    }
  }

  if (buttons.length === 0 && !error) return null;

  return (
    <div className="pt-3 mt-1 border-t border-slate-800 space-y-2">
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg p-2">
          <TriangleAlert size={12} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}
      {buttons.length > 0 && <div className="flex items-center gap-2">{buttons}</div>}

      {reviewing && (
        <ReviewDialog
          bookingId={booking.booking_id}
          listingTitle={title}
          onClose={() => setReviewing(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
