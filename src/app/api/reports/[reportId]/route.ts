import { NextResponse } from 'next/server';

import { readJsonFile, writeJsonFile } from '@/lib/server-data';
import { REPORT_STATUSES, type ReportStatus } from '@/lib/trust-safety';

/** Statuses that close a report and therefore stamp a resolution date. */
const CLOSING: ReportStatus[] = ['resolved', 'dismissed'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Updates a report's status from the triage action bar.
 *
 * `resolved_date` is maintained here rather than by the caller so the
 * time-to-resolution metric always has a trustworthy value to read.
 */
export async function PATCH(request: Request, ctx: RouteContext<'/api/reports/[reportId]'>) {
  try {
    const { reportId } = await ctx.params;
    const body = await request.json().catch(() => null);

    const status = body && typeof body.status === 'string' ? body.status.toLowerCase() : null;
    if (!status || !(REPORT_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${REPORT_STATUSES.join(', ')}.` },
        { status: 400 },
      );
    }

    const raw = await readJsonFile('reports.json');
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'Report data is unavailable.' }, { status: 500 });
    }

    const escalate = body?.escalated === true;
    let updated = 0;

    // The data contains duplicate report_ids, so every copy is updated —
    // leaving one behind would make the queue disagree with itself.
    const next = raw.map((record) => {
      if (!record || typeof record !== 'object' || record.report_id !== reportId) return record;
      updated += 1;

      const patched: Record<string, unknown> = { ...record, report_status: status };
      if (CLOSING.includes(status as ReportStatus)) {
        patched.resolved_date = today();
      } else {
        delete patched.resolved_date;
      }
      if (escalate) patched.escalated = true;

      return patched;
    });

    if (updated === 0) {
      return NextResponse.json({ error: `No report found with id ${reportId}.` }, { status: 404 });
    }

    await writeJsonFile('reports.json', next);
    return NextResponse.json({ success: true, reportId, status, updated });
  } catch (error) {
    console.error('[tasklocal] Failed to update report:', error);
    return NextResponse.json({ error: 'Could not update the report.' }, { status: 500 });
  }
}
