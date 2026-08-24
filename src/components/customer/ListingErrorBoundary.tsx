'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  /** Shown in the fallback so a failed card is still identifiable. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a single card's render. If one listing throws despite validation,
 * only that tile is replaced with a notice — the rest of the grid survives.
 */
export default class ListingErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[tasklocal] Listing "${this.props.label}" failed to render:`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-slate-900 border border-amber-800/60 rounded-xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle size={16} />
            <span className="text-sm font-semibold">This listing couldn&apos;t be displayed</span>
          </div>
          <p className="text-xs text-slate-400">
            We&apos;ve logged the problem for review. Other listings are unaffected.
          </p>
          <p className="text-[11px] text-slate-600 font-mono break-all">{this.props.label}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
