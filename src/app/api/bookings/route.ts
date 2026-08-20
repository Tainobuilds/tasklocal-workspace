import { NextResponse } from 'next/server';

import { DEMO_CUSTOMER_ID } from '@/lib/demo-session';
import { PERIOD_HOURS, slotKey } from '@/lib/sanitize';
import { getCatalogue, readJsonFile, writeJsonFile } from '@/lib/server-data';
import { WEEKDAYS, type Period, type Weekday } from '@/lib/types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves a `YYYY-MM-DD` string to its weekday.
 * Parsed at UTC noon so the weekday cannot slide across a timezone boundary.
 */
function weekdayFor(date: string): Weekday | null {
  if (!DATE_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // `getUTCDay()` is 0-indexed from Sunday; WEEKDAYS starts at Monday.
  return WEEKDAYS[(parsed.getUTCDay() + 6) % 7];
}

function nextBookingId(existing: unknown): string {
  const count = Array.isArray(existing) ? existing.length : 0;
  return `book_${600 + count}`;
}

export async function GET() {
  const bookings = await readJsonFile('bookings.json');
  return NextResponse.json(Array.isArray(bookings) ? bookings : []);
}

/**
 * Creates a booking after re-validating everything server-side: the listing
 * must still be active and valid, and the requested slot must genuinely appear
 * in that listing's availability.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const { listing_id: listingId, date, period, address, payment_intent_id: paymentIntentId } = body;

    if (typeof listingId !== 'string' || typeof date !== 'string') {
      return NextResponse.json({ error: 'listing_id and date are required.' }, { status: 400 });
    }
    if (period !== 'AM' && period !== 'PM') {
      return NextResponse.json({ error: 'period must be "AM" or "PM".' }, { status: 400 });
    }
    if (!address || typeof address !== 'object' || typeof address.line1 !== 'string' || !address.line1.trim()) {
      return NextResponse.json({ error: 'A service address is required.' }, { status: 400 });
    }

    const { listings } = await getCatalogue();
    const listing = listings.find((item) => item.listing_id === listingId);
    if (!listing) {
      return NextResponse.json({ error: 'That listing is no longer available.' }, { status: 404 });
    }

    const weekday = weekdayFor(date);
    if (!weekday) {
      return NextResponse.json({ error: 'date must be a valid YYYY-MM-DD value.' }, { status: 400 });
    }

    // The client already restricts the calendar, but a slot outside the
    // listing's availability must never be accepted on trust.
    const requested = slotKey({ day: weekday, period: period as Period });
    const offered = listing.availability.some((slot) => slotKey(slot) === requested);
    if (!offered) {
      return NextResponse.json(
        { error: `This provider is not available on ${requested}.` },
        { status: 409 },
      );
    }

    const scheduledAt = `${date}T${String(PERIOD_HOURS[period as Period]).padStart(2, '0')}:00:00Z`;
    const existing = await readJsonFile('bookings.json');
    const bookings = Array.isArray(existing) ? existing : [];

    const booking = {
      booking_id: nextBookingId(bookings),
      listing_id: listing.listing_id,
      customer_id: DEMO_CUSTOMER_ID,
      scheduled_at: scheduledAt,
      booking_status: 'confirmed',
      address,
      payment_intent_id: typeof paymentIntentId === 'string' ? paymentIntentId : null,
    };

    bookings.push(booking);
    await writeJsonFile('bookings.json', bookings);

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error('[tasklocal] Booking creation failed:', error);
    return NextResponse.json({ error: 'Could not create the booking.' }, { status: 500 });
  }
}
