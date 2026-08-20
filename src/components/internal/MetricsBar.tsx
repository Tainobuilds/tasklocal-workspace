import { Clock, Flag, Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { TriageData } from '@/lib/trust-safety';

/**
 * Three headline numbers. These are single values with no trend to plot, so a
 * stat tile is the right form — a chart here would add ink without adding
 * information. The number wears text ink; the icon carries the identity.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 text-slate-500 mb-3">
        <Icon size={15} aria-hidden />
        <span className="text-xs uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-3xl font-bold text-slate-100 tabular-nums leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-2">{caption}</p>
    </div>
  );
}

export default function MetricsBar({ metrics }: { metrics: TriageData['metrics'] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <StatTile
        icon={Inbox}
        label="Open reports"
        value={String(metrics.openCount)}
        caption="Awaiting a first decision"
      />
      <StatTile
        icon={Clock}
        label="Avg time to resolution"
        value={metrics.avgResolutionDays === null ? 'Insufficient data' : `${metrics.avgResolutionDays} days`}
        caption={
          metrics.resolvedSampleSize === 0
            ? 'No closed reports carry a resolution date'
            : `Across ${metrics.resolvedSampleSize} closed ${metrics.resolvedSampleSize === 1 ? 'report' : 'reports'}`
        }
      />
      <StatTile
        icon={Flag}
        label="Flagged listings"
        value={String(metrics.flaggedListings)}
        caption="Currently withheld from customers"
      />
    </div>
  );
}
