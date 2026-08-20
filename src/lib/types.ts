/** Domain types for the TaskLocal customer app. */

export const SERVICE_TYPES = ['cleaning', 'handyman', 'moving'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

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

export interface CleanProvider {
  provider_id: string;
  provider_name: string | null;
  /** `null` unless it is a number within 1-5. */
  provider_avg_rating: number | null;
  /** `null` unless it is a non-negative integer. */
  provider_review_count: number | null;
}

/** One rejected/repaired record, kept so the dashboard can surface data problems. */
export interface DataIssue {
  scope: 'listing' | 'provider';
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
