import { NextResponse } from 'next/server';

import { parseSlot, slotKey } from '@/lib/sanitize';
import { SERVICE_TYPES } from '@/lib/types';
import { supabase } from '@/lib/supabase';

const LISTING_STATUSES = ['active', 'flagged', 'removed'] as const;

/**
 * Updates a listing. Handles two distinct callers in one endpoint:
 * the trust & safety panel's moderation actions (listing_status only —
 * flagging/removing withdraws a listing from the customer catalogue
 * immediately), and the provider's own edits to their listing's details
 * (title/service_type/price/description/availability). Each field is
 * validated only if present, so either caller can PATCH just what it owns.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/listings/[listingId]'>) {
  try {
    const { listingId } = await ctx.params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if ('listing_status' in body) {
      const status = typeof body.listing_status === 'string' ? body.listing_status.toLowerCase() : null;
      if (!status || !(LISTING_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json(
          { error: `listing_status must be one of ${LISTING_STATUSES.join(', ')}.` },
          { status: 400 },
        );
      }
      updates.listing_status = status;
    }

    if ('title' in body) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return NextResponse.json({ error: 'title cannot be empty.' }, { status: 400 });
      }
      updates.title = title;
    }

    if ('service_type' in body) {
      if (!(SERVICE_TYPES as readonly string[]).includes(body.service_type)) {
        return NextResponse.json(
          { error: `service_type must be one of ${SERVICE_TYPES.join(', ')}.` },
          { status: 400 },
        );
      }
      updates.service_type = body.service_type;
    }

    if ('price' in body) {
      if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) {
        return NextResponse.json({ error: 'price must be a non-negative number.' }, { status: 400 });
      }
      updates.price = body.price;
    }

    if ('description' in body) {
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      updates.description = description || 'No description provided.';
    }

    if ('availability' in body) {
      if (!Array.isArray(body.availability)) {
        return NextResponse.json({ error: 'availability must be an array.' }, { status: 400 });
      }
      // Unparseable entries are silently dropped, matching parseAvailability()'s
      // graceful-degradation convention elsewhere in this codebase — a
      // malformed slot from a stray API caller shouldn't fail the whole edit.
      const slots = new Set<string>();
      for (const entry of body.availability) {
        const slot = parseSlot(entry);
        if (slot) slots.add(slotKey(slot));
      }
      updates.availability = [...slots];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('listings')
      .update(updates)
      .eq('listing_id', listingId)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ error: `No listing found with id ${listingId}.` }, { status: 404 });
    }

    return NextResponse.json({ success: true, listingId, listing: data[0] });
  } catch (error) {
    console.error('[tasklocal] Failed to update listing:', error);
    return NextResponse.json({ error: 'Could not update the listing.' }, { status: 500 });
  }
}
