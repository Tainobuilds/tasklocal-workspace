import type { Metadata } from 'next';

import CustomerApp from '@/components/customer/CustomerApp';
import CustomerNav from '@/components/customer/CustomerNav';
import WorkspaceHeader from '@/components/WorkspaceHeader';
import { getCatalogue, getCustomerBookings, getSessionCustomer } from '@/lib/server-data';

export const metadata: Metadata = {
  title: 'Find a service · TaskLocal',
  description: 'Browse and book local cleaning, handyman, and moving services.',
};

export const dynamic = 'force-dynamic';

/**
 * Validation runs on the server so rejected records are logged where they can
 * be reviewed, and the browser only ever receives render-safe listings.
 */
export default async function BrowsePage() {
  const [{ listings }, customer] = await Promise.all([getCatalogue(), getSessionCustomer()]);
  const { bookings } = customer ? await getCustomerBookings(customer.customer_id) : { bookings: [] };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <WorkspaceHeader active="customer" bookingsBadgeCount={bookings.length} bookingsHref="/bookings" />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <CustomerNav active="browse" />
        <CustomerApp
          listings={listings}
          defaultAddress={customer?.default_address ?? null}
          signedIn={customer !== null}
        />
      </main>
    </div>
  );
}
