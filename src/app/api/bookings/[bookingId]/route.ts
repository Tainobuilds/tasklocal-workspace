import { NextResponse } from 'next/server';

import { getSessionCustomerId } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const ALLOWED = ['cancelled', 'completed'] as const;

/**
 * Cancels or completes a booking.
 *
 * Both transitions are gated on time as well as ownership: a job cannot be
 * completed before it has happened, and a past job cannot be cancelled.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/bookings/[bookingId]'>) {
  try {
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { bookingId } = await ctx.params;
    const body = await request.json().catch(() => null);
    const status = body && typeof body.booking_status === 'string' ? body.booking_status.toLowerCase() : null;

    if (!status || !(ALLOWED as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `booking_status must be one of ${ALLOWED.join(', ')}.` },
        { status: 400 },
      );
    }

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!booking) {
      return NextResponse.json({ error: 'No such booking.' }, { status: 404 });
    }

    // A customer may only act on their own bookings.
    if (booking.customer_id !== customerId) {
      return NextResponse.json({ error: 'That booking belongs to another account.' }, { status: 403 });
    }

    const current = typeof booking.booking_status === 'string' ? booking.booking_status.toLowerCase() : '';
    if (current === 'cancelled') {
      return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 });
    }
    if (current === 'completed' && status === 'cancelled') {
      return NextResponse.json({ error: 'A completed booking cannot be cancelled.' }, { status: 409 });
    }

    const scheduledMs = new Date(booking.scheduled_at).getTime();
    const hasValidDate = Number.isFinite(scheduledMs);

    if (status === 'completed') {
      if (!hasValidDate) {
        return NextResponse.json(
          { error: 'This booking has no valid scheduled time, so it cannot be completed.' },
          { status: 409 },
        );
      }
      if (scheduledMs > Date.now()) {
        return NextResponse.json(
          { error: 'This booking cannot be marked complete until its scheduled time has passed.' },
          { status: 409 },
        );
      }
    }

    if (status === 'cancelled' && hasValidDate && scheduledMs <= Date.now()) {
      return NextResponse.json(
        { error: 'This booking is in the past and can no longer be cancelled.' },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ booking_status: status })
      .eq('booking_id', bookingId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, booking: updated });
  } catch (error) {
    console.error('[tasklocal] Failed to update booking:', error);
    return NextResponse.json({ error: 'Could not update the booking.' }, { status: 500 });
  }
}
