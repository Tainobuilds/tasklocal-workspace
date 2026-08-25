import { NextResponse } from 'next/server';

import { guardSlot } from '@/lib/booking-guard';
import { readBookings } from '@/lib/server-data';
import { getSessionCustomerId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const bookings = await readBookings();
  return NextResponse.json(bookings);
}

/**
 * Creates a booking for the signed-in customer.
 *
 * The slot is re-validated here even though the client already ran the
 * pre-payment check, because the provider's calendar can change in between.
 */
export async function POST(request: Request) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Service temporarily unavailable — Supabase is not configured.' }, { status: 503 });
    }

    // Attribution comes from the session cookie, never the request body, so a
    // booking cannot be filed against another customer.
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in to book.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const address = typeof body.address === 'string' ? body.address.trim() : '';
    if (!address) {
      return NextResponse.json({ error: 'A service address is required.' }, { status: 400 });
    }

    const guard = await guardSlot(body.listing_id, body.date, body.period);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const booking = {
      booking_id: `book-${Date.now()}`,
      listing_id: guard.listing.listing_id,
      customer_id: customerId,
      scheduled_at: guard.scheduledAt,
      booking_status: 'confirmed',
      address,
      payment_intent_id: typeof body.payment_intent_id === 'string' ? body.payment_intent_id : null,
    };

    const { data, error } = await supabase.from('bookings').insert(booking).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, booking: data });
  } catch (error) {
    console.error('[tasklocal] Booking creation failed:', error);
    return NextResponse.json({ error: 'Could not create the booking.' }, { status: 500 });
  }
}
