'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2, UserRound } from 'lucide-react';

import type { CustomerSummary } from '@/lib/server-data';

interface Props {
  customers: CustomerSummary[];
  current: string;
}

/**
 * Demo affordance standing in for sign-in: switches which customer's history
 * is shown. Also the quickest way to reach the messier booking records.
 */
export default function CustomerSwitcher({ customers, current }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm">
      <UserRound size={15} className="text-slate-500" />
      <span className="text-slate-500">Viewing as</span>
      <select
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(() => router.push(`/bookings?customer=${encodeURIComponent(next)}`));
        }}
        className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
      >
        {customers.map((customer) => (
          <option key={customer.customer_id} value={customer.customer_id}>
            {customer.customer_name ?? 'Unnamed customer'} ({customer.customer_id})
          </option>
        ))}
      </select>
      {pending && <Loader2 size={14} className="animate-spin text-slate-500" />}
    </label>
  );
}
