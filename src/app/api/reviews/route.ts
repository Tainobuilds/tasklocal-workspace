import { NextResponse } from 'next/server';

import { coerceReviewRating } from '@/lib/reviews';
import { readBookings, readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
import { getSessionCustomerId } from '@/lib/session';

function nextReviewId(existing: unknown): string {
  const count = Array.isArray(existing) ? existing.length : 0;
  return `rev_${2100 + count}`;
}

/**
 * Records a review against a booking.
 *
 * The booking must belong to the signed-in customer. Any booking — pending,
 * confirmed, or completed — can be reviewed; only cancelled bookings are
 * excluded, since no service ever happened.
 */
export async function POST(request: Request) {
  try {
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in to leave a review.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const bookingId = body && typeof body.booking_id === 'string' ? body.booking_id.trim() : '';
    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id is required.' }, { status: 400 });
    }

    const rating = coerceReviewRating(body?.rating);
    if (rating === null) {
      return NextResponse.json(
        { error: 'rating must be a whole number between 1 and 5.' },
        { status: 400 },
      );
    }

    const rawBookings = (await readBookings()) as unknown;
    if (!Array.isArray(rawBookings)) {
      return NextResponse.json({ error: 'Booking data is unavailable.' }, { status: 500 });
    }

    const booking = rawBookings.find(
      (record) => record && typeof record === 'object' && record.booking_id === bookingId,
    );
    if (!booking) {
      return NextResponse.json({ error: 'No such booking.' }, { status: 404 });
    }
    if (booking.customer_id !== customerId) {
      return NextResponse.json({ error: 'That booking belongs to another account.' }, { status: 403 });
    }

    const status = typeof booking.booking_status === 'string' ? booking.booking_status.toLowerCase() : '';
    if (status === 'cancelled') {
      return NextResponse.json(
        { error: 'Cancelled bookings cannot be reviewed — the service never happened.' },
        { status: 409 },
      );
    }

    const rawReviews = await readJsonFile('reviews.json');
    const reviews = Array.isArray(rawReviews) ? rawReviews : [];

    if (reviews.some((record) => record?.booking_id === bookingId && record?.customer_id === customerId)) {
      return NextResponse.json(
        { error: 'You have already reviewed this booking.' },
        { status: 409 },
      );
    }

    const reviewText = typeof body.review_text === 'string' ? body.review_text.trim() : '';
    const review = {
      review_id: nextReviewId(reviews),
      booking_id: bookingId,
      listing_id: typeof booking.listing_id === 'string' ? booking.listing_id : null,
      // Derived from the booking, not the client, so a review cannot be
      // attached to a provider the customer never dealt with.
      provider_id: null as string | null,
      customer_id: customerId,
      rating,
      review_text: reviewText,
      review_date: new Date().toISOString().slice(0, 10),
    };

    const rawListings = (await readListings()) as unknown;
    if (Array.isArray(rawListings) && review.listing_id) {
      const listing = rawListings.find(
        (record) => record && typeof record === 'object' && record.listing_id === review.listing_id,
      );
      review.provider_id = typeof listing?.provider_id === 'string' ? listing.provider_id : null;
    }

    reviews.push(review);
    await writeJsonFile('reviews.json', reviews);

    return NextResponse.json({ success: true, review });
  } catch (error) {
    console.error('[tasklocal] Failed to save review:', error);
    return NextResponse.json({ error: 'Could not save the review.' }, { status: 500 });
  }
}
