import type { Metadata } from 'next';

import CustomerApp from '@/components/customer/CustomerApp';
import CustomerNav from '@/components/customer/CustomerNav';
import SiteHeader from '@/components/SiteHeader';
import { getCatalogue } from '@/lib/server-data';

export const metadata: Metadata = {
  title: 'Find a service · TaskLocal',
  description: 'Browse and book local cleaning, handyman, and moving services.',
};

/**
 * Validation runs on the server so rejected records are logged where they can
 * be reviewed, and the browser only ever receives render-safe listings.
 */
export default async function BrowsePage() {
  // `getCatalogue` still validates and logs every rejected record server-side.
  const { listings } = await getCatalogue();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <SiteHeader active="customer" />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <CustomerNav active="browse" />
        <CustomerApp listings={listings} />
      </main>
    </div>
  );
}
