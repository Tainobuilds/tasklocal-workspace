import type { Metadata } from 'next';
import { UserRound } from 'lucide-react';

import LoginForm from '@/components/customer/LoginForm';
import SiteHeader from '@/components/SiteHeader';
import { getCustomers } from '@/lib/server-data';
import { getSessionCustomerId } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Sign in · Spruce',
  description: 'Sign in to book services and manage your bookings.',
};

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const requested = params.next;
  // Only relative paths are honoured, so `?next=` cannot bounce to another host.
  const next = typeof requested === 'string' && requested.startsWith('/') ? requested : '/browse';

  const [customers, currentId] = await Promise.all([getCustomers(), getSessionCustomerId()]);

  return (
    <div className="min-h-screen bg-brand-background dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <SiteHeader active="customer" />

      <main className="max-w-md mx-auto px-6 py-16">
        <div className="bg-white dark:bg-slate-900 border border-brand-line dark:border-slate-800 rounded-2xl p-6 shadow-spruce-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-brand-sage/20 dark:bg-slate-800 border border-brand-line dark:border-slate-700 flex items-center justify-center">
              <UserRound size={18} className="text-brand-primary dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight text-slate-900 dark:text-slate-100">Sign in</h1>
              <p className="text-sm text-brand-ink-muted dark:text-slate-400">Choose the account to act as.</p>
            </div>
          </div>

          <LoginForm customers={customers} currentId={currentId} next={next} />
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-600 mt-4 text-center">
          This demo has no passwords — accounts come straight from the customer records.
        </p>
      </main>
    </div>
  );
}
