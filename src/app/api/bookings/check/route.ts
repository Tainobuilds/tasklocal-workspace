import { NextResponse } from 'next/server';

import { guardSlot } from '@/lib/booking-guard';
import { getSessionCustomerId } from '@/lib/session';

/**
 * Validates a slot *before* the customer reaches Stripe.
 *
 * Without this the double-booking check would only run after payment, which
 * would mean charging someone and then refusing their booking.
 */
export async function POST(request: Request) {
  try {
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in to book.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const guard = await guardSlot(body.listing_id, body.date, body.period);
    if (!guard.ok) {
      return NextResponse.json({ available: false, error: guard.error }, { status: guard.status });
    }

    return NextResponse.json({ available: true, scheduled_at: guard.scheduledAt });
  } catch (error) {
    console.error('[tasklocal] Slot check failed:', error);
    return NextResponse.json({ error: 'Could not check that time slot.' }, { status: 500 });
  }
}
