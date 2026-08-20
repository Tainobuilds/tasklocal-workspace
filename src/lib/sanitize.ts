/**
 * Validation and repair layer for marketplace data.
 *
 * The JSON in `data/` is deliberately dirty (duplicate ids, out-of-range
 * ratings, negative prices, unparseable availability, dangling foreign keys).
 * Everything the customer app renders passes through here first, so a single
 * malformed record is dropped or repaired instead of breaking the page.
 *
 * Every rejection produces a `DataIssue` rather than a silent drop, so bad
 * records can be surfaced for review instead of just disappearing.
 */

import {
  SERVICE_TYPES,
  type AvailabilitySlot,
  type CleanListing,
  type CleanProvider,
  type DataIssue,
  type ListingsResult,
  type Period,
  type ServiceType,
  type Weekday,
} from './types';

/** Maps both 3-letter and full weekday names onto the canonical short form. */
const DAY_LOOKUP: Record<string, Weekday> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
  sat: 'Sat', saturday: 'Sat',
  sun: 'Sun', sunday: 'Sun',
};

/** Clock hour each period maps to when a slot becomes a real appointment. */
export const PERIOD_HOURS: Record<Period, number> = { AM: 9, PM: 14 };

export function slotKey(slot: AvailabilitySlot): string {
  return `${slot.day} ${slot.period}`;
}

/**
 * Parses one availability entry like `"Mon AM"`.
 * Returns `null` for anything that isn't a recognisable day + period pair
 * (`"Any time"`, `""`, numbers, objects).
 */
export function parseSlot(raw: unknown): AvailabilitySlot | null {
  if (typeof raw !== 'string') return null;

  const parts = raw.trim().toLowerCase().split(/\s+/);
  if (parts.length !== 2) return null;

  const day = DAY_LOOKUP[parts[0]];
  if (!day) return null;

  const period = parts[1] === 'am' ? 'AM' : parts[1] === 'pm' ? 'PM' : null;
  if (!period) return null;

  return { day, period };
}

/**
 * Parses a listing's `availability` array, discarding unparseable entries.
 * A non-array value yields an empty list rather than throwing.
 */
export function parseAvailability(raw: unknown): { slots: AvailabilitySlot[]; rejected: string[] } {
  if (!Array.isArray(raw)) {
    return { slots: [], rejected: raw == null ? [] : [String(raw)] };
  }

  const slots: AvailabilitySlot[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const slot = parseSlot(entry);
    if (!slot) {
      rejected.push(String(entry));
      continue;
    }
    const key = slotKey(slot);
    if (seen.has(key)) continue; // duplicate slot, harmless — collapse it
    seen.add(key);
    slots.push(slot);
  }

  return { slots, rejected };
}

/**
 * A price is only usable if it is a finite, non-negative number.
 * Negative amounts and strings like `"call for quote"` are treated as missing
 * so the UI shows a placeholder instead of `$-40` or `$NaN`.
 */
export function coercePrice(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

/**
 * Ratings outside 1-5 are discarded rather than clamped: a stored `6.2` is a
 * data error, and clamping it to `5` would present a corrupt value as a real one.
 */
export function coerceRating(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 1 || raw > 5) return null;
  return raw;
}

export function coerceReviewCount(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return null;
  return raw;
}

/** Trims a string field, mapping blank/absent/non-string values to `null`. */
function coerceText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coerceServiceType(raw: unknown): ServiceType | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return (SERVICE_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ServiceType)
    : null;
}

/**
 * Reads a record's update timestamp for de-duplication.
 * The schema has no dedicated field yet, so several spellings are accepted;
 * records without one fall back to document order (see `dedupeById`).
 */
