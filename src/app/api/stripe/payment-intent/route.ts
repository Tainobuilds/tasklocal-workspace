import { NextResponse } from 'next/server';

import { getCatalogue } from '@/lib/server-data';
import { totalInCents } from '@/lib/pricing';
import { getStripe } from '@/lib/stripe';

/**
 * Creates a PaymentIntent for a listing.
 *
 * The amount is derived server-side from the catalogue, never from the client,
 * so a tampered request cannot change what gets charged.
 */
export async function POST(request: Request) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not configured on this server.', code: 'stripe_not_configured' },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const listingId = body && typeof body.listing_id === 'string' ? body.listing_id : null;
    if (!listingId) {
      return NextResponse.json({ error: 'listing_id is required.' }, { status: 400 });
    }

    const { listings } = await getCatalogue();
    const listing = listings.find((item) => item.listing_id === listingId);

    if (!listing) {
      return NextResponse.json({ error: 'That listing is no longer available.' }, { status: 404 });
    }
    if (listing.price === null) {
      return NextResponse.json(
        { error: 'This listing has no valid price and cannot be paid for online.' },
        { status: 409 },
      );
    }

    const intent = await stripe.paymentIntents.create({
      amount: totalInCents(listing.price),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { listing_id: listing.listing_id, provider_id: listing.provider_id ?? 'unknown' },
    });

    return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (error) {
    console.error('[tasklocal] PaymentIntent creation failed:', error);
    return NextResponse.json({ error: 'Could not start the payment.' }, { status: 500 });
  }
}
