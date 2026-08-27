'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, LogIn, TriangleAlert, X } from 'lucide-react';

import BookingCalendar, { describeSlot } from './BookingCalendar';
import PaymentStep from './PaymentStep';
import { formatUsd, priceBreakdown } from '@/lib/pricing';
import type { CleanListing, Period } from '@/lib/types';

type Step = 'schedule' | 'confirm' | 'payment' | 'done';

const STEP_ORDER: Step[] = ['schedule', 'confirm', 'payment'];
const STEP_LABELS: Record<Step, string> = {
  schedule: 'Choose a time',
  confirm: 'Review & confirm',
  payment: 'Payment',
  done: 'Booked',
};

interface Props {
  listing: CleanListing;
  /** The signed-in customer's saved address, pre-filled and editable. */
  defaultAddress: string | null;
  signedIn: boolean;
  onClose: () => void;
}

export default function BookingFlow({ listing, defaultAddress, signedIn, onClose }: Props) {
  const [step, setStep] = useState<Step>('schedule');
  const [date, setDate] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [address, setAddress] = useState(defaultAddress ?? '');
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const breakdown = listing.price === null ? null : priceBreakdown(listing.price);

  /**
   * Confirms the provider is still free. Run before entering payment so a
   * double-booking is caught before the customer is ever charged.
   */
  const checkSlot = async (): Promise<boolean> => {
    if (!date || !period) return false;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/bookings/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.listing_id, date, period }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'That time is not available.');
        return false;
      }
      return true;
    } catch (caught) {
      console.error('[tasklocal] Slot check failed:', caught);
      setError('Could not reach the server.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const createBooking = async (intentId: string | null) => {
    if (!date || !period) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          date,
          period,
          address,
          payment_intent_id: intentId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // A clash discovered here is rare but must be shown, not swallowed.
        setError(data.error ?? 'Could not create the booking.');
        setStep('confirm');
        return;
      }

      setBookingId(data.booking?.booking_id ?? null);
      setStep('done');
    } catch (caught) {
      console.error('[tasklocal] Booking request failed:', caught);
      setError('Could not reach the booking service.');
      setStep('confirm');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${listing.title}`}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-brand-primary/20 dark:bg-slate-950/80 backdrop-blur-sm p-4 sm:p-8"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-brand-line dark:border-slate-800 rounded-2xl shadow-spruce-md my-auto">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-brand-line dark:border-slate-800">
          <div>
            <p className="text-xs uppercase tracking-wider text-brand-primary dark:text-emerald-400 font-semibold">
              {STEP_LABELS[step]}
            </p>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">{listing.title}</h2>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">
              {listing.provider?.provider_name ?? 'Provider information unavailable'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking"
            className="text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        {!signedIn ? (
          <div className="p-8 text-center space-y-3">
            <LogIn size={32} className="text-slate-400 dark:text-slate-500 mx-auto" />
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Sign in to book</h3>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">
              Bookings are recorded against your account, so you need to be signed in first.
            </p>
            <Link
              href={`/login?next=/listings/${listing.listing_id}`}
              className="inline-block mt-1 bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            {step !== 'done' && (
              <div className="flex gap-1.5 px-5 pt-4">
                {STEP_ORDER.map((s, index) => (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full ${
                      index <= STEP_ORDER.indexOf(step) ? 'bg-brand-primary' : 'bg-slate-200 dark:bg-slate-800'
                    }`}
                  />
                ))}
              </div>
            )}

            <div className="p-5">
              {error && step !== 'payment' && (
                <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 rounded-lg p-3 mb-4">
                  <TriangleAlert size={15} className="shrink-0 mt-0.5" />
                  {error}
                </p>
              )}

              {step === 'schedule' && (
                <div className="space-y-5">
                  <BookingCalendar
                    listing={listing}
                    selectedDate={date}
                    selectedPeriod={period}
                    onSelect={(nextDate, nextPeriod) => {
                      setDate(nextDate);
                      setPeriod(nextPeriod);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    disabled={!date || !period || submitting}
                    onClick={async () => {
                      if (await checkSlot()) setStep('confirm');
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    {date && period ? 'Continue to review' : 'Select a day and time'}
                  </button>
                </div>
              )}

              {step === 'confirm' && date && period && (
                <div className="space-y-5">
                  <dl className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    <SummaryRow label="Service" value={listing.title} />
                    <SummaryRow
                      label="Provider"
                      value={listing.provider?.provider_name ?? 'Provider information unavailable'}
                    />
                    <SummaryRow label="Date & time" value={describeSlot(date, period)} />
                    {breakdown && (
                      <>
                        <SummaryRow label="Price" value={formatUsd(breakdown.price)} />
                        <SummaryRow label="Service fee" value={formatUsd(breakdown.serviceFee)} />
                        <SummaryRow label="Total charge" value={formatUsd(breakdown.total)} emphasis />
                      </>
                    )}
                  </dl>

                  <label className="block">
                    <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Service address</span>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-1.5">
                      {defaultAddress
                        ? 'Pre-filled from your saved address — edit if this job is somewhere else.'
                        : 'No saved address on your account yet.'}
                    </p>
                    <textarea
                      value={address}
                      onChange={(event) => setAddress(event.target.value)}
                      rows={3}
                      placeholder="Street, unit, city, state, ZIP"
                      className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent resize-y"
                    />
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStep('schedule')}
                      disabled={submitting}
                      className="px-4 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={submitting || address.trim().length === 0}
                      onClick={async () => {
                        // Last gate before the card is charged.
                        if (await checkSlot()) setStep('payment');
                      }}
                      className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      {submitting && <Loader2 size={14} className="animate-spin" />}
                      Confirm and pay
                    </button>
                  </div>
                </div>
              )}

              {step === 'payment' && (
                <PaymentStep
                  listing={listing}
                  onBack={() => setStep('confirm')}
                  onPaid={(intentId) => {
                    setPaymentIntentId(intentId);
                    createBooking(intentId);
                  }}
                />
              )}

              {step === 'done' && date && period && (
                <div className="text-center space-y-3 py-4">
                  <CheckCircle2 size={40} className="text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">Booking confirmed</h3>
                  <p className="text-sm text-brand-ink-muted dark:text-slate-400">
                    {listing.title} on {describeSlot(date, period)}.
                  </p>
                  {bookingId && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 font-mono">Reference: {bookingId}</p>
                  )}
                  {!paymentIntentId && (
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      No payment was taken because Stripe is not configured on this server.
                    </p>
                  )}
                  <div className="flex gap-3 justify-center pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    >
                      Keep browsing
                    </button>
                    <Link
                      href="/bookings"
                      className="bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      View my bookings
                    </Link>
                  </div>
                </div>
              )}

              {step === 'payment' && submitting && (
                <p className="flex items-center justify-center gap-2 text-sm text-brand-ink-muted dark:text-slate-400 mt-4">
                  <Loader2 size={14} className="animate-spin" /> Creating your booking…
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6 py-2.5">
      <dt className="text-slate-500 dark:text-slate-500 shrink-0">{label}</dt>
      <dd
        className={`text-right whitespace-pre-line ${
          emphasis ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-900 dark:text-slate-200'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
