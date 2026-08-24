/**
 * Slot arithmetic and provider double-booking detection.
 *
 * A provider can only be in one place at a time, so conflicts are checked
 * across *all* of that provider's listings, not just the one being booked.
 */

import { PERIOD_HOURS } from './sanitize';
import type { Period } from './types';

/** Each published slot reserves a half-day block. */
export const SLOT_DURATION_HOURS = 4;
const MS_PER_HOUR = 3_600_000;

export interface Interval {
  startMs: number;
  endMs: number;
}

/**
 * Statuses that do NOT hold a provider's time.
 * Cancelling frees the slot, and a pending booking has not been accepted yet —
 * the spec blocks only on confirmed commitments.
 */
const NON_OCCUPYING = new Set(['cancelled', 'pending']);

/**
 * Whether an existing booking's status means the provider is committed.
 * An unrecognised status counts as occupying: we cannot prove it is free, and
 * over-blocking is safer than double-booking a real person.
 */
export function statusOccupiesSlot(rawStatus: unknown): boolean {
  const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  return !NON_OCCUPYING.has(status);
}

export function slotInterval(dateIso: string, period: Period): Interval {
  const startMs = new Date(`${dateIso}T${String(PERIOD_HOURS[period]).padStart(2, '0')}:00:00Z`).getTime();
  return { startMs, endMs: startMs + SLOT_DURATION_HOURS * MS_PER_HOUR };
}

/** Treats a stored `scheduled_at` as the start of a slot-length block. */
export function intervalFromTimestamp(raw: unknown): Interval | null {
  if (typeof raw !== 'string') return null;
  const startMs = new Date(raw).getTime();
  if (!Number.isFinite(startMs)) return null;
  return { startMs, endMs: startMs + SLOT_DURATION_HOURS * MS_PER_HOUR };
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

export type ConflictOutcome =
  | { kind: 'free' }
  | { kind: 'conflict'; bookingId: string; listingId: string | null; scheduledAt: string }
  /** A committed booking whose date cannot be read — we must assume a clash. */
  | { kind: 'indeterminate'; bookingId: string };

/**
 * Checks a requested slot against every booking belonging to `providerListingIds`.
 *
 * Fails safe: if a booking that holds the provider's time has a missing or
 * unparseable `scheduled_at`, the result is `indeterminate` and the caller must
 * block, because a conflict cannot be ruled out.
 */
export function findBookingConflict(
  rawBookings: unknown,
  providerListingIds: Set<string>,
  requested: Interval,
  options: { ignoreBookingId?: string } = {},
): ConflictOutcome {
  if (!Array.isArray(rawBookings)) {
    // No trustworthy booking data means no way to prove the slot is free.
    return { kind: 'indeterminate', bookingId: '—' };
  }

  for (const record of rawBookings) {
    if (!record || typeof record !== 'object') continue;

    const listingId = typeof record.listing_id === 'string' ? record.listing_id : null;
    if (!listingId || !providerListingIds.has(listingId)) continue;

    const bookingId = typeof record.booking_id === 'string' ? record.booking_id : '—';
    if (options.ignoreBookingId && bookingId === options.ignoreBookingId) continue;

    if (!statusOccupiesSlot(record.booking_status)) continue;

    const existing = intervalFromTimestamp(record.scheduled_at);
    if (!existing) return { kind: 'indeterminate', bookingId };

    if (overlaps(requested, existing)) {
      return {
        kind: 'conflict',
        bookingId,
        listingId,
        scheduledAt: String(record.scheduled_at),
      };
    }
  }

  return { kind: 'free' };
}
