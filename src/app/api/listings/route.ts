import { NextResponse } from 'next/server';

import { readJsonFile, writeJsonFile } from '@/lib/server-data';
import { coercePrice } from '@/lib/sanitize';

/**
 * Listing data for the provider dashboard and matching chatbot: deduplicated
 * by id and price-sanitized, but — unlike the customer catalogue in
 * getCatalogue() — every listing_status is kept (not just "active"), so
 * providers can still see and manage their own flagged/removed/pending listings.
 */
export async function GET() {
  const raw = await readJsonFile('listings.json');
  const listings = Array.isArray(raw) ? raw : [];

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of listings) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    // New listings created through this app use `id`; seeded ones use `listing_id`.
    const id = String(record.listing_id ?? record.id ?? '');
    if (!id) continue;
    // Later entries win on a collision, matching the file's own append order.
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

    const existing = await readJsonFile('listings.json');
    const listings = Array.isArray(existing) ? existing : [];

    const incomingId = String(
      (body as Record<string, unknown>).listing_id ?? (body as Record<string, unknown>).id ?? '',
    );
    const collides = listings.some((record) => {
      if (!record || typeof record !== 'object') return false;
      const id = String((record as Record<string, unknown>).listing_id ?? (record as Record<string, unknown>).id ?? '');
      return id !== '' && id === incomingId;
    });
    if (incomingId && collides) {
      return NextResponse.json(
        { error: `A listing with id ${incomingId} already exists.` },
        { status: 409 },
      );
    }

    // listing_status is never trusted from the client: this endpoint only ever
    // publishes new active listings, so a POST body can't be used to smuggle a
    // listing back into the catalogue under a status a moderator already revoked.
    const newListing = { ...(body as Record<string, unknown>), listing_status: 'active' };

    listings.push(newListing);
    await writeJsonFile('listings.json', listings);

    return NextResponse.json({ success: true, listing: newListing });
  } catch (error) {
    console.error('[tasklocal] Failed to save new listing:', error);
    return NextResponse.json({ error: 'Failed to save new listing' }, { status: 500 });
  }
}
