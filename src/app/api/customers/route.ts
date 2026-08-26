import { NextResponse } from 'next/server';

import { getCustomers } from '@/lib/server-data';

/**
 * Customer directory for the provider dashboard to resolve a booking's
 * customer_id into a display name — read-only, same trust model as the
 * rest of this app (no auth gate on any GET route).
 */
export async function GET() {
  const customers = await getCustomers();
  return NextResponse.json(customers);
}
