import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarX } from 'lucide-react';

import BookingCard from '@/components/customer/BookingCard';
import CustomerNav from '@/components/customer/CustomerNav';
import SiteHeader from '@/components/SiteHeader';
import { sanitizeReviews } from '@/lib/reviews';
import { getCustomerBookings, getSessionCustomer, readJsonFile } from '@/lib/server-data';
import type { CleanBooking } from '@/lib/types';

export const metadata: Metadata = {
  title: 'My bookings · TaskLocal',
  description: 'Review the services you have booked on TaskLocal.',
};

export const dynamic = 'force-dynamic';

/**
 * Splits history into what still needs the customer's attention, what is
 * coming up, and what is done. Undated bookings surface first rather than
 * being silently sorted into the past.
 */
function groupBookings(bookings: CleanBooking[], nowIso: string) {
  const needsAttention: CleanBooking[] = [];
  const upcoming: CleanBooking[] = [];
  const past: CleanBooking[] = [];

  for (const booking of bookings) {
    if (booking.status === 'cancelled' || booking.status === 'completed') {
      past.push(booking);
    } else if (booking.scheduledAt === null) {
      needsAttention.push(booking);
    } else if (booking.scheduledAt < nowIso) {
      past.push(booking);
    } else {
      upcoming.push(booking);
    }
  }

  return { needsAttention, upcoming, past };
}

export default async function BookingsPage() {
  const customer = await getSessionCustomer();
  // Booking history is per-account, so there is nothing to show without a session.
  if (!customer) redirect('/login?next=/bookings');

  const [{ bookings }, rawReviews] = await Promise.all([
    getCustomerBookings(customer.customer_id),
    readJsonFile('reviews.json'),
  ]);

  const reviews = sanitizeReviews(rawReviews);
  const reviewedBookingIds = new Set(
    reviews
      .filter((review) => review.customer_id === customer.customer_id && review.booking_id)
      .map((review) => review.booking_id as string),
  );

  // "Is it past?" is decided here so the action buttons cannot differ between
  // the server render and hydration.
  const nowIso = new Date().toISOString();
  const { needsAttention, upcoming, past } = groupBookings(bookings, nowIso);

  const sections = [
    { key: 'attention', title: 'Needs attention', items: needsAttention },
    { key: 'upcoming', title: 'Upcoming', items: upcoming },
    { key: 'past', title: 'Past', items: past },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <SiteHeader active="customer" />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <CustomerNav active="bookings" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold">My bookings</h1>
          <p className="text-slate-400 text-sm">
            {bookings.length === 0
              ? 'Services you book will appear here.'
              : `${bookings.length} ${bookings.length === 1 ? 'booking' : 'bookings'} for ${
                  customer.customer_name ?? customer.customer_id
                }.`}
          </p>
        </div>

        {bookings.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
            <CalendarX size={28} className="text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-medium">No bookings yet</p>
            <p className="text-sm text-slate-500 mt-1">
              Once you book a service it will show up here with its date, address, and total.
            </p>
            <Link
              href="/browse"
              className="inline-block mt-4 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Browse services
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.key}>
                <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">
                  {section.title}
                  <span className="ml-2 text-slate-600">{section.items.length}</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {section.items.map((booking) => (
                    <BookingCard
                      key={booking.booking_id}
                      booking={booking}
                      isPast={booking.scheduledAt !== null && booking.scheduledAt < nowIso}
                      hasReview={reviewedBookingIds.has(booking.booking_id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
