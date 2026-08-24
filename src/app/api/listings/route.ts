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
    const newListing = await request.json();
    const existing = await readJsonFile('listings.json');
    const listings = Array.isArray(existing) ? existing : [];

    listings.push(newListing);
    await writeJsonFile('listings.json', listings);

    return NextResponse.json({ success: true, listing: newListing });
  } catch (error) {
    console.error('[tasklocal] Failed to save new listing:', error);
    return NextResponse.json({ error: 'Failed to save new listing' }, { status: 500 });
  }
}
