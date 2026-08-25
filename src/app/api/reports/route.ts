import { NextResponse } from 'next/server';

import { readJsonFile, readListings, writeJsonFile } from '@/lib/server-data';
import { getSessionCustomerId } from '@/lib/session';
import {
  CUSTOMER_REPORT_CATEGORIES,
  DUPLICATE_REPORT_WINDOW_HOURS,
} from '@/lib/trust-safety';

const MS_PER_HOUR = 3_600_000;

function nextReportId(existing: unknown): string {
  const count = Array.isArray(existing) ? existing.length : 0;
  return `rpt_${String(100 + count).padStart(4, '0')}`;
}

/**
 * Files a customer report, which lands directly in the trust & safety queue.
 *
 * A repeat report from the same customer about the same listing inside the
 * duplicate window is still recorded, but stamped `possible_duplicate` and
 * linked, so the team can merge it instead of triaging the same incident twice.
 */
export async function POST(request: Request) {
  try {
    const customerId = await getSessionCustomerId();
    if (!customerId) {
      return NextResponse.json({ error: 'You must be signed in to file a report.' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const listingId = body && typeof body.listing_id === 'string' ? body.listing_id.trim() : '';
    const reason = body && typeof body.report_reason === 'string' ? body.report_reason.trim() : '';
    const details = body && typeof body.report_details === 'string' ? body.report_details.trim() : '';

    if (!listingId) {
      return NextResponse.json({ error: 'listing_id is required.' }, { status: 400 });
    }
    if (!(CUSTOMER_REPORT_CATEGORIES as readonly string[]).includes(reason)) {
      return NextResponse.json({ error: 'Choose one of the listed report categories.' }, { status: 400 });
    }
    if (!details) {
      return NextResponse.json({ error: 'Please describe what happened.' }, { status: 400 });
    }

    const rawReports = await readJsonFile('reports.json');
    const reports = Array.isArray(rawReports) ? rawReports : [];

    // Look for a recent open report from this customer about this listing.
    const cutoffMs = Date.now() - DUPLICATE_REPORT_WINDOW_HOURS * MS_PER_HOUR;
    const recent = reports.find((record) => {
      if (!record || typeof record !== 'object') return false;
      if (record.reporter_id !== customerId || record.listing_id !== listingId) return false;
      const filedMs = new Date(`${record.report_date}T00:00:00Z`).getTime();
      // An unreadable date is treated as recent, so a duplicate is flagged
      // rather than waved through on a technicality.
      return !Number.isFinite(filedMs) || filedMs >= cutoffMs;
    });

    const rawListings = (await readListings()) as unknown;
    const listing = Array.isArray(rawListings)
      ? rawListings.find((record) => record && typeof record === 'object' && record.listing_id === listingId)
      : null;

    const report: Record<string, unknown> = {
      report_id: nextReportId(reports),
      booking_id: typeof body.booking_id === 'string' ? body.booking_id : null,
      listing_id: listingId,
      provider_id: typeof listing?.provider_id === 'string' ? listing.provider_id : null,
      reporter_id: customerId,
      report_reason: reason,
      report_details: details,
      report_date: new Date().toISOString().slice(0, 10),
      report_status: 'open',
    };

    if (recent) {
      report.possible_duplicate = true;
      report.linked_report_id = typeof recent.report_id === 'string' ? recent.report_id : null;
    }

    reports.push(report);
    await writeJsonFile('reports.json', reports);

    return NextResponse.json({
      success: true,
      report,
      possibleDuplicate: Boolean(recent),
    });
  } catch (error) {
    console.error('[tasklocal] Failed to file report:', error);
    return NextResponse.json({ error: 'Could not file the report.' }, { status: 500 });
  }
}
