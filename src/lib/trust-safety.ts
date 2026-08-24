/**
 * Validation and derivation for the internal trust & safety queue.
 *
 * Mirrors the customer-side approach in `sanitize.ts`, but with the opposite
 * bias: a customer-facing listing is hidden when it is questionable, whereas a
 * questionable *report* must stay visible and be marked, because hiding it
 * would mean a complaint silently going uninvestigated.
 */

import {
  buildListingIndex,
  dedupeById,
  sanitizeBookings,
  sanitizeProviders,
} from './sanitize';
import type { BookedListingRef, ProviderRatingRollup } from './types';

export const REPORT_STATUSES = ['open', 'under_review', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Statuses that stop the "days open" clock. */
const CLOSED_STATUSES: ReportStatus[] = ['resolved', 'dismissed'];

export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * The allowed reason vocabulary, each mapped to a triage severity that drives
 * row colour. Harm-to-person and harm-to-property reasons rank above service
 * complaints, and money disputes rank lowest.
 */
export const REPORT_REASONS: Record<string, { label: string; severity: Severity }> = {
  safety_concern: { label: 'Safety concern', severity: 'critical' },
  unsafe_behavior: { label: 'Unsafe behavior', severity: 'critical' },
  damaged_property: { label: 'Damaged property', severity: 'high' },
  unprofessional_behavior: { label: 'Unprofessional behavior', severity: 'high' },
  no_show: { label: 'No show', severity: 'medium' },
  poor_quality: { label: 'Poor quality', severity: 'medium' },
  late_arrival: { label: 'Late arrival', severity: 'low' },
  billing_dispute: { label: 'Billing dispute', severity: 'low' },

  // Categories offered to customers in the in-app report form. They live in the
  // same vocabulary as the legacy reasons above so a customer submission lands
  // in the queue already triaged, never in the "needs categorization" bucket.
  off_platform_payment: { label: 'Off-platform payment request', severity: 'high' },
  no_show_unresponsive: { label: 'No-show / unresponsive', severity: 'medium' },
  identity_mismatch: { label: 'Identity mismatch', severity: 'critical' },
  unsafe_or_threatening_behavior: { label: 'Unsafe or threatening behavior', severity: 'critical' },
  property_damage_negligent_work: { label: 'Property damage / negligent work', severity: 'high' },
  misleading_listing_or_hidden_fees: { label: 'Misleading listing or hidden fees', severity: 'medium' },
  other: { label: 'Other', severity: 'low' },
};

/** The report form's options, in the order the customer sees them. */
export const CUSTOMER_REPORT_CATEGORIES = [
  'off_platform_payment',
  'no_show_unresponsive',
  'identity_mismatch',
  'unsafe_or_threatening_behavior',
  'property_damage_negligent_work',
  'misleading_listing_or_hidden_fees',
  'other',
] as const;

export type CustomerReportCategory = (typeof CUSTOMER_REPORT_CATEGORIES)[number];

/** How long after a report the same customer reporting the same listing looks like a repeat. */
export const DUPLICATE_REPORT_WINDOW_HOURS = 24;

/** A provider is auto-surfaced only when the sample is large enough to trust. */
export const AUTO_FLAG_RATING_THRESHOLD = 3.0;
export const AUTO_FLAG_MIN_REVIEWS = 5;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DateIssue = 'missing' | 'malformed' | 'future';

export interface ProviderReportSummary {
  report_id: string;
  reasonLabel: string;
  status: string;
  date: string | null;
}

export interface ProviderRisk {
  provider_id: string;
  provider_name: string | null;
  avgRating: number | null;
  reviewCount: number | null;
  /** Rating or count unusable — shown as "Insufficient data", never auto-flagged. */
  insufficientData: boolean;
  priorReports: number;
  autoFlagged: boolean;
  listings: BookedListingRef[];
  reports: ProviderReportSummary[];
}

export interface ReportRow {
  report_id: string;
  reporterId: string | null;
  reasonKey: string | null;
  rawReason: string | null;
  reasonLabel: string;
  severity: Severity | 'unknown';
  status: ReportStatus | null;
  rawStatus: string | null;
  reportDate: string | null;
  resolvedDate: string | null;
  dateIssue: DateIssue | null;
  /** `null` whenever the date cannot support an honest calculation. */
  daysOpen: number | null;
  listingId: string | null;
  listing: BookedListingRef | null;
  providerId: string | null;
  provider: ProviderRisk | null;
  bookingId: string | null;
  details: string | null;
  /** Required fields that were absent, e.g. `["reporter_id"]`. */
  missingFields: string[];
  /** Cross-record inconsistencies worth a human look. */
  dataFlags: string[];
  /** Other report_ids folded into this row as duplicate submissions. */
  mergedIds: string[];
  needsCategorization: boolean;
}

export interface QuarantinedReport {
  id: string;
  reason: string;
}

export interface TriageData {
  rows: ReportRow[];
  quarantined: QuarantinedReport[];
  autoFlags: ProviderRisk[];
  metrics: {
    openCount: number;
    avgResolutionDays: number | null;
    resolvedSampleSize: number;
    flaggedListings: number;
  };
}

function text(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Strict `YYYY-MM-DD` parsing. Anything else is reported as an issue rather
 * than coerced, so a bad date can never produce a nonsensical "days open".
 */
function parseReportDate(raw: unknown, now: Date): { iso: string | null; issue: DateIssue | null } {
  const value = text(raw);
  if (!value) return { iso: null, issue: 'missing' };
  if (!ISO_DATE.test(value)) return { iso: null, issue: 'malformed' };

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return { iso: null, issue: 'malformed' };
  if (parsed.getTime() > now.getTime()) return { iso: value, issue: 'future' };

  return { iso: value, issue: null };
}

function daysBetween(fromIso: string, toMs: number): number {
  return Math.floor((toMs - new Date(`${fromIso}T00:00:00Z`).getTime()) / MS_PER_DAY);
}

/**
 * Identity used to spot the same complaint submitted twice under different ids.
 * Returns `null` unless all four parts are present — merging on partial data
 * would collapse unrelated incomplete reports into one row.
 */
function duplicateKey(record: Record<string, unknown>): string | null {
  const reporter = text(record['reporter_id']);
  const listing = text(record['listing_id']);
  const date = text(record['report_date']);
  const details = text(record['report_details']);
  if (!reporter || !listing || !date || !details) return null;
  return [reporter, listing, date, details.toLowerCase()].join('|');
}

export function buildTriageData(
  rawReports: unknown,
  rawListings: unknown,
  rawProviders: unknown,
  rawBookings: unknown,
  now: Date = new Date(),
  derivedRatings?: Map<string, ProviderRatingRollup>,
): TriageData {
  const quarantined: QuarantinedReport[] = [];

  const listingIndex = buildListingIndex(rawListings, rawProviders, derivedRatings);
  const { providers: providerIndex } = sanitizeProviders(rawProviders, derivedRatings);

  // Booking dates power the "report filed before the job" consistency check.
  const bookingDates = new Map<string, string>();
  try {
    const { bookings } = sanitizeBookings(rawBookings, rawListings, rawProviders, derivedRatings);
    for (const booking of bookings) {
      if (booking.scheduledAt) bookingDates.set(booking.booking_id, booking.scheduledAt);
    }
  } catch {
    // A broken bookings file only costs us one cross-check; the queue still renders.
  }

  if (!Array.isArray(rawReports)) {
    return {
      rows: [],
      quarantined: [{ id: '—', reason: 'Report data was not an array; the queue could not be built.' }],
      autoFlags: [],
      metrics: { openCount: 0, avgResolutionDays: null, resolvedSampleSize: 0, flaggedListings: 0 },
    };
  }

  // 1. Drop records with no usable id, then collapse exact id collisions.
  const withIds: Record<string, unknown>[] = [];
  rawReports.forEach((record, index) => {
    if (!record || typeof record !== 'object' || typeof (record as never)['report_id'] !== 'string') {
      quarantined.push({ id: `row #${index}`, reason: 'Report has no usable report_id.' });
      return;
    }
    withIds.push(record as Record<string, unknown>);
  });

  const { unique } = dedupeById(withIds, 'report_id');

  // 2. Fold near-identical submissions together before anything is rendered.
  const byDuplicateKey = new Map<string, Record<string, unknown>[]>();
  const singles: Record<string, unknown>[] = [];
  for (const record of unique) {
    const key = duplicateKey(record);
    if (!key) {
      singles.push(record);
      continue;
    }
    const group = byDuplicateKey.get(key);
    if (group) group.push(record);
    else byDuplicateKey.set(key, [record]);
  }

  const groups: Array<{ primary: Record<string, unknown>; merged: string[] }> = [
    ...singles.map((primary) => ({ primary, merged: [] as string[] })),
    ...[...byDuplicateKey.values()].map((group) => ({
      primary: group[0],
      merged: group.slice(1).map((record) => String(record['report_id'])),
    })),
  ];

  const rows: ReportRow[] = [];

  for (const { primary, merged } of groups) {
    const id = String(primary['report_id']);

    // Per-row isolation: one unparseable report is quarantined, never fatal.
    try {
      const rawReason = text(primary['report_reason']);
      const reasonKey = rawReason && REPORT_REASONS[rawReason.toLowerCase()] ? rawReason.toLowerCase() : null;

      const rawStatus = text(primary['report_status']);
      const normalizedStatus = rawStatus?.toLowerCase() ?? null;
      const status = (REPORT_STATUSES as readonly string[]).includes(normalizedStatus ?? '')
        ? (normalizedStatus as ReportStatus)
        : null;

      const { iso: reportDate, issue: dateIssue } = parseReportDate(primary['report_date'], now);
      const resolved = parseReportDate(primary['resolved_date'], now);
      const resolvedDate = resolved.issue === null ? resolved.iso : null;

      // Only compute an age when the arithmetic can be trusted.
      let daysOpen: number | null = null;
      if (reportDate && dateIssue === null) {
        const isClosed = status !== null && CLOSED_STATUSES.includes(status);
        const endMs = isClosed && resolvedDate
          ? new Date(`${resolvedDate}T00:00:00Z`).getTime()
          : now.getTime();
        const computed = daysBetween(reportDate, endMs);
        daysOpen = computed >= 0 ? computed : null;
      }

      const reporterId = text(primary['reporter_id']);
      const details = text(primary['report_details']);

      const missingFields: string[] = [];
      if (!reporterId) missingFields.push('reporter_id');
      if (!rawReason) missingFields.push('report_reason');
      if (!details) missingFields.push('report_details');

      const listingId = text(primary['listing_id']);
      const listing = listingId ? listingIndex.get(listingId) ?? null : null;
      const providerId = text(primary['provider_id']);
      const bookingId = text(primary['booking_id']);

      const dataFlags: string[] = [];
      if (listingId && !listing) dataFlags.push(`Listing ${listingId} does not exist in the listing data.`);
      if (providerId && !providerIndex.has(providerId)) {
        dataFlags.push(`Provider ${providerId} does not exist in the provider data.`);
      }
      if (bookingId && !bookingDates.has(bookingId)) {
        dataFlags.push(`Booking ${bookingId} does not exist in the booking data.`);
      }

      // Stamped at submission time when the same customer reported the same
      // listing inside the duplicate window — the team should link, not re-triage.
      if (primary['possible_duplicate'] === true) {
        const linked = text(primary['linked_report_id']);
        dataFlags.push(
          linked
            ? `Possible duplicate of ${linked} — same reporter and listing within ${DUPLICATE_REPORT_WINDOW_HOURS}h.`
            : `Possible duplicate — same reporter and listing within ${DUPLICATE_REPORT_WINDOW_HOURS}h.`,
        );
      }

      // A complaint predating the job it describes needs a human explanation.
      const bookingDate = bookingId ? bookingDates.get(bookingId) ?? null : null;
      if (reportDate && dateIssue === null && bookingDate && reportDate < bookingDate.slice(0, 10)) {
        dataFlags.push(
          `Report filed ${reportDate}, before booking ${bookingId} on ${bookingDate.slice(0, 10)}.`,
        );
      }

      rows.push({
        report_id: id,
        reporterId,
        reasonKey,
        rawReason,
        reasonLabel: reasonKey ? REPORT_REASONS[reasonKey].label : rawReason ?? 'Uncategorized',
        severity: reasonKey ? REPORT_REASONS[reasonKey].severity : 'unknown',
        status,
        rawStatus,
        reportDate,
        resolvedDate,
        dateIssue,
        daysOpen,
        listingId,
        listing,
        providerId,
        provider: null, // attached below, once prior-report counts are known
        bookingId,
        details,
        missingFields,
        dataFlags,
        mergedIds: merged,
        needsCategorization: reasonKey === null || status === null,
      });
    } catch (error) {
      quarantined.push({
        id,
        reason: `Could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // 3. Build provider risk profiles from the rows that survived.
  const listingsByProvider = new Map<string, BookedListingRef[]>();
  for (const listing of listingIndex.values()) {
    const owner = listing.provider?.provider_id;
    if (!owner) continue;
    const bucket = listingsByProvider.get(owner);
    if (bucket) bucket.push(listing);
    else listingsByProvider.set(owner, [listing]);
  }

  const risks = new Map<string, ProviderRisk>();
  const ensureRisk = (providerId: string): ProviderRisk => {
    const existing = risks.get(providerId);
    if (existing) return existing;

    const provider = providerIndex.get(providerId) ?? null;
    const avgRating = provider?.provider_avg_rating ?? null;
    const reviewCount = provider?.provider_review_count ?? null;
    // Either half being unusable makes the pair untrustworthy for thresholds.
    const insufficientData = avgRating === null || reviewCount === null;

    const risk: ProviderRisk = {
      provider_id: providerId,
      provider_name: provider?.provider_name ?? null,
      avgRating,
      reviewCount,
      insufficientData,
      priorReports: 0,
      autoFlagged:
        !insufficientData &&
        avgRating < AUTO_FLAG_RATING_THRESHOLD &&
        reviewCount >= AUTO_FLAG_MIN_REVIEWS,
      listings: listingsByProvider.get(providerId) ?? [],
      reports: [],
    };
    risks.set(providerId, risk);
    return risk;
  };

  for (const providerId of providerIndex.keys()) ensureRisk(providerId);

  for (const row of rows) {
    if (!row.providerId) continue;
    const risk = ensureRisk(row.providerId);
    risk.priorReports += 1;
    risk.reports.push({
      report_id: row.report_id,
      reasonLabel: row.reasonLabel,
      status: row.status ?? row.rawStatus ?? 'uncategorized',
      date: row.reportDate,
    });
    row.provider = risk;
  }

  // 4. Newest first; undated reports lead, since they need attention most.
  rows.sort((a, b) => (b.reportDate ?? '9999-99-99').localeCompare(a.reportDate ?? '9999-99-99'));

  // 5. Landing metrics.
  const openCount = rows.filter((row) => row.status === 'open').length;

  const resolutionSpans = rows
    .filter((row) => row.status !== null && CLOSED_STATUSES.includes(row.status))
    .map((row) =>
      row.reportDate && row.resolvedDate ? daysBetween(row.reportDate, new Date(`${row.resolvedDate}T00:00:00Z`).getTime()) : null,
    )
    .filter((span): span is number => span !== null && span >= 0);

  const avgResolutionDays = resolutionSpans.length > 0
    ? Math.round((resolutionSpans.reduce((sum, span) => sum + span, 0) / resolutionSpans.length) * 10) / 10
    : null;

  const flaggedListings = [...listingIndex.values()].filter(
    (listing) => listing.listing_status === 'flagged',
  ).length;

  const autoFlags = [...risks.values()]
    .filter((risk) => risk.autoFlagged)
    .sort((a, b) => (a.avgRating ?? 5) - (b.avgRating ?? 5));

  return {
    rows,
    quarantined,
    autoFlags,
    metrics: {
      openCount,
      avgResolutionDays,
      resolvedSampleSize: resolutionSpans.length,
      flaggedListings,
    },
  };
}
