'use client';

import { useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';

import { formatUsd, priceBreakdown } from '@/lib/pricing';
import type { CleanListing } from '@/lib/types';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/** Created once per page load, and only when a key is actually present. */
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise() {
  if (!publishableKey) return null;
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}

type Status =
  | { kind: 'loading' }
  | { kind: 'ready'; clientSecret: string; paymentIntentId: string }
  | { kind: 'unconfigured' }
  | { kind: 'error'; message: string };

interface Props {
  listing: CleanListing;
  /** Receives the PaymentIntent id, or `null` when Stripe is not configured. */
  onPaid: (paymentIntentId: string | null) => void;
  onBack: () => void;
}

export default function PaymentStep({ listing, onPaid, onBack }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const response = await fetch('/api/stripe/payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_id: listing.listing_id }),
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (response.status === 503 || !publishableKey) {
          setStatus({ kind: 'unconfigured' });
          return;
        }
        if (!response.ok || !data.clientSecret) {
          setStatus({ kind: 'error', message: data.error ?? 'Could not start the payment.' });
          return;
        }
        setStatus({
          kind: 'ready',
          clientSecret: data.clientSecret,
          paymentIntentId: data.paymentIntentId,
        });
      } catch (error) {
        if (cancelled) return;
        console.error('[tasklocal] Payment setup failed:', error);
        setStatus({ kind: 'error', message: 'Could not reach the payment service.' });
      }
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [listing.listing_id]);

  const total = listing.price === null ? null : priceBreakdown(listing.price).total;

  if (status.kind === 'loading') {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
        <Loader2 size={16} className="animate-spin" /> Preparing secure payment…
      </div>
    );
  }

  if (status.kind === 'unconfigured') {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 bg-amber-950/40 border border-amber-800/60 rounded-xl p-4">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-300">Stripe is not configured</p>
            <p className="text-slate-400 mt-1">
              Add <code className="text-slate-300">STRIPE_SECRET_KEY</code> and{' '}
              <code className="text-slate-300">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> to{' '}
              <code className="text-slate-300">.env.local</code> to take real test payments. You can
              continue without paying to preview the rest of the flow.
            </p>
          </div>
        </div>
        <StepButtons
          onBack={onBack}
          onNext={() => onPaid(null)}
          nextLabel={total === null ? 'Continue' : `Continue without paying (${formatUsd(total)})`}
        />
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 bg-rose-950/40 border border-rose-800/60 rounded-xl p-4 text-sm">
          <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-rose-200">{status.message}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          Back
        </button>
      </div>
    );
  }

  const stripe = getStripePromise();
  if (!stripe) {
    return (
      <div className="text-sm text-slate-400">
        Stripe could not be loaded in the browser.
        <button type="button" onClick={onBack} className="ml-2 underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret: status.clientSecret,
        appearance: { theme: 'night', variables: { colorPrimary: '#6366f1' } },
      }}
    >
      <CheckoutForm
        total={total}
        onBack={onBack}
        onPaid={() => onPaid(status.paymentIntentId)}
      />
    </Elements>
  );
}

function CheckoutForm({
  total,
  onPaid,
  onBack,
}: {
  total: number | null;
  onPaid: () => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      // Keep the customer in the flow unless the payment method demands a redirect.
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? 'Your payment could not be processed.');
      setSubmitting(false);
      return;
    }

    onPaid();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />

      {error && (
        <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg p-3">
          {error}
        </p>
      )}

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Lock size={12} /> Card details are handled directly by Stripe.
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-800 hover:border-slate-700 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {total === null ? 'Pay' : `Pay ${formatUsd(total)}`}
        </button>
      </div>
    </form>
  );
}

function StepButtons({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onBack}
        className="px-4 py-2 rounded-lg text-sm text-slate-300 border border-slate-800 hover:border-slate-700"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onNext}
        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
      >
        {nextLabel}
      </button>
    </div>
  );
}
