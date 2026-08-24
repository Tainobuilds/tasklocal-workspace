/**
 * Review validation and per-listing rollups.
 *
 * Ratings are the input to a number customers act on, so an out-of-range or
 * non-numeric rating is discarded rather than clamped — clamping `"five"` or
 * `0` into the average would quietly move a listing's score.
 */

import { dedupeById } from './sanitize';
import type { ProviderRatingRollup } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CleanReview {
  review_id: string;
  booking_id: string | null;
  listing_id: string | null;
  provider_id: string | null;
  customer_id: string | null;
  /** Integer 1-5, or `null` when the stored value was unusable. */
  rating: number | null;
  review_text: string | null;
  /** Strict `YYYY-MM-DD`, or `null` when unparseable. */
  review_date: string | null;
}

export interface ListingReviewSummary {
  reviews: CleanReview[];
  /** Mean of valid ratings only, or `null` when there are none. */
  averageRating: number | null;
  /** How many reviews contributed a usable rating. */
  ratedCount: number;
  /** Total reviews shown, including any with no usable rating. */
  totalCount: number;
}

function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function coerceReviewRating(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
  if (raw < 1 || raw > 5) return null;
  return raw;
}

function coerceReviewDate(raw: unknown): string | null {
  const value = text(raw);
  if (!value || !ISO_DATE.test(value)) return null;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? null : value;
}

export function sanitizeReviews(raw: unknown): CleanReview[] {
  if (!Array.isArray(raw)) return [];

  const withIds = raw.filter(
    (record): record is Record<string, unknown> =>
      !!record && typeof record === 'object' && typeof (record as never)['review_id'] === 'string',
  );
  const { unique } = dedupeById(withIds, 'review_id');

  const reviews: CleanReview[] = [];
  for (const record of unique) {
    try {
      reviews.push({
        review_id: String(record['review_id']),
        booking_id: text(record['booking_id']),
        listing_id: text(record['listing_id']),
        provider_id: text(record['provider_id']),
        customer_id: text(record['customer_id']),
        rating: coerceReviewRating(record['rating']),
        review_text: text(record['review_text']),
        review_date: coerceReviewDate(record['review_date']),
      });
    } catch {
      // One malformed review never costs us the rest of the section.
    }
  }
  return reviews;
}

/**
 * Rolls every provider's rating up from their actual reviews.
 *
 * Only reviews carrying a valid 1-5 rating count toward the average, so a
 * discarded `0` or `"five"` neither inflates nor deflates the score. A provider
 * with no usable ratings gets `null`, which the UI renders as "Insufficient
 * data" and which never trips the trust & safety auto-flag threshold.
 */
export function buildProviderRatings(reviews: CleanReview[]): Map<string, ProviderRatingRollup> {
  const totals = new Map<string, { sum: number; count: number }>();

  for (const review of reviews) {
    if (!review.provider_id || review.rating === null) continue;
    const entry = totals.get(review.provider_id) ?? { sum: 0, count: 0 };
    entry.sum += review.rating;
    entry.count += 1;
    totals.set(review.provider_id, entry);
  }

  const rollups = new Map<string, ProviderRatingRollup>();
  for (const [providerId, { sum, count }] of totals) {
    rollups.set(providerId, {
      averageRating: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
      ratedCount: count,
    });
  }
  return rollups;
}

/** Newest first; reviews with no usable date sort last rather than jumping ahead. */
export function summarizeListingReviews(reviews: CleanReview[], listingId: string): ListingReviewSummary {
  return summarize(reviews.filter((review) => review.listing_id === listingId));
}

/** A provider's reviews across every listing they run, newest first. */
export function summarizeProviderReviews(reviews: CleanReview[], providerId: string): ListingReviewSummary {
  return summarize(reviews.filter((review) => review.provider_id === providerId));
}

function summarize(reviews: CleanReview[]): ListingReviewSummary {
  const mine = [...reviews].sort((a, b) =>
    (b.review_date ?? '0000-00-00').localeCompare(a.review_date ?? '0000-00-00'),
  );

  const ratings = mine
    .map((review) => review.rating)
    .filter((rating): rating is number => rating !== null);

  const averageRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
      : null;

  return {
    reviews: mine,
    averageRating,
    ratedCount: ratings.length,
    totalCount: mine.length,
  };
}
