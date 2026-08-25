import { NextResponse } from 'next/server';

import { getCatalogue } from '@/lib/server-data';

/**
 * The same validated, active-only listing catalogue Browse renders
 * server-side, exposed for client-side polling. Unlike /api/listings, this
 * never returns a flagged/removed/pending listing.
 */
export async function GET() {
  const { listings } = await getCatalogue();
  return NextResponse.json(listings);
}
