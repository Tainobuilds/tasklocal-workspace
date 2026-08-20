import { Star, TrendingDown, TriangleAlert } from 'lucide-react';

import {
  AUTO_FLAG_MIN_REVIEWS,
  AUTO_FLAG_RATING_THRESHOLD,
  type ProviderRisk,
} from '@/lib/trust-safety';

/**
 * Repeat-offender signal shown next to a provider_id.
 *
 * Surfaces the two patterns a reviewer needs at a glance — a rating that has
 * fallen below the auto-flag threshold, and a history of prior reports — while
 * never implying a judgement from a rating we could not validate.
 */
export default function ProviderRiskBadge({
  risk,
  showRating = true,
}: {
  risk: ProviderRisk | null;
  showRating?: boolean;
}) {
  if (!risk) return null;

  const badges: Array<{ key: string; node: React.ReactNode }> = [];

  if (risk.autoFlagged) {
    badges.push({
      key: 'auto',
      node: (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
          style={{ color: '#d03b3b', borderColor: 'rgba(208,59,59,0.5)', background: 'rgba(208,59,59,0.1)' }}
          title={`Auto-flagged: rating below ${AUTO_FLAG_RATING_THRESHOLD} with at least ${AUTO_FLAG_MIN_REVIEWS} reviews`}
        >
          <TrendingDown size={12} aria-hidden />
          Rating dropped to {risk.avgRating?.toFixed(1)}
        </span>
      ),
    });
  } else if (showRating) {
    badges.push({
      key: 'rating',
      node: risk.insufficientData ? (
        // Never render 0 or a blank here — an unknown rating is not a bad one.
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 px-2 py-0.5 rounded-full border border-slate-700">
          <Star size={12} aria-hidden />
          Insufficient data
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
          <Star size={12} className="fill-amber-400 text-amber-400" aria-hidden />
          {risk.avgRating?.toFixed(1)} ({risk.reviewCount})
        </span>
      ),
    });
  }

  if (risk.priorReports > 1) {
    badges.push({
      key: 'prior',
      node: (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
          style={{ color: '#ec835a', borderColor: 'rgba(236,131,90,0.5)', background: 'rgba(236,131,90,0.1)' }}
        >
          <TriangleAlert size={12} aria-hidden />
          {risk.priorReports} prior reports
        </span>
      ),
    });
  }

  if (badges.length === 0) return null;

  return <span className="inline-flex flex-wrap items-center gap-1.5">{badges.map((b) => <span key={b.key}>{b.node}</span>)}</span>;
}
