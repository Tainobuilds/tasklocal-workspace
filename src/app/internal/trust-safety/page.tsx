import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

import TriageDashboard from '@/components/internal/TriageDashboard';
import { getTriageData } from '@/lib/server-data';

export const metadata: Metadata = {
  title: 'Trust & Safety · Spruce Internal',
  description: 'Internal queue for triaging reports filed against listings and bookings.',
};

/** Moderation actions write to disk, so this page must never be cached. */
export const dynamic = 'force-dynamic';

export default async function TrustSafetyPage() {
  const data = await getTriageData();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/*
        Deliberately not the customer-facing SiteHeader. A distinct internal
        chrome makes it obvious to staff that they are in a moderation tool
        with real enforcement powers, not in the marketplace product.
      */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-700 flex items-center justify-center">
              <ShieldCheck size={17} className="text-slate-200" aria-hidden />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold leading-none">
                Spruce Internal
              </p>
              <h1 className="font-semibold tracking-tight leading-tight">Trust &amp; Safety</h1>
            </div>
          </div>

          <Link
            href="/provider"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={15} aria-hidden />
            <span className="hidden sm:inline">Back to workspace</span>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Report queue</h2>
          <p className="text-slate-400 text-sm">
            Reports filed against listings and bookings, newest first.
          </p>
        </div>

        <TriageDashboard data={data} />
      </main>
    </div>
  );
}
