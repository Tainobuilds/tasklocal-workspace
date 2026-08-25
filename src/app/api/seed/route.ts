import { NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';

/**
 * Seeds a small set of representative listings, including one flagged
 * listing so the Trust & Safety queue has something to show immediately.
 * Uses stable ids and upsert so re-running this endpoint is safe.
 */
const SEED_LISTINGS = [
  {
    listing_id: 'list-seed-001',
    provider_id: 'prov_001',
    title: 'Studio Apartment Standard Clean',
    service_type: 'cleaning',
    description: 'Light dusting, vacuuming, and kitchen wipe-down',
    price: 75,
    availability: [{ day: 'Tue', period: 'AM' }, { day: 'Thu', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-002',
    provider_id: 'prov_002',
    title: 'Leaky Faucet Repair',
    service_type: 'handyman',
    description: 'Fix or replace kitchen and bathroom faucets',
    price: 60,
    availability: [{ day: 'Mon', period: 'PM' }, { day: 'Fri', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-003',
    provider_id: 'prov_003',
    title: 'Studio Move - Local',
    service_type: 'moving',
    description: 'Load, transport, and unload within 10 miles',
    price: 200,
    availability: [{ day: 'Sat', period: 'AM' }],
    listing_status: 'active',
  },
  {
    listing_id: 'list-seed-004',
    provider_id: 'prov_003',
    title: '2-Person Furniture Move',
    service_type: 'moving',
    description: 'Two movers, one truck, up to 3 hours',
    price: 150,
    availability: [{ day: 'Sat', period: 'PM' }],
    listing_status: 'flagged',
  },
];

export async function GET() {
  const { data, error } = await supabase
    .from('listings')
    .upsert(SEED_LISTINGS, { onConflict: 'listing_id' })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, seeded: data });
}
