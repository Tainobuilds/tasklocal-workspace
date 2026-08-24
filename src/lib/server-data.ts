import fs from 'fs/promises';
import path from 'path';

import {
  buildProviderRatings,
  sanitizeReviews,
  summarizeListingReviews,
  summarizeProviderReviews,
  type ListingReviewSummary,
} from './reviews';
import {
  dedupeById,
  sanitizeBookings,
  sanitizeListings,
  sanitizeProviders,
} from './sanitize';
import { getSessionCustomerId } from './session';
import { buildTriageData, type TriageData } from './trust-safety';
import type {
  BookingsResult,
  CleanListing,
  CleanProvider,
  ListingsResult,
  ProviderRatingRollup,
} from './types';

const DATA_DIR = path.join(process.cwd(), 'data');

/**
 * Reads and parses one JSON file from `data/`.
 * A missing, empty, or malformed file resolves to `null` instead of throwing,
 * so one broken file cannot take down a page that reads several.
 */
export async function readJsonFile(filename: string): Promise<unknown | null> {
  try {
    const contents = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    if (contents.trim().length === 0) return null;
    return JSON.parse(contents);
  } catch (error) {
    console.error(`[tasklocal] Could not read data/${filename}:`, error);
    return null;
  }
}

export async function writeJsonFile(filename: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(DATA_DIR, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/**
 * Rolls provider ratings up from the review file.
 *
 * Every loader below passes this into the sanitizers, so provider scores shown
 * anywhere in the app — catalogue, listing page, triage queue — are computed
 * from real reviews rather than read from the stored `provider_avg_rating`.
 */
async function loadProviderRatings(): Promise<Map<string, ProviderRatingRollup>> {
  const raw = await readJsonFile('reviews.json');
  return buildProviderRatings(sanitizeReviews(raw));
}

/**
 * Loads the customer-facing listing catalogue: active listings only, validated,
 * de-duplicated, and joined to their providers.
 *
 * Rejected records are logged server-side so they can be reviewed, and also
 * returned as `issues` for display in the data-quality panel.
 */
export async function getCatalogue(): Promise<ListingsResult> {
  try {
    const [rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);

    const result = sanitizeListings(rawListings, rawProviders, derivedRatings);

    for (const issue of result.issues) {
      const log = issue.severity === 'dropped' ? console.warn : console.info;
      log(`[tasklocal:data] ${issue.severity} ${issue.scope} ${issue.id} — ${issue.reason}`);
    }

    return result;
  } catch (error) {
    console.error('[tasklocal] Failed to build the listing catalogue:', error);
    return {
      listings: [],
      issues: [
        {
          scope: 'listing',
          id: '—',
          severity: 'dropped',
          reason: `Catalogue could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * A single customer's booking history, newest first.
 *
 * Listings are resolved against the full listing file rather than the active
 * catalogue, so a booking survives its listing being flagged or removed.
 */
export async function getCustomerBookings(customerId: string): Promise<BookingsResult> {
  try {
    const [rawBookings, rawListings, rawProviders, derivedRatings] = await Promise.all([
      readJsonFile('bookings.json'),
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      loadProviderRatings(),
    ]);

    const { bookings, issues } = sanitizeBookings(
      rawBookings,
      rawListings,
      rawProviders,
      derivedRatings,
    );

    for (const issue of issues) {
      const log = issue.severity === 'dropped' ? console.warn : console.info;
      log(`[tasklocal:data] ${issue.severity} ${issue.scope} ${issue.id} — ${issue.reason}`);
    }

    const mine = bookings
      .filter((booking) => booking.customer_id === customerId)
      // Undated bookings sort to the top; they are the ones needing attention.
      .sort((a, b) => (b.scheduledAt ?? '9999').localeCompare(a.scheduledAt ?? '9999'));

    return { bookings: mine, issues };
  } catch (error) {
    console.error('[tasklocal] Failed to load bookings:', error);
    return {
      bookings: [],
      issues: [
        {
          scope: 'booking',
          id: '—',
          severity: 'dropped',
          reason: `Bookings could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

/**
 * Everything the trust & safety queue needs, validated in one pass.
 * A failure here returns an empty queue with the cause quarantined, so the
 * dashboard still renders and the team can see that something is wrong.
 */
export async function getTriageData(): Promise<TriageData> {
  try {
    const [rawReports, rawListings, rawProviders, rawBookings, derivedRatings] = await Promise.all([
      readJsonFile('reports.json'),
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      readJsonFile('bookings.json'),
      loadProviderRatings(),
    ]);

    const data = buildTriageData(
      rawReports,
      rawListings,
      rawProviders,
      rawBookings,
      new Date(),
      derivedRatings,
    );

    for (const item of data.quarantined) {
      console.warn(`[tasklocal:triage] quarantined report ${item.id} — ${item.reason}`);
    }

    return data;
  } catch (error) {
    console.error('[tasklocal] Failed to build triage data:', error);
    return {
      rows: [],
      quarantined: [
        {
          id: '—',
          reason: `Queue could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      autoFlags: [],
      metrics: { openCount: 0, avgResolutionDays: null, resolvedSampleSize: 0, flaggedListings: 0 },
    };
  }
}

export interface CustomerSummary {
  customer_id: string;
  customer_name: string | null;
  /** Saved address used to pre-fill the booking confirmation. */
  default_address: string | null;
}

/** The accounts offered on the sign-in screen. */
export async function getCustomers(): Promise<CustomerSummary[]> {
  try {
    const raw = await readJsonFile('customers.json');
    if (!Array.isArray(raw)) return [];

    const withIds = raw.filter(
      (record): record is Record<string, unknown> =>
        !!record && typeof record === 'object' && typeof (record as never)['customer_id'] === 'string',
    );
    const { unique } = dedupeById(withIds, 'customer_id');

    return unique
      .map((record) => ({
        customer_id: String(record['customer_id']),
        customer_name:
          typeof record['customer_name'] === 'string' && record['customer_name'].trim().length > 0
            ? record['customer_name'].trim()
            : null,
        default_address:
          typeof record['default_address'] === 'string' && record['default_address'].trim().length > 0
            ? record['default_address'].trim()
            : null,
      }))
      .sort((a, b) => a.customer_id.localeCompare(b.customer_id));
  } catch (error) {
    console.error('[tasklocal] Failed to load customers:', error);
    return [];
  }
}

/** The logged-in customer's record, or `null` when nobody is signed in. */
export async function getSessionCustomer(): Promise<CustomerSummary | null> {
  const customerId = await getSessionCustomerId();
  if (!customerId) return null;

  const customers = await getCustomers();
  return (
    customers.find((customer) => customer.customer_id === customerId) ?? {
      customer_id: customerId,
      customer_name: null,
      default_address: null,
    }
  );
}

export interface ListingDetail {
  listing: CleanListing;
  reviews: ListingReviewSummary;
}

/**
 * The customer's unreviewed booking for this listing, if any.
 *
 * Review eligibility is deliberately loose: any non-cancelled booking can be
 * reviewed — the customer may have already received the service, it may be
 * booked, or even still awaiting a time. The completed-only rule was dropped.
 */
export async function getReviewableBookingForListing(
  customerId: string,
  listingId: string,
): Promise<string | null> {
  try {
    const [rawBookings, rawReviews] = await Promise.all([
      readJsonFile('bookings.json'),
      readJsonFile('reviews.json'),
    ]);
    if (!Array.isArray(rawBookings)) return null;

    const reviewed = new Set(
      sanitizeReviews(rawReviews)
        .filter((review) => review.customer_id === customerId && review.booking_id)
        .map((review) => review.booking_id as string),
    );

    const match = rawBookings.find(
      (record) =>
        record &&
        typeof record === 'object' &&
        record.customer_id === customerId &&
        record.listing_id === listingId &&
        typeof record.booking_status === 'string' &&
        record.booking_status.toLowerCase() !== 'cancelled' &&
        typeof record.booking_id === 'string' &&
        !reviewed.has(record.booking_id),
    );

    return match ? (match.booking_id as string) : null;
  } catch (error) {
    console.error('[tasklocal] Failed to find a reviewable booking:', error);
    return null;
  }
}

/**
 * One listing for its detail page, plus its review rollup.
 * Returns `null` for anything not in the active customer catalogue, so a
 * flagged or removed listing cannot be reached by guessing its URL.
 */
export async function getListingDetail(listingId: string): Promise<ListingDetail | null> {
  try {
    const { listings } = await getCatalogue();
    const listing = listings.find((item) => item.listing_id === listingId);
    if (!listing) return null;

    const reviews = sanitizeReviews(await readJsonFile('reviews.json'));
    return { listing, reviews: summarizeListingReviews(reviews, listingId) };
  } catch (error) {
    console.error(`[tasklocal] Failed to load listing ${listingId}:`, error);
    return null;
  }
}

export interface ProviderDetail {
  provider: CleanProvider;
  /** The provider's currently active listings on the marketplace. */
  listings: CleanListing[];
  /** Reviews across every one of the provider's listings, newest first. */
  reviews: ListingReviewSummary;
}

/**
 * Everything the provider detail page needs, from the same sanitizers the rest
 * of the app uses so ratings stay consistent with the reviews behind them.
 * Returns `null` when the provider does not exist in the sanitised data.
 */
export async function getProviderDetail(providerId: string): Promise<ProviderDetail | null> {
  try {
    const [rawProviders, rawListings, rawReviews] = await Promise.all([
      readJsonFile('providers.json'),
      readJsonFile('listings.json'),
      readJsonFile('reviews.json'),
    ]);

    const reviews = sanitizeReviews(rawReviews);
    const derivedRatings = buildProviderRatings(reviews);
    const { providers } = sanitizeProviders(rawProviders, derivedRatings);

    const provider = providers.get(providerId) ?? null;
    if (!provider) return null;

    const { listings } = sanitizeListings(rawListings, rawProviders, derivedRatings);
    const mine = listings.filter((listing) => listing.provider_id === providerId);

    return {
      provider,
      listings: mine,
      reviews: summarizeProviderReviews(reviews, providerId),
    };
  } catch (error) {
    console.error(`[tasklocal] Failed to load provider ${providerId}:`, error);
    return null;
  }
}
