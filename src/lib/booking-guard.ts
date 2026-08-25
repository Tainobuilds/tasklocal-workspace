/**
 * The single gate every booking attempt passes through.
 *
 * Shared by the pre-payment check and the booking write so both enforce exactly
 * the same rules — a slot that passes the check must not be rejected after the
 * customer has paid, and a slot that fails must never slip through the write.
 */

import { findBookingConflict, slotInterval } from './scheduling';
import { buildListingIndex, PERIOD_HOURS, slotKey } from './sanitize';
import { getCatalogue, readJsonFile, readListings } from './server-data';
import { WEEKDAYS, type CleanListing, type Period, type Weekday } from './types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type GuardResult =
  | { ok: true; listing: CleanListing; scheduledAt: string }
  | { ok: false; status: number; error: string };

/** Parsed at UTC noon so the weekday cannot slide across a timezone boundary. */
function weekdayFor(date: string): Weekday | null {
  if (!DATE_PATTERN.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // `getUTCDay()` is 0-indexed from Sunday; WEEKDAYS starts at Monday.
  return WEEKDAYS[(parsed.getUTCDay() + 6) % 7];
}

export function scheduledAtFor(date: string, period: Period): string {
  return `${date}T${String(PERIOD_HOURS[period]).padStart(2, '0')}:00:00Z`;
}

/**
 * Validates a requested slot: the listing must be active, the slot must be one
 * the provider published, and the provider must be free at that time across
 * every listing they offer.
 */
export async function guardSlot(
  listingId: unknown,
  date: unknown,
  period: unknown,
  options: { ignoreBookingId?: string } = {},
): Promise<GuardResult> {
  if (typeof listingId !== 'string' || typeof date !== 'string') {
    return { ok: false, status: 400, error: 'listing_id and date are required.' };
  }
  if (period !== 'AM' && period !== 'PM') {
    return { ok: false, status: 400, error: 'period must be "AM" or "PM".' };
  }

  const { listings } = await getCatalogue();
  const listing = listings.find((item) => item.listing_id === listingId);
  if (!listing) {
    return { ok: false, status: 404, error: 'That listing is no longer available.' };
  }

  const weekday = weekdayFor(date);
  if (!weekday) {
    return { ok: false, status: 400, error: 'date must be a valid YYYY-MM-DD value.' };
  }

  // The client restricts the calendar, but an unpublished slot must never be
  // accepted on trust.
  const requestedKey = slotKey({ day: weekday, period });
  if (!listing.availability.some((slot) => slotKey(slot) === requestedKey)) {
    return { ok: false, status: 409, error: `This provider is not available on ${requestedKey}.` };
  }

  const requestedInterval = slotInterval(date, period);
  if (requestedInterval.startMs < Date.now()) {
    return { ok: false, status: 409, error: 'That time has already passed. Please choose a later slot.' };
  }

  const providerId = listing.provider?.provider_id ?? listing.provider_id;
  if (!providerId) {
    return {
      ok: false,
      status: 409,
      error: 'This listing has no provider on record, so availability cannot be confirmed.',
    };
  }

  // A provider is one person: collect every listing they offer, because a
  // clash on any of them blocks this slot too.
  const [rawListings, rawProviders, rawBookings] = await Promise.all([
    readListings(),
    readJsonFile('providers.json'),
    readJsonFile('bookings.json'),
  ]);

  const providerListingIds = new Set<string>();
  for (const ref of buildListingIndex(rawListings, rawProviders).values()) {
    if (ref.provider?.provider_id === providerId) providerListingIds.add(ref.listing_id);
  }
  providerListingIds.add(listing.listing_id);

  const outcome = findBookingConflict(rawBookings, providerListingIds, requestedInterval, options);

  if (outcome.kind === 'conflict') {
    return {
      ok: false,
      status: 409,
      error: `This provider is already booked at that time (${requestedKey}). Please choose a different slot.`,
    };
  }

  if (outcome.kind === 'indeterminate') {
    // Fail safe: an unreadable existing booking date means we cannot prove the
    // provider is free, so we refuse rather than risk a real double-booking.
    console.warn(
      `[tasklocal] Slot check inconclusive for ${listing.listing_id}: booking ${outcome.bookingId} has an unreadable date.`,
    );
    return {
      ok: false,
      status: 409,
      error: "We couldn't confirm this provider is free at that time. Please try a different time.",
    };
  }

  return { ok: true, listing, scheduledAt: scheduledAtFor(date, period) };
}
