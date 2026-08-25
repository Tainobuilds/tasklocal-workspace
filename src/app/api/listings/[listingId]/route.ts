import { NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';

const LISTING_STATUSES = ['active', 'flagged', 'removed'] as const;

/**
 * Changes a listing's moderation status from the trust & safety panel.
 * This is the enforcement half of triage: flagging or removing a listing
 * withdraws it from the customer catalogue immediately.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/listings/[listingId]'>) {
  try {
    const { listingId } = await ctx.params;
    const body = await request.json().catch(() => null);

    const status =
      body && typeof body.listing_status === 'string' ? body.listing_status.toLowerCase() : null;
    if (!status || !(LISTING_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `listing_status must be one of ${LISTING_STATUSES.join(', ')}.` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ listing_status: status })
      .eq('listing_id', listingId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ error: `No listing found with id ${listingId}.` }, { status: 404 });
    }

    return NextResponse.json({ success: true, listingId, listing_status: status, updated: data.length });
  } catch (error) {
    console.error('[tasklocal] Failed to update listing status:', error);
    return NextResponse.json({ error: 'Could not update the listing.' }, { status: 500 });
  }
}
