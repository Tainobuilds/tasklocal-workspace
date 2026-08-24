'use client';

import { CalendarX2, Copy, FileWarning, TriangleAlert } from 'lucide-react';

import ProviderRiskBadge from './ProviderRiskBadge';
import { SEVERITY_STYLES, SeverityChip } from './severity';
import type { ReportRow, ReportStatus } from '@/lib/trust-safety';

const STATUS_LABELS: Record<ReportStatus, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-slate-800 text-slate-200 border-slate-600' },
  under_review: { label: 'Under review', className: 'bg-indigo-950 text-indigo-300 border-indigo-800/60' },
  resolved: { label: 'Resolved', className: 'bg-emerald-950 text-emerald-400 border-emerald-800/60' },
  dismissed: { label: 'Dismissed', className: 'bg-slate-900 text-slate-500 border-slate-700' },
};

function StatusCell({ row }: { row: ReportRow }) {
  if (row.status === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-amber-800/60 bg-amber-950 text-amber-400">
        Needs categorization
        {row.rawStatus && <span className="text-amber-600/80 font-mono">({row.rawStatus})</span>}
      </span>
    );
  }
  const style = STATUS_LABELS[row.status];
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full border ${style.className}`}>
      {style.label}
    </span>
  );
}

function DaysOpenCell({ row }: { row: ReportRow }) {
  // A bad date yields no number at all — a negative or invented age would be
  // worse than an honest gap, because the team sorts and prioritises on it.
  if (row.daysOpen === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400" title={`Date issue: ${row.dateIssue ?? 'unknown'}`}>
        <CalendarX2 size={12} aria-hidden />
        Date needs review
      </span>
    );
  }

  const closed = row.status === 'resolved' || row.status === 'dismissed';
  return (
    <span className="text-sm tabular-nums text-slate-200">
      {row.daysOpen}
      <span className="text-slate-500 text-xs ml-1">{closed ? 'days to close' : 'days open'}</span>
    </span>
  );
}

interface Props {
  rows: ReportRow[];
  selectedId: string | null;
  onSelect: (reportId: string) => void;
}

export default function ReportTable({ rows, selectedId, onSelect }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-14 border border-dashed border-slate-800 rounded-xl">
        <p className="text-slate-300 font-medium">No reports match these filters</p>
        <p className="text-sm text-slate-500 mt-1">Try a different status or reason.</p>
      </div>
    );
  }

  return (
    <div className="border border-slate-800 rounded-xl overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-slate-900/80 text-xs uppercase tracking-wider text-slate-500">
            <th scope="col" className="font-semibold px-4 py-3">Reason</th>
            <th scope="col" className="font-semibold px-4 py-3">Listing</th>
            <th scope="col" className="font-semibold px-4 py-3">Provider</th>
            <th scope="col" className="font-semibold px-4 py-3">Reported</th>
            <th scope="col" className="font-semibold px-4 py-3">Status</th>
            <th scope="col" className="font-semibold px-4 py-3">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const style = SEVERITY_STYLES[row.severity];
            const isSelected = row.report_id === selectedId;

            return (
              <tr
                key={row.report_id}
                onClick={() => onSelect(row.report_id)}
                tabIndex={0}
                role="button"
                aria-label={`Open report ${row.report_id}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row.report_id);
                  }
                }}
                className={`border-t border-slate-800 cursor-pointer transition-colors ${
                  isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-900'
                }`}
                style={{
                  // Severity reads three ways at once: a left rule, a faint
                  // tint, and the written chip in the first cell.
                  borderLeft: `3px solid ${style.accent ?? 'transparent'}`,
                  background: isSelected ? undefined : style.tint ?? undefined,
                }}
              >
                <td className="px-4 py-3 align-top">
                  <SeverityChip severity={row.severity} />
                  <p className="text-sm text-slate-200 mt-0.5">{row.reasonLabel}</p>
                  <p className="text-xs text-slate-600 font-mono">{row.report_id}</p>

                  {row.missingFields.length > 0 && (
                    <p className="inline-flex items-start gap-1 text-xs text-amber-400 mt-1">
                      <FileWarning size={12} className="shrink-0 mt-0.5" aria-hidden />
                      Incomplete report — missing {row.missingFields.join(', ')}
                    </p>
                  )}

                  {row.mergedIds.length > 0 && (
                    <p className="inline-flex items-center gap-1 text-xs text-slate-400 mt-1">
                      <Copy size={12} aria-hidden />
                      Merged with {row.mergedIds.join(', ')}
                    </p>
                  )}

                  {/* Cross-record problems belong in the row, not only the panel —
                      a reviewer triaging the queue needs to see them at a glance. */}
                  {row.dataFlags.map((flag) => (
                    <p key={flag} className="flex items-start gap-1 text-xs text-amber-400/90 mt-1">
                      <TriangleAlert size={12} className="shrink-0 mt-0.5" aria-hidden />
                      {flag}
                    </p>
                  ))}
                </td>

                <td className="px-4 py-3 align-top">
                  <p className="text-sm text-slate-200">
                    {row.listing?.title ?? (
                      <span className="italic text-slate-500">Listing unavailable</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">{row.listingId ?? '—'}</p>
                  {row.listing?.withdrawn && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      Listing is {row.listing.listing_status}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3 align-top">
                  <p className="text-sm text-slate-300 font-mono">{row.providerId ?? '—'}</p>
                  <div className="mt-1">
                    <ProviderRiskBadge risk={row.provider} />
                  </div>
                </td>

                <td className="px-4 py-3 align-top text-sm text-slate-300 whitespace-nowrap">
                  {row.reportDate ?? <span className="text-amber-400 text-xs">Missing</span>}
                  {row.dateIssue === 'future' && (
                    <p className="text-xs text-amber-400">Future-dated</p>
                  )}
                  {row.dateIssue === 'malformed' && (
                    <p className="text-xs text-amber-400 font-mono">
                      {String(row.reportDate ?? '')} unparseable
                    </p>
                  )}
                </td>

                <td className="px-4 py-3 align-top">
                  <StatusCell row={row} />
                </td>

                <td className="px-4 py-3 align-top">
                  <DaysOpenCell row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
