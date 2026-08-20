'use client';

import { useState } from 'react';
import { ChevronDown, ShieldAlert } from 'lucide-react';

import type { DataIssue } from '@/lib/types';

/**
 * Surfaces records the validation layer rejected or repaired, so bad data is
 * visible for review instead of silently vanishing from the catalogue.
 */
export default function DataQualityPanel({ issues }: { issues: DataIssue[] }) {
  const [open, setOpen] = useState(false);

  if (issues.length === 0) return null;

  const dropped = issues.filter((issue) => issue.severity === 'dropped');
  const repaired = issues.filter((issue) => issue.severity === 'repaired');

  return (
    <section className="mb-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-slate-900/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm">
          <ShieldAlert size={16} className="text-amber-400" />
          <span className="text-slate-200 font-medium">Data quality</span>
          <span className="text-slate-500">
            {dropped.length} hidden · {repaired.length} repaired
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-800 max-h-72 overflow-y-auto">
          <ul className="divide-y divide-slate-800/70">
            {issues.map((issue, index) => (
              <li key={`${issue.scope}-${issue.id}-${index}`} className="flex gap-3 p-3 text-xs">
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full h-fit font-medium ${
                    issue.severity === 'dropped'
                      ? 'bg-rose-950 text-rose-400 border border-rose-900/60'
                      : 'bg-amber-950 text-amber-400 border border-amber-900/60'
                  }`}
                >
                  {issue.severity}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-slate-400">
                    {issue.scope} {issue.id}
                  </p>
                  <p className="text-slate-300 mt-0.5">{issue.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
