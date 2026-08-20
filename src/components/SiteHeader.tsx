'use client';

import Link from 'next/link';
import { MessageSquare, Search, ShieldCheck, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SiteTab = 'provider' | 'chatbot' | 'customer';

const TABS: Array<{ id: SiteTab; label: string; icon: LucideIcon; href: string }> = [
  { id: 'provider', label: 'Provider App', icon: Store, href: '/' },
  { id: 'chatbot', label: 'Matching Chatbot', icon: MessageSquare, href: '/?tab=chatbot' },
  { id: 'customer', label: 'Customer App', icon: Search, href: '/browse' },
];

interface Props {
  active: SiteTab;
  /**
   * Supplied by the home page, which switches between its two tabs in place.
   * Without it every tab navigates, which is what the customer app needs.
   */
  onSelect?: (tab: 'provider' | 'chatbot') => void;
}

export default function SiteHeader({ active, onSelect }: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">
            TL
          </div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline">
            TaskLocal Workspace
          </span>
        </Link>

        <nav className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
          {TABS.map(({ id, label, icon: Icon, href }) => {
            const isActive = active === id;
            const className = `flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`;

            // The home page owns provider/chatbot as local state; everything
            // else navigates.
            if (onSelect && id !== 'customer') {
              return (
                <button key={id} type="button" onClick={() => onSelect(id)} className={className}>
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

        {/*
          Staff entry point, kept outside the product switcher on purpose: the
          trust & safety console is an internal tool, not a fourth app in the
          customer-facing suite.
        */}
        <Link
          href="/internal/trust-safety"
          title="Internal trust & safety console"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors pl-4 border-l border-slate-800 shrink-0"
        >
          <ShieldCheck size={15} />
          <span className="hidden lg:inline">Trust &amp; Safety</span>
          <span className="hidden sm:inline lg:hidden">Staff</span>
        </Link>
      </div>
    </header>
  );
}
