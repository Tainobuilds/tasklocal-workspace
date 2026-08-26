'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, TriangleAlert, X } from 'lucide-react';

import { CUSTOMER_REPORT_CATEGORIES, REPORT_REASONS } from '@/lib/trust-safety';
import type { CleanListing } from '@/lib/types';

interface Props {
  listing: CleanListing;
  signedIn: boolean;
  onClose: () => void;
}

export default function ReportDialog({ listing, signedIn, onClose }: Props) {
  const [category, setCategory] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ reportId: string; possibleDuplicate: boolean } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!category || details.trim().length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listing.listing_id,
          report_reason: category,
          report_details: details,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Could not file the report.');
        return;
      }
      setResult({
        reportId: data.report?.report_id ?? '—',
        possibleDuplicate: Boolean(data.possibleDuplicate),
      });
    } catch (caught) {
      console.error('[tasklocal] Report submission failed:', caught);
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${listing.title}`}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-8"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-brand-line dark:border-slate-800 rounded-2xl shadow-xl my-auto">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-brand-line dark:border-slate-800">
          <div>
            <h2 className="font-display font-semibold text-brand-primary dark:text-slate-100">Report this listing</h2>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">{listing.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-brand-slate dark:text-slate-500 hover:text-brand-primary dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </header>

        {!signedIn ? (
          <div className="p-8 text-center space-y-3">
            <h3 className="font-semibold text-brand-primary dark:text-slate-100">Sign in to file a report</h3>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">
              Reports are attributed to your account so our team can follow up with you.
            </p>
            <Link
              href={`/login?next=/listings/${listing.listing_id}`}
              className="inline-block bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              Sign in
            </Link>
          </div>
        ) : result ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 size={36} className="text-brand-primary dark:text-emerald-400 mx-auto" />
            <h3 className="font-semibold text-brand-primary dark:text-slate-100">Report submitted</h3>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">
              Our trust &amp; safety team will review it. Reference{' '}
              <span className="font-mono text-brand-ink-muted dark:text-slate-300">{result.reportId}</span>.
            </p>
            {result.possibleDuplicate && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3 text-left">
                You already reported this listing recently, so we&apos;ve linked this to your earlier
                report rather than opening a separate case.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-1 bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <fieldset>
              <legend className="text-sm text-brand-ink-muted dark:text-slate-300 font-medium mb-2">
                What went wrong? Choose one.
              </legend>
              <div className="space-y-1.5">
                {CUSTOMER_REPORT_CATEGORIES.map((key) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2.5 text-sm rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                      category === key
                        ? 'border-brand-accent bg-brand-amber-tint dark:bg-indigo-950/50 text-brand-ink-muted dark:text-slate-100'
                        : 'border-brand-line dark:border-slate-800 bg-brand-soft dark:bg-slate-950 text-brand-ink-muted dark:text-slate-300 hover:border-brand-slate dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report_reason"
                      value={key}
                      checked={category === key}
                      onChange={() => setCategory(key)}
                      className="accent-brand-accent"
                    />
                    {REPORT_REASONS[key].label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm text-brand-ink-muted dark:text-slate-300 font-medium">What happened?</span>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={4}
                required
                placeholder="Include dates, times, and anything the team should know."
                className="mt-1.5 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-brand-ink-muted dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent resize-y"
              />
            </label>

            {error && (
              <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 rounded-lg p-3">
                <TriangleAlert size={15} className="shrink-0 mt-0.5" />
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-brand-ink-muted dark:text-slate-300 border border-brand-line dark:border-slate-800 hover:border-brand-slate dark:hover:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !category || details.trim().length === 0}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-700 hover:bg-rose-600 disabled:bg-brand-soft dark:disabled:bg-slate-800 disabled:text-brand-slate dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Submit report
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
