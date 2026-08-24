'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogIn } from 'lucide-react';

import type { CustomerSummary } from '@/lib/server-data';

interface Props {
  customers: CustomerSummary[];
  currentId: string | null;
  /** Where to land after signing in. */
  next: string;
}

export default function LoginForm({ customers, currentId, next }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentId ?? customers[0]?.customer_id ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: selected }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Could not sign in.');
        return;
      }
      router.push(next);
      // Re-render server components so every page picks up the new session.
      router.refresh();
    } catch (caught) {
      console.error('[tasklocal] Sign-in failed:', caught);
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-slate-400">Account</span>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="mt-1.5 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
        >
          {customers.map((customer) => (
            <option key={customer.customer_id} value={customer.customer_id}>
              {customer.customer_name ?? 'Unnamed customer'} ({customer.customer_id})
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="text-sm text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-lg p-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !selected}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
        Sign in
      </button>

      {currentId && (
        <p className="text-xs text-slate-500 text-center">
          Currently signed in as <span className="font-mono">{currentId}</span>. Choosing another
          account re-scopes every new booking, review, and report to it.
        </p>
      )}
    </form>
  );
}
