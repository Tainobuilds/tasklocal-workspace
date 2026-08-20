import fs from 'fs/promises';
import path from 'path';

import { dedupeById, sanitizeBookings, sanitizeListings } from './sanitize';
import { buildTriageData, type TriageData } from './trust-safety';
import type { BookingsResult, ListingsResult } from './types';

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
 * Loads the customer-facing listing catalogue: active listings only, validated,
 * de-duplicated, and joined to their providers.
 *
 * Rejected records are logged server-side so they can be reviewed, and also
 * returned as `issues` for display in the data-quality panel.
 */
export async function getCatalogue(): Promise<ListingsResult> {
  try {
    const [rawListings, rawProviders] = await Promise.all([
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
    ]);

    const result = sanitizeListings(rawListings, rawProviders);

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
    const [rawBookings, rawListings, rawProviders] = await Promise.all([
      readJsonFile('bookings.json'),
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
    ]);

    const { bookings, issues } = sanitizeBookings(rawBookings, rawListings, rawProviders);

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
    const [rawReports, rawListings, rawProviders, rawBookings] = await Promise.all([
      readJsonFile('reports.json'),
      readJsonFile('listings.json'),
      readJsonFile('providers.json'),
      readJsonFile('bookings.json'),
    ]);

    const data = buildTriageData(rawReports, rawListings, rawProviders, rawBookings);

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
}

/**
 * The customer list behind the demo "view as" switcher. Stands in for auth,
 * and doubles as a way to inspect the messier booking histories in the data.
 */
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
      }))
      .sort((a, b) => a.customer_id.localeCompare(b.customer_id));
  } catch (error) {
    console.error('[tasklocal] Failed to load customers:', error);
    return [];
  }
}
