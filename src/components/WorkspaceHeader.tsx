'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Store, Search, Moon, Sun, ClipboardList, Sparkles } from 'lucide-react';

import AccountMenu from './AccountMenu';
import SpruceLogo from './SpruceLogo';

interface Props {
  active: 'provider' | 'customer';
  bookingsBadgeCount: number;
  /** Provider: opens the local ledger drawer. */
  onOpenBookings?: () => void;
  /** Browse: links to the customer's real bookings page instead. */
  bookingsHref?: string;
  /** No longer read: the AI Matcher control navigates to /chat on every page
   * rather than opening the local drawer. Kept declared so the provider page
   * still passes it without a change, and so restoring the drawer entry is a
   * revert of this file alone. */
  onOpenAiMatcher?: () => void;
}

/** Which persona you're viewing the demo as — a real route change either
 * way, so these are plain links now (no local tab-state to switch). */
const PERSONA_SWITCHER: Array<{ id: 'provider' | 'customer'; label: string; icon: typeof Store; href: string }> = [
  { id: 'provider', label: 'Provider', icon: Store, href: '/provider' },
  { id: 'customer', label: 'Customer', icon: Search, href: '/browse' },
];

const AI_MATCHER_CLASSES =
  'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold text-brand-primary dark:text-slate-100 bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 shadow-spruce-sm transition-all hover:text-white hover:border-transparent hover:bg-gradient-to-r hover:from-brand-primary hover:to-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent';

export default function WorkspaceHeader({ active, bookingsBadgeCount, onOpenBookings, bookingsHref }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoids a light/dark icon flash before next-themes reports the real value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <>
      {/* Utility bar: which persona this demo session is viewing as — kept
          visually separate from the primary controls below so it doesn't
          read as "part of" the app's main navigation. */}
      <div className="border-b border-brand-line dark:border-slate-800 bg-brand-soft/60 dark:bg-slate-900/40">
        <div className="max-w-6xl mx-auto px-6 h-9 flex items-center justify-center gap-2">
          <span className="text-[10.5px] font-semibold text-brand-slate dark:text-slate-500 uppercase tracking-wider">Viewing as</span>
          <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-brand-line dark:border-slate-700 p-0.5 rounded-full">
            {PERSONA_SWITCHER.map(({ id, label, icon: Icon, href }) => {
              const isActive = active === id;
              return (
                <Link
                  key={id}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-all ${
                    isActive
                      ? 'bg-brand-primary text-white'
                      : 'text-brand-slate dark:text-slate-400 hover:text-brand-primary dark:hover:text-slate-100'
                  }`}
                >
                  <Icon size={11} /> {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <header className="border-b border-brand-line dark:border-slate-800 backdrop-blur-md bg-brand-background/90 dark:bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-[68px] flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <SpruceLogo className="h-[26px] w-[26px] shrink-0" />
            <span className="font-display font-extrabold text-xl tracking-tight text-brand-primary dark:text-slate-100 hidden sm:inline">
              Spruce
            </span>
          </Link>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
            <Link href="/chat" className={AI_MATCHER_CLASSES}>
              <Sparkles size={14} />
              <span className="hidden sm:inline">AI Matcher</span>
            </Link>

            <div className="w-px h-6 bg-brand-line dark:bg-slate-700 hidden sm:block" />

            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle light/dark theme"
              className="flex items-center justify-center h-9 w-9 rounded-full text-brand-slate dark:text-slate-400 hover:text-brand-primary dark:hover:text-slate-100 bg-brand-surface dark:bg-slate-800 hover:border-slate-400 border border-brand-line dark:border-slate-700 shadow-spruce-sm transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              {mounted && resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {onOpenBookings ? (
              <button
                type="button"
                onClick={onOpenBookings}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#3F3A35] dark:text-slate-300 hover:text-brand-primary dark:hover:text-slate-100 bg-brand-surface dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 border border-brand-line dark:border-slate-700 shadow-spruce-sm px-3.5 py-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                <ClipboardList size={14} /> Activity & Bookings
                {bookingsBadgeCount > 0 && (
                  <span className="text-[10px] font-bold bg-brand-primary text-white px-1.5 py-0.5 rounded-full leading-none">
                    {bookingsBadgeCount}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={bookingsHref ?? '/bookings'}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#3F3A35] dark:text-slate-300 hover:text-brand-primary dark:hover:text-slate-100 bg-brand-surface dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 border border-brand-line dark:border-slate-700 shadow-spruce-sm px-3.5 py-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                <ClipboardList size={14} /> Activity & Bookings
                {bookingsBadgeCount > 0 && (
                  <span className="text-[10px] font-bold bg-brand-primary text-white px-1.5 py-0.5 rounded-full leading-none">
                    {bookingsBadgeCount}
                  </span>
                )}
              </Link>
            )}

            <AccountMenu />
          </div>
        </div>
      </header>
    </>
  );
}
