'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Store, MessageSquare, Search, Moon, Sun, ClipboardList } from 'lucide-react';

import AccountMenu from './AccountMenu';
import SpruceLogo from './SpruceLogo';

interface Props {
  active: 'provider' | 'chatbot' | 'customer';
  /** Provided by page.tsx, which switches tabs in place; browse omits it so tabs navigate instead. */
  onSelectWorkspaceTab?: (tab: 'provider' | 'chatbot') => void;
  bookingsBadgeCount: number;
  /** Provider/Chatbot: opens the local ledger drawer. */
  onOpenBookings?: () => void;
  /** Browse: links to the customer's real bookings page instead. */
  bookingsHref?: string;
}

const TABS: Array<{ id: 'provider' | 'chatbot' | 'customer'; label: string; icon: typeof Store; href: string }> = [
  { id: 'provider', label: 'Provider App', icon: Store, href: '/provider' },
  { id: 'chatbot', label: 'Matching Chatbot', icon: MessageSquare, href: '/provider?tab=chatbot' },
  { id: 'customer', label: 'Customer App', icon: Search, href: '/browse' },
];

export default function WorkspaceHeader({ active, onSelectWorkspaceTab, bookingsBadgeCount, onOpenBookings, bookingsHref }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoids a light/dark icon flash before next-themes reports the real value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <SpruceLogo />
          <span className="font-semibold text-lg tracking-tight text-slate-900 dark:text-slate-100 hidden sm:inline">
            Spruce
          </span>
        </Link>

        <nav className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          {TABS.map(({ id, label, icon: Icon, href }) => {
            const isActive = active === id;
            const className = `flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-brand-primary text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`;

            // page.tsx passes onSelectWorkspaceTab and owns provider/chatbot as local
            // tab state; browse doesn't, so provider/chatbot become plain navigation.
            if (onSelectWorkspaceTab && id !== 'customer') {
              return (
                <button key={id} type="button" onClick={() => onSelectWorkspaceTab(id)} className={className}>
                  <Icon size={16} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            }

            return (
              <Link key={id} href={href} className={className}>
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle light/dark theme"
            className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {onOpenBookings ? (
            <button
              type="button"
              onClick={onOpenBookings}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <ClipboardList size={14} /> Activity & Bookings
              {bookingsBadgeCount > 0 && (
                <span className="text-[10px] font-semibold bg-brand-primary text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookingsBadgeCount}
                </span>
              )}
            </button>
          ) : (
            <Link
              href={bookingsHref ?? '/bookings'}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
            >
              <ClipboardList size={14} /> Activity & Bookings
              {bookingsBadgeCount > 0 && (
                <span className="text-[10px] font-semibold bg-brand-primary text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookingsBadgeCount}
                </span>
              )}
            </Link>
          )}

          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
