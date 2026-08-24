import { NextResponse } from 'next/server';

import { readJsonFile, writeJsonFile } from '@/lib/server-data';

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

    const raw = await readJsonFile('listings.json');
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'Listing data is unavailable.' }, { status: 500 });
    }

    // Duplicate listing_ids exist in the data; moderating one copy and not the
    // other would leave a withdrawn listing reachable through its twin.
    let updated = 0;
    const next = raw.map((record) => {
      if (!record || typeof record !== 'object' || record.listing_id !== listingId) return record;
      updated += 1;
      return { ...record, listing_status: status };
    });

    if (updated === 0) {
      return NextResponse.json({ error: `No listing found with id ${listingId}.` }, { status: 404 });
    }

    await writeJsonFile('listings.json', next);
    return NextResponse.json({ success: true, listingId, listing_status: status, updated });
  } catch (error) {
    console.error('[tasklocal] Failed to update listing status:', error);
    return NextResponse.json({ error: 'Could not update the listing.' }, { status: 500 });
  }
}
