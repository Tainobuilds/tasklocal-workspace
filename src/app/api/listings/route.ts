import { NextResponse } from 'next/server';

import { readJsonFile, writeJsonFile } from '@/lib/server-data';

/**
 * Raw listing data, as used by the provider dashboard and the matching chatbot.
 * The customer app reads the validated catalogue instead — see `getCatalogue`.
 */
export async function GET() {
  const listings = await readJsonFile('listings.json');
  // An unreadable or malformed file yields an empty catalogue rather than a 500,
  // so the dashboard renders its empty state instead of breaking.
  return NextResponse.json(Array.isArray(listings) ? listings : []);
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
