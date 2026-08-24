'use client';

import { ArrowUpRight, Ban, Check, Flag, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';

import ProviderRiskBadge from './ProviderRiskBadge';
import { SeverityChip } from './severity';
import { formatUsd } from '@/lib/pricing';
import type { ProviderRisk, ReportRow, ReportStatus } from '@/lib/trust-safety';

export type ListingStatus = 'active' | 'flagged' | 'removed';

interface Props {
  row: ReportRow | null;
  /** Set instead of `row` when an auto-flagged provider is opened directly. */
  provider: ProviderRisk | null;
  busy: string | null;
  error: string | null;
  onClose: () => void;
  onReportStatus: (status: ReportStatus, escalate?: boolean) => void;
  onListingStatus: (status: ListingStatus) => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-800 pt-4">
      <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-right text-slate-200 min-w-0 break-words">{value}</span>
    </div>
  );
}

const MISSING = <span className="italic text-amber-400">Missing</span>;

const LISTING_STATUS_OPTIONS: ListingStatus[] = ['active', 'flagged', 'removed'];

export default function ReportDetailPanel({
  row,
  provider,
  busy,
  error,
  onClose,
  onReportStatus,
  onListingStatus,
}: Props) {
  const risk = row?.provider ?? provider;
  if (!row && !risk) return null;

  const listing = row?.listing ?? null;

  return (
    <aside
      aria-label={row ? `Report ${row.report_id}` : `Provider ${risk?.provider_id}`}
      className="fixed inset-y-0 right-0 z-[90] w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto"
    >
      <header className="sticky top-0 bg-slate-900 border-b border-slate-800 p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {row ? (
            <>
              <SeverityChip severity={row.severity} />
              <h2 className="font-semibold text-slate-100 mt-1">{row.reasonLabel}</h2>
              <p className="text-xs text-slate-500 font-mono">{row.report_id}</p>
            </>
          ) : (
            <>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#d03b3b' }}>
                Auto-flagged provider
              </p>
              <h2 className="font-semibold text-slate-100 mt-1">
                {risk?.provider_name ?? 'Unnamed provider'}
              </h2>
              <p className="text-xs text-slate-500 font-mono">{risk?.provider_id}</p>
            </>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="Close panel" className="text-slate-500 hover:text-slate-200">
          <X size={18} />
        </button>
      </header>

      <div className="p-5 space-y-5">
        {error && (
          <p className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-lg p-3">{error}</p>
        )}

        {row && (
          <>
            {/* Anything that should stop a reviewer from treating this as complete. */}
            {(row.missingFields.length > 0 || row.dataFlags.length > 0 || row.mergedIds.length > 0 || row.dateIssue) && (
              <div className="space-y-2">
                {row.missingFields.length > 0 && (
                  <p className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg p-2.5">
                    <TriangleAlert size={13} className="shrink-0 mt-px" aria-hidden />
                    Incomplete report — missing {row.missingFields.join(', ')}. Do not treat as fully
                    investigated.
                  </p>
                )}
                {row.dateIssue && (
                  <p className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg p-2.5">
                    <TriangleAlert size={13} className="shrink-0 mt-px" aria-hidden />
                    Date needs review — report_date is {row.dateIssue}.
                  </p>
                )}
                {row.dataFlags.map((flag) => (
                  <p
                    key={flag}
                    className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-lg p-2.5"
                  >
                    <TriangleAlert size={13} className="shrink-0 mt-px" aria-hidden />
                    {flag}
                  </p>
                ))}
                {row.mergedIds.length > 0 && (
                  <p className="text-xs text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                    Linked duplicate submissions: {row.mergedIds.join(', ')}. Same reporter, listing,
                    date, and description.
                  </p>
                )}
              </div>
            )}

            <Section title="Report">
              <Field label="Reporter" value={row.reporterId ?? MISSING} />
              <Field label="Filed" value={row.reportDate ?? MISSING} />
              <Field label="Booking" value={row.bookingId ?? '—'} />
              <Field
                label="Age"
                value={row.daysOpen === null ? <span className="text-amber-400">Unavailable</span> : `${row.daysOpen} days`}
              />
              <div className="mt-2">
                <p className="text-slate-500 text-sm mb-1">Details</p>
                {row.details ? (
                  <p className="text-sm text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-3 whitespace-pre-line">
                    {row.details}
                  </p>
                ) : (
                  <p className="text-sm italic text-amber-400">No description was submitted.</p>
                )}
              </div>
            </Section>
          </>
        )}

        {listing && (
          <Section title="Listing">
            <Field label="Title" value={listing.title ?? MISSING} />
            <Field label="Service type" value={listing.service_type ?? MISSING} />
            <Field
              label="Price"
              value={listing.price === null ? <span className="italic text-slate-500">Unavailable</span> : formatUsd(listing.price)}
            />
            <Field label="Status" value={listing.listing_status ?? MISSING} />
            <div className="mt-1.5">
              <p className="text-slate-500 text-sm mb-1">Description</p>
              <p className="text-sm text-slate-300">
                {listing.description ?? <span className="italic text-slate-500">No description provided</span>}
              </p>
            </div>

            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
                Change listing status
              </p>
              <div className="flex gap-1.5">
                {LISTING_STATUS_OPTIONS.map((option) => {
                  const current = listing.listing_status === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={current || busy !== null}
                      onClick={() => onListingStatus(option)}
                      className={`flex-1 text-xs py-1.5 rounded-lg border capitalize transition-colors disabled:cursor-not-allowed ${
                        current
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600 disabled:opacity-50'
                      }`}
                    >
                      {busy === `listing:${option}` ? '…' : option}
                    </button>
                  );
                })}
              </div>
            </div>
          </Section>
        )}

        {risk && (
          <Section title="Provider context">
            <Field label="Provider ID" value={<span className="font-mono">{risk.provider_id}</span>} />
            <Field label="Name" value={risk.provider_name ?? <span className="italic text-slate-500">Unavailable</span>} />
            <Field
              label="Average rating"
              value={
                risk.insufficientData ? (
                  <span className="italic text-slate-500">Insufficient data</span>
                ) : (
                  `${risk.avgRating?.toFixed(1)} from ${risk.reviewCount} reviews`
                )
              }
            />
            <div className="mt-2">
              <ProviderRiskBadge risk={risk} showRating={false} />
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-1.5">
                Other listings ({risk.listings.length})
              </p>
              {risk.listings.length === 0 ? (
                <p className="text-xs italic text-slate-600">No listings on file.</p>
              ) : (
                <ul className="space-y-1">
                  {risk.listings.map((item) => (
                    <li key={item.listing_id} className="text-xs text-slate-300 flex justify-between gap-2">
                      <span className="truncate">{item.title ?? item.listing_id}</span>
                      <span className="text-slate-600 shrink-0">{item.listing_status ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-1.5">Past reports ({risk.reports.length})</p>
              {risk.reports.length === 0 ? (
                <p className="text-xs italic text-slate-600">No prior reports.</p>
              ) : (
                <ul className="space-y-1">
                  {risk.reports.map((item) => (
                    <li key={item.report_id} className="text-xs flex justify-between gap-2">
                      <span className="text-slate-300 truncate">
                        {item.reasonLabel}
                        <span className="text-slate-600 font-mono ml-1.5">{item.report_id}</span>
                      </span>
                      <span className="text-slate-600 shrink-0">{item.date ?? 'no date'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}
      </div>

      {/* Action bar: every routine decision is one click, no intermediate form. */}
      {row && (
        <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 p-4 grid grid-cols-2 gap-2">
          <ActionButton
            label="Flag listing"
            icon={Flag}
            busy={busy === 'listing:flagged'}
            disabled={busy !== null || !listing || listing.listing_status === 'flagged'}
            onClick={() => onListingStatus('flagged')}
          />
          <ActionButton
            label="Remove listing"
            icon={Ban}
            busy={busy === 'listing:removed'}
            disabled={busy !== null || !listing || listing.listing_status === 'removed'}
            onClick={() => onListingStatus('removed')}
          />
          <ActionButton
            label="Mark resolved"
            icon={Check}
            busy={busy === 'report:resolved'}
            disabled={busy !== null || row.status === 'resolved'}
            onClick={() => onReportStatus('resolved')}
            tone="positive"
          />
          <ActionButton
            label="Dismiss"
            icon={RotateCcw}
            busy={busy === 'report:dismissed'}
            disabled={busy !== null || row.status === 'dismissed'}
            onClick={() => onReportStatus('dismissed')}
          />
          <ActionButton
            label="Escalate"
            icon={ArrowUpRight}
            busy={busy === 'report:escalate'}
            disabled={busy !== null}
            onClick={() => onReportStatus('under_review', true)}
            className="col-span-2"
          />
        </div>
      )}
    </aside>
  );
}

function ActionButton({
  label,
  icon: Icon,
  busy,
  disabled,
  onClick,
  tone = 'neutral',
  className = '',
}: {
  label: string;
  icon: typeof Flag;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  tone?: 'neutral' | 'positive';
  className?: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white'
      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneClass} ${className}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} aria-hidden />}
      {label}
    </button>
  );
}
