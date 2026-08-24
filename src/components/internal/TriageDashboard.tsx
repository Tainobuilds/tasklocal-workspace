'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileX2, TrendingDown } from 'lucide-react';

import MetricsBar from './MetricsBar';
import ReportDetailPanel, { type ListingStatus } from './ReportDetailPanel';
import ReportTable from './ReportTable';
import { REPORT_REASONS, REPORT_STATUSES, type ReportStatus, type TriageData } from '@/lib/trust-safety';

/** "needs_categorization" is a bucket, not a stored status — see the filter note. */
type StatusFilter = 'all' | ReportStatus | 'needs_categorization';

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  ...REPORT_STATUSES.map((status) => ({
    id: status as StatusFilter,
    label: status === 'under_review' ? 'Under review' : status[0].toUpperCase() + status.slice(1),
  })),
  { id: 'needs_categorization', label: 'Needs categorization' },
];

type Selection = { kind: 'report'; id: string } | { kind: 'provider'; id: string } | null;

export default function TriageDashboard({ data }: { data: TriageData }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [selection, setSelection] = useState<Selection>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map = new Map<StatusFilter, number>([['all', data.rows.length]]);
    for (const status of REPORT_STATUSES) {
      map.set(status, data.rows.filter((row) => row.status === status).length);
    }
    map.set('needs_categorization', data.rows.filter((row) => row.needsCategorization).length);
    return map;
  }, [data.rows]);

  const rows = useMemo(() => {
    return data.rows.filter((row) => {
      if (statusFilter === 'needs_categorization') {
        if (!row.needsCategorization) return false;
      } else if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }
      if (reasonFilter !== 'all' && row.reasonKey !== reasonFilter) return false;
      return true;
    });
  }, [data.rows, statusFilter, reasonFilter]);

  // Selection is held by id and re-resolved each render, so the panel stays
  // correct after a mutation refreshes the server data underneath it.
  const selectedRow =
    selection?.kind === 'report' ? data.rows.find((row) => row.report_id === selection.id) ?? null : null;
  const selectedProvider =
    selection?.kind === 'provider'
      ? data.autoFlags.find((risk) => risk.provider_id === selection.id) ?? null
      : null;

  async function run(key: string, url: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error ?? 'The action could not be completed.');
        return;
      }
      router.refresh();
    } catch (caught) {
      console.error('[tasklocal] Triage action failed:', caught);
      setError('Could not reach the server.');
    } finally {
      setBusy(null);
    }
  }

  const onReportStatus = (status: ReportStatus, escalate = false) => {
    if (!selectedRow) return;
    run(escalate ? 'report:escalate' : `report:${status}`, `/api/reports/${selectedRow.report_id}`, {
      status,
      escalated: escalate,
    });
  };

  const onListingStatus = (status: ListingStatus) => {
    const listingId = selectedRow?.listingId;
    if (!listingId) return;
    run(`listing:${status}`, `/api/listings/${listingId}`, { listing_status: status });
  };

  return (
    <>
      <MetricsBar metrics={data.metrics} />

      {/* Providers surfaced by the rating threshold, with no report filed. */}
      {data.autoFlags.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Auto-flagged providers
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.autoFlags.map((risk) => (
              <button
                key={risk.provider_id}
                type="button"
                onClick={() => setSelection({ kind: 'provider', id: risk.provider_id })}
                className="text-left rounded-xl p-4 border transition-colors hover:border-slate-600"
                style={{ borderColor: 'rgba(208,59,59,0.45)', background: 'rgba(208,59,59,0.08)' }}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#d03b3b' }}>
                  <TrendingDown size={13} aria-hidden />
                  Rating dropped to {risk.avgRating?.toFixed(1)}
                </span>
                <p className="text-sm text-slate-100 font-medium mt-1">
                  {risk.provider_name ?? 'Unnamed provider'}
                </p>
                <p className="text-xs text-slate-500 font-mono">{risk.provider_id}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {risk.reviewCount} reviews · {risk.priorReports} filed{' '}
                  {risk.priorReports === 1 ? 'report' : 'reports'}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${active ? 'text-indigo-200' : 'text-slate-600'}`}>
                  {counts.get(tab.id) ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm ml-auto">
          <span className="text-slate-500">Reason</span>
          <select
            value={reasonFilter}
            onChange={(event) => setReasonFilter(event.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">All reasons</option>
            {Object.entries(REPORT_REASONS).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        {rows.length} of {data.rows.length} reports
      </p>

      <ReportTable
        rows={rows}
        selectedId={selectedRow?.report_id ?? null}
        onSelect={(id) => setSelection({ kind: 'report', id })}
      />

      {/* Records that could not be parsed at all stay visible rather than vanishing. */}
      {data.quarantined.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-400 font-semibold mb-2">
            <FileX2 size={14} aria-hidden />
            Quarantined — needs review ({data.quarantined.length})
          </h2>
          <ul className="border border-amber-900/50 bg-amber-950/20 rounded-xl divide-y divide-amber-900/30">
            {data.quarantined.map((item, index) => (
              <li key={`${item.id}-${index}`} className="p-3 text-xs">
                <span className="font-mono text-amber-300">{item.id}</span>
                <span className="text-slate-300 ml-2">{item.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selection && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-slate-950/60"
            onClick={() => setSelection(null)}
            aria-hidden
          />
          <ReportDetailPanel
            row={selectedRow}
            provider={selectedProvider}
            busy={busy}
            error={error}
            onClose={() => setSelection(null)}
            onReportStatus={onReportStatus}
            onListingStatus={onListingStatus}
          />
        </>
      )}
    </>
  );
}
