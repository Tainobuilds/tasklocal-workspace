import { NextResponse } from 'next/server';

import { readListings } from '@/lib/server-data';
import { coercePrice } from '@/lib/sanitize';
import { supabase } from '@/lib/supabase';

/**
 * Listing data for the provider dashboard and matching chatbot: every
 * listing_status is kept (not just "active"), so providers can still see
 * and manage their own flagged/removed/pending listings — unlike the
 * customer catalogue in getCatalogue(), which filters to active only.
 */
export async function GET() {
  const raw = await readListings();

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = String(record.listing_id ?? '');
    if (!id) continue;
    byId.set(id, { ...record, price: coercePrice(record.price) });
  }

  return NextResponse.json([...byId.values()]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a listing object.' }, { status: 400 });
    }

    // listing_status is never trusted from the client: this endpoint only ever
    // publishes new active listings, so a POST body can't be used to smuggle a
    // listing back into the catalogue under a status a moderator already revoked.
    const newListing = { ...(body as Record<string, unknown>), listing_status: 'active' };

    const { data, error } = await supabase.from('listings').insert(newListing).select().single();

    if (error) {
      // Postgres unique_violation on the listing_id primary key.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `A listing with id ${(body as Record<string, unknown>).listing_id} already exists.` },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, listing: data });
  } catch (error) {
    console.error('[tasklocal] Failed to save new listing:', error);
    return NextResponse.json({ error: 'Failed to save new listing' }, { status: 500 });
  }
}
