import { AlertCircle, AlertTriangle, HelpCircle, Minus, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Severity } from '@/lib/trust-safety';

/**
 * Triage severity rendered with the reserved status palette.
 *
 * Colour never carries the meaning on its own: every severity ships with an
 * icon and a written label, because two of these steps sit below 3:1 contrast
 * and because colour-blind readers must get the same ranking as everyone else.
 * Values are applied inline rather than as Tailwind classes so the dynamic
 * lookup cannot be tree-shaken out of the stylesheet.
 */
export interface SeverityStyle {
  label: string;
  icon: LucideIcon;
  /** Status-palette hex, or null for the deliberately neutral low/unknown steps. */
  accent: string | null;
  /** Faint row tint; null leaves the row on the base surface. */
  tint: string | null;
  rank: number;
}

export const SEVERITY_STYLES: Record<Severity | 'unknown', SeverityStyle> = {
  critical: {
    label: 'Critical',
    icon: ShieldAlert,
    accent: '#d03b3b',
    tint: 'rgba(208, 59, 59, 0.08)',
    rank: 0,
  },
  high: {
    label: 'High',
    icon: AlertTriangle,
    accent: '#ec835a',
    tint: 'rgba(236, 131, 90, 0.07)',
    rank: 1,
  },
  medium: {
    label: 'Medium',
    icon: AlertCircle,
    accent: '#fab219',
    tint: 'rgba(250, 178, 25, 0.06)',
    rank: 2,
  },
  low: { label: 'Low', icon: Minus, accent: null, tint: null, rank: 3 },
  unknown: { label: 'Uncategorized', icon: HelpCircle, accent: null, tint: null, rank: 4 },
};

/** Icon + written label + colour, so severity survives greyscale and CVD. */
export function SeverityChip({ severity }: { severity: Severity | 'unknown' }) {
  const style = SEVERITY_STYLES[severity];
  const Icon = style.icon;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium"
      style={{ color: style.accent ?? '#94a3b8' }}
    >
      <Icon size={13} aria-hidden />
      {style.label}
    </span>
  );
}