function updatedAtMs(record: Record<string, unknown>): number | null {
  for (const key of ['updated_at', 'updatedAt', 'last_updated', 'lastUpdated']) {
    const value = record[key];
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Collapses records sharing an id, keeping the most recently updated one.
 * When no record carries a usable timestamp, the later position in the file
 * wins — a sync that appends is assumed to append the newer copy.
 */
export function dedupeById<T extends Record<string, unknown>>(
  records: T[],
  idKey: keyof T & string,
): { unique: T[]; duplicates: Array<{ id: string; kept: 'timestamp' | 'position' }> } {
  const byId = new Map<string, { record: T; index: number; ts: number | null }>();
  const duplicates: Array<{ id: string; kept: 'timestamp' | 'position' }> = [];

  records.forEach((record, index) => {
    const id = String(record[idKey]);
    const ts = updatedAtMs(record);
    const existing = byId.get(id);

    if (!existing) {
      byId.set(id, { record, index, ts });
      return;
    }

    // Prefer an explicit timestamp; otherwise the later record in the file.
    const winner =
      existing.ts != null && ts != null
        ? (ts > existing.ts ? { record, index, ts } : existing)
        : { record, index, ts };

    duplicates.push({
      id,
      kept: existing.ts != null && ts != null ? 'timestamp' : 'position',
    });
    byId.set(id, winner);
  });

  return { unique: [...byId.values()].map((entry) => entry.record), duplicates };
}

/** Validates the provider file and indexes it by id for joining onto listings. */
export function sanitizeProviders(raw: unknown): {
  providers: Map<string, CleanProvider>;
  issues: DataIssue[];
} {
  const issues: DataIssue[] = [];
  const providers = new Map<string, CleanProvider>();

  if (!Array.isArray(raw)) {
    issues.push({
      scope: 'provider',
      id: '—',
      severity: 'dropped',
      reason: 'Provider data was not an array; all providers ignored.',
    });
    return { providers, issues };
  }

  const withIds = raw.filter((record): record is Record<string, unknown> => {
    const ok = !!record && typeof record === 'object' && typeof (record as never)['provider_id'] === 'string';
    if (!ok) {
      issues.push({
        scope: 'provider',
        id: '—',
        severity: 'dropped',
        reason: 'Provider record has no usable provider_id.',
      });
    }
    return ok;
  });

  const { unique, duplicates } = dedupeById(withIds, 'provider_id');
  for (const dup of duplicates) {
    issues.push({
      scope: 'provider',
      id: dup.id,
      severity: 'repaired',
      reason: `Duplicate provider_id; kept the record chosen by ${dup.kept}.`,
    });
  }

  for (const record of unique) {
    const id = String(record['provider_id']);
    const rating = coerceRating(record['provider_avg_rating']);
    const count = coerceReviewCount(record['provider_review_count']);

    if (record['provider_avg_rating'] != null && rating === null) {
      issues.push({
        scope: 'provider',
        id,
        severity: 'repaired',
        reason: `provider_avg_rating ${JSON.stringify(record['provider_avg_rating'])} is not a number within 1-5; rating hidden.`,
      });
    }

    providers.set(id, {
      provider_id: id,
      provider_name: coerceText(record['provider_name']),
      // A rating with zero ratings behind it is not a rating anyone can trust.
      provider_avg_rating: count === 0 ? null : rating,
      provider_review_count: count,
    });
  }

  return { providers, issues };
}

/**
 * Turns the raw listings + providers files into a render-safe listing list.
 *
 * Listings are dropped when they are unusable (no title, no valid
 * service_type, no id) and repaired when a non-essential field is bad.
 * Only `listing_status === "active"` listings are ever returned.
 */
export function sanitizeListings(rawListings: unknown, rawProviders: unknown): ListingsResult {
  const { providers, issues } = sanitizeProviders(rawProviders);

  if (!Array.isArray(rawListings)) {
    issues.push({
      scope: 'listing',
      id: '—',
      severity: 'dropped',
      reason: 'Listing data was not an array; nothing to display.',
    });
    return { listings: [], issues };
  }

  const withIds: Record<string, unknown>[] = [];
  rawListings.forEach((record, index) => {
    if (!record || typeof record !== 'object' || typeof (record as never)['listing_id'] !== 'string') {
      issues.push({
        scope: 'listing',
        id: `#${index}`,
        severity: 'dropped',
        reason: 'Listing has no usable listing_id.',
      });
      return;
    }
    withIds.push(record as Record<string, unknown>);
  });

  const { unique, duplicates } = dedupeById(withIds, 'listing_id');
  for (const dup of duplicates) {
    issues.push({
      scope: 'listing',
      id: dup.id,
      severity: 'repaired',
      reason: `Duplicate listing_id; kept the record chosen by ${dup.kept}.`,
    });
  }

  const listings: CleanListing[] = [];

  for (const record of unique) {
    const id = String(record['listing_id']);

    // Each listing is validated in isolation so one bad record cannot abort the loop.
    try {
      const status = coerceText(record['listing_status'])?.toLowerCase() ?? null;

      // Anything not explicitly active is withheld from customers. An
      // unrecognised status fails closed rather than leaking a bad listing.
      if (status !== 'active') {
        if (status !== 'flagged' && status !== 'removed') {
          issues.push({
            scope: 'listing',
            id,
            severity: 'dropped',
            reason: `listing_status ${JSON.stringify(record['listing_status'])} is not a recognised status; hidden from customers.`,
          });
        }
        continue;
      }

      const title = coerceText(record['title']);
      if (!title) {
        issues.push({
          scope: 'listing',
          id,
          severity: 'dropped',
          reason: 'Required field `title` is missing or blank.',
        });
        continue;
      }

      const serviceType = coerceServiceType(record['service_type']);
      if (!serviceType) {
        issues.push({
          scope: 'listing',
          id,
          severity: 'dropped',
          reason: `service_type ${JSON.stringify(record['service_type'])} is missing or outside ${SERVICE_TYPES.join('/')}.`,
        });
        continue;
      }

      const price = coercePrice(record['price']);
      if (record['price'] != null && price === null) {
        issues.push({
          scope: 'listing',
          id,
          severity: 'repaired',
          reason: `price ${JSON.stringify(record['price'])} is negative or non-numeric; treated as unavailable.`,
        });
      }

      const { slots, rejected } = parseAvailability(record['availability']);
      if (rejected.length > 0) {
        issues.push({
          scope: 'listing',
          id,
          severity: 'repaired',
          reason: `Unparseable availability discarded: ${rejected.map((r) => JSON.stringify(r)).join(', ')}.`,
        });
      }

      const providerId = coerceText(record['provider_id']);
      const provider = providerId ? providers.get(providerId) ?? null : null;
      if (providerId && !provider) {
        issues.push({
          scope: 'listing',
          id,
          severity: 'repaired',
          reason: `provider_id "${providerId}" does not exist in the provider data; provider details hidden.`,
        });
      }

      listings.push({
        listing_id: id,
        provider_id: providerId,
        title,
        service_type: serviceType,
        description: coerceText(record['description']),
        price,
        availability: slots,
        provider,
      });
    } catch (error) {
      issues.push({
        scope: 'listing',
        id,
        severity: 'dropped',
        reason: `Unexpected error while validating: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return { listings, issues };
}

/**
 * Normalises a price filter range, swapping the bounds when a min above a max
 * would otherwise silently return zero results.
 */
export function normalizePriceRange(
  min: number | null,
  max: number | null,
): { min: number | null; max: number | null; swapped: boolean } {
  if (min != null && max != null && min > max) {
    return { min: max, max: min, swapped: true };
  }
  return { min, max, swapped: false };
}
