'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, X } from 'lucide-react';

import BookingCalendar, { describeSlot } from './BookingCalendar';
import PaymentStep from './PaymentStep';
import { formatUsd, priceBreakdown } from '@/lib/pricing';
import type { Address, CleanListing, Period } from '@/lib/types';

type Step = 'schedule' | 'address' | 'payment' | 'confirm' | 'done';

const STEP_ORDER: Step[] = ['schedule', 'address', 'payment', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  schedule: 'Choose a time',
  address: 'Service address',
  payment: 'Payment',
  confirm: 'Review & confirm',
  done: 'Booked',
};

const EMPTY_ADDRESS: Address = { line1: '', line2: '', city: '', state: '', postal_code: '' };

interface Props {
  listing: CleanListing;
  onClose: () => void;
}

export default function BookingFlow({ listing, onClose }: Props) {
  const [step, setStep] = useState<Step>('schedule');
  const [date, setDate] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  // The card blocks booking when price is null, so this is always a real number here.
  const breakdown = listing.price === null ? null : priceBreakdown(listing.price);

  const confirmBooking = async () => {
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
          payment_intent_id: paymentIntentId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? 'Could not create the booking.');
        return;
      }

      setBookingId(data.booking?.booking_id ?? null);
      setStep('done');
    } catch (caught) {
      console.error('[tasklocal] Booking request failed:', caught);
      setError('Could not reach the booking service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${listing.title}`}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 sm:p-8"
    >
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl my-auto">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-slate-800">
          <div>
            <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
              {STEP_LABELS[step]}
            </p>
            <h2 className="font-semibold text-slate-100 mt-1 leading-snug">{listing.title}</h2>
            <p className="text-sm text-slate-400">
              {listing.provider?.provider_name ?? 'Provider information unavailable'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking"
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </header>

        {step !== 'done' && (
          <div className="flex gap-1.5 px-5 pt-4">
            {STEP_ORDER.map((s, index) => {
              const currentIndex = STEP_ORDER.indexOf(step);
              return (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full ${
                    index <= currentIndex ? 'bg-indigo-500' : 'bg-slate-800'
                  }`}
                />
              );
            })}
          </div>
        )}

        <div className="p-5">
          {step === 'schedule' && (
            <div className="space-y-5">
              <BookingCalendar
                listing={listing}
                selectedDate={date}
                selectedPeriod={period}
                onSelect={(nextDate, nextPeriod) => {
                  setDate(nextDate);
                  setPeriod(nextPeriod);
                }}
              />
              <button
                type="button"
                disabled={!date || !period}
                onClick={() => setStep('address')}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {date && period ? 'Continue to address' : 'Select a day and time'}
              </button>
            </div>
          )}

          {step === 'address' && (
            <AddressStep
              address={address}
              onChange={setAddress}
              onBack={() => setStep('schedule')}
              onNext={() => setStep('payment')}
            />
          )}

          {step === 'payment' && (
            <PaymentStep
              listing={listing}
              onBack={() => setStep('address')}
              onPaid={(intentId) => {
                setPaymentIntentId(intentId);
                setStep('confirm');
              }}
            />
          )}

          {step === 'confirm' && date && period && (
            <div className="space-y-5">
              <dl className="divide-y divide-slate-800 text-sm">
                <SummaryRow label="Service" value={listing.title} />
                <SummaryRow
                  label="Provider"
                  value={listing.provider?.provider_name ?? 'Provider information unavailable'}
                />
                <SummaryRow label="Date & time" value={describeSlot(date, period)} />
                <SummaryRow
                  label="Address"
                  value={[address.line1, address.line2, `${address.city}, ${address.state} ${address.postal_code}`]
                    .filter((part) => part && part.trim().length > 0)
                    .join('\n')}
                />
                {breakdown && (
                  <>
                    <SummaryRow label="Price" value={formatUsd(breakdown.price)} />
                    <SummaryRow label="Service fee" value={formatUsd(breakdown.serviceFee)} />
                    <SummaryRow
                      label="Total charge"
                      value={formatUsd(breakdown.total)}
                      emphasis
                    />
                  </>
                )}
              </dl>

              <p className="text-xs text-slate-500">
                {paymentIntentId
                  ? 'Your payment has been processed. The booking is created only once you confirm below.'
                  : 'No payment was taken because Stripe is not configured on this server.'}
              </p>

              {error && (
                <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg p-3">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('payment')}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-800 hover:border-slate-700 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmBooking}
                  disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  Confirm booking
                </button>
              </div>
            </div>
          )}

          {step === 'done' && date && period && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 size={40} className="text-emerald-400 mx-auto" />
              <h3 className="font-semibold text-lg text-slate-100">Booking confirmed</h3>
              <p className="text-sm text-slate-400">
                {listing.title} on {describeSlot(date, period)}.
              </p>
              {bookingId && (
                <p className="text-xs text-slate-500 font-mono">Reference: {bookingId}</p>
              )}
              <div className="flex gap-3 justify-center pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg text-sm text-slate-300 border border-slate-800 hover:border-slate-700"
                >
                  Keep browsing
                </button>
                <Link
                  href="/bookings"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  View my bookings
                </Link>
              </div>
            </div>
          )}
        </div>
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
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd
        className={`text-right whitespace-pre-line ${
          emphasis ? 'text-emerald-400 font-semibold' : 'text-slate-200'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function AddressStep({
  address,
  onChange,
  onBack,
  onNext,
}: {
  address: Address;
  onChange: (next: Address) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const complete =
    address.line1.trim().length > 0 &&
    address.city.trim().length > 0 &&
    address.state.trim().length > 0 &&
    address.postal_code.trim().length > 0;

  const field = (key: keyof Address, label: string, required = true) => (
    <label className="block">
      <span className="text-xs text-slate-400">
        {label}
        {!required && <span className="text-slate-600"> (optional)</span>}
      </span>
      <input
        type="text"
        value={address[key]}
        required={required}
        onChange={(e) => onChange({ ...address, [key]: e.target.value })}
        className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
      />
    </label>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) onNext();
      }}
    >
      {field('line1', 'Street address')}
      {field('line2', 'Apt, suite, unit', false)}
      <div className="grid grid-cols-2 gap-3">
        {field('city', 'City')}
        {field('state', 'State')}
      </div>
      {field('postal_code', 'ZIP code')}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-800 hover:border-slate-700"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!complete}
          className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Continue to payment
        </button>
      </div>
    </form>
  );
}
