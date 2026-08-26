/** Domain types for the Spruce customer app. */

export const SERVICE_TYPES = ['cleaning', 'handyman', 'moving'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Single source of truth for how a service type reads in the UI — every
 * category pill (provider cards, browse cards, filters) pulls from this
 * instead of keeping its own copy, so the wording can't drift apart. */
export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  cleaning: 'Cleaning',
  handyman: 'Handyman',
  moving: 'Moving',
};

/** Shared classes for a static category tag (not an interactive filter
 * button) — used on both the provider and browse listing cards so they
 * render pixel-identical. */
export const CATEGORY_PILL_CLASSES =
  'inline-block text-[11px] font-semibold text-brand-ink-muted dark:text-slate-400 bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 px-2.5 py-1 rounded-full';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type Period = 'AM' | 'PM';

/** A single parsed, validated availability slot (e.g. "Mon AM"). */
export interface AvailabilitySlot {
  day: Weekday;
  period: Period;
}

/**
 * A listing that has survived validation and is safe to render.
 * Fields that may legitimately be absent are `null` rather than `undefined`,
 * so the UI has one single case to check when picking a placeholder.
 */
export interface CleanListing {
  listing_id: string;
  provider_id: string | null;
  title: string;
  service_type: ServiceType;
  description: string | null;
  /** Flat USD cost. `null` when missing, negative, or non-numeric. */
  price: number | null;
  /** Only entries that parsed to a valid day/period. May be empty. */
  availability: AvailabilitySlot[];
  provider: CleanProvider | null;
}

/**
 * A provider's rating derived from actual review records.
 * This is the source of truth for ratings — the stored `provider_avg_rating`
 * field is not read, so a corrupt stored value cannot reach the UI.
 */
export interface ProviderRatingRollup {
  averageRating: number | null;
  /** Reviews that contributed a valid 1-5 rating. */
  ratedCount: number;
}

export interface CleanProvider {
  provider_id: string;
  provider_name: string | null;
  /** Short self-description shown on the listing detail page. */
  provider_bio: string | null;
  /** `null` unless it is a number within 1-5. */
  provider_avg_rating: number | null;
  /** `null` unless it is a non-negative integer. */
  provider_review_count: number | null;
}

/** One rejected/repaired record, kept so the dashboard can surface data problems. */
export interface DataIssue {
  scope: 'listing' | 'provider' | 'booking';
  /** The record's id, or a positional marker when the id itself is unusable. */
  id: string;
  severity: 'dropped' | 'repaired';
  reason: string;
}

export interface ListingsResult {
  listings: CleanListing[];
  issues: DataIssue[];
}

/** Filter state shared between the filter bar and the grid. */
export interface Filters {
  serviceTypes: ServiceType[];
  minPrice: number | null;
  maxPrice: number | null;
  slots: AvailabilitySlot[];
}

export interface BookingDraft {
  listing: CleanListing;
  slot: AvailabilitySlot;
  /** ISO 8601 timestamp for the concrete calendar date + slot period. */
  scheduledAt: string;
  address: Address;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
}

export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/**
 * The listing a booking points at, resolved *without* the active-only filter.
 * A customer who booked a listing that was later flagged or removed must still
 * see what they booked, so this deliberately includes non-active listings.
 */
export interface BookedListingRef {
  listing_id: string;
  title: string | null;
  service_type: ServiceType | null;
  description: string | null;
  price: number | null;
  listing_status: string | null;
  /** True when the listing is no longer offered on the marketplace. */
  withdrawn: boolean;
  provider: CleanProvider | null;
}

export interface CleanBooking {
  booking_id: string;
  customer_id: string | null;
  /** `null` when `scheduled_at` was missing or unparseable. */
  scheduledAt: string | null;
  status: BookingStatus | 'unknown';
  /** The original status string, kept so an unrecognised value can be shown. */
  rawStatus: string | null;
  /** Free-text service address; legacy structured addresses are flattened. */
  address: string | null;
  /** `null` when the booking references a listing that no longer exists. */
  listing: BookedListingRef | null;
  listingId: string | null;
}

export interface BookingsResult {
  bookings: CleanBooking[];
  issues: DataIssue[];
}
