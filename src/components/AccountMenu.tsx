'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn, LogOut, UserRound } from 'lucide-react';

import type { CustomerSummary } from '@/lib/server-data';

/**
 * Signed-in indicator for the shared header.
 *
 * Reads the session over the API rather than taking it as a prop, because the
 * header renders inside both server and client pages.
 */
export default function AccountMenu() {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCustomer(data.customer ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    await fetch('/api/session', { method: 'DELETE' });
    setCustomer(null);
    router.push('/login');
    router.refresh();
  };

  if (!loaded) return <span className="w-24" aria-hidden />;

  if (!customer) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors shrink-0"
      >
        <LogIn size={15} />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="hidden md:flex items-center gap-1.5 text-sm text-slate-300 max-w-[12rem] truncate">
        <UserRound size={15} className="text-slate-500 shrink-0" />
        {customer.customer_name ?? customer.customer_id}
      </span>
      <button
        type="button"
        onClick={signOut}
        title={`Sign out of ${customer.customer_id}`}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
      >
        <LogOut size={15} />
        <span className="sr-only">Sign out</span>
      </button>
    </div>
  );
}
