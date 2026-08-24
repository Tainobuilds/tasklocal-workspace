import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarClock, Star } from 'lucide-react';

import CustomerNav from '@/components/customer/CustomerNav';
import ListingDetailActions from '@/components/customer/ListingDetailActions';
import ReviewsSection from '@/components/customer/ReviewsSection';
import SiteHeader from '@/components/SiteHeader';
import { formatUsd } from '@/lib/pricing';
import { slotKey } from '@/lib/sanitize';
import {
  getListingDetail,
  getReviewableBookingForListing,
  getSessionCustomer,
} from '@/lib/server-data';

export const dynamic = 'force-dynamic';

const SERVICE_LABELS = { cleaning: 'Cleaning', handyman: 'Handyman', moving: 'Moving' } as const;

export async function generateMetadata({ params }: PageProps<'/listings/[listingId]'>): Promise<Metadata> {
  const { listingId } = await params;
  const detail = await getListingDetail(listingId);
  return {
    title: detail ? `${detail.listing.title} · TaskLocal` : 'Listing not found · TaskLocal',
  };
}

export default async function ListingPage({ params }: PageProps<'/listings/[listingId]'>) {
  const { listingId } = await params;
  const [detail, customer] = await Promise.all([getListingDetail(listingId), getSessionCustomer()]);

  const reviewableBookingId = customer
    ? await getReviewableBookingForListing(customer.customer_id, listingId)
    : null;

  // A flagged or removed listing is not in the catalogue, so it 404s here too
  // rather than staying reachable by URL.
  if (!detail) notFound();

  const { listing, reviews } = detail;
  const provider = listing.provider;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <SiteHeader active="customer" />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <CustomerNav active="browse" />

        <Link
          href="/browse"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 mb-5 transition-colors"
        >
          <ArrowLeft size={15} />
          All services
        </Link>

        <div className="space-y-6">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div className="min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-2.5 py-0.5 rounded-full">
                  {SERVICE_LABELS[listing.service_type]}
                </span>
                <h1 className="text-2xl font-bold mt-3 leading-tight">{listing.title}</h1>
              </div>
              <div className="text-right">
                {listing.price === null ? (
                  <p className="text-slate-500 italic">Price unavailable</p>
                ) : (
                  <p className="text-2xl font-bold text-emerald-400">{formatUsd(listing.price)}</p>
                )}
                <p className="text-xs text-slate-500">flat rate</p>
              </div>
            </div>

            <p className="text-slate-300 mt-4">
              {listing.description ?? (
                <span className="italic text-slate-500">No description provided</span>
              )}
            </p>

            <div className="mt-5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
                <CalendarClock size={13} />
                <span className="uppercase tracking-wider font-semibold">Availability</span>
              </div>
              {listing.availability.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {listing.availability.map((slot) => (
                    <span
                      key={slotKey(slot)}
                      className="text-xs bg-slate-950 border border-slate-800 text-slate-300 px-2.5 py-1 rounded-md"
                    >
                      {slotKey(slot)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Contact provider for availability</p>
              )}
            </div>

            <div className="mt-6">
              <ListingDetailActions
                listing={listing}
                defaultAddress={customer?.default_address ?? null}
                signedIn={customer !== null}
              />
            </div>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="font-semibold text-lg mb-4">About the provider</h2>
            {provider ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-medium text-slate-100">
                    {provider.provider_name ? (
                      <Link
                        href={`/providers/${provider.provider_id}`}
                        className="hover:text-indigo-300 hover:underline transition-colors"
                      >
                        {provider.provider_name}
                      </Link>
                    ) : (
                      <span className="italic text-slate-500">Name unavailable</span>
                    )}
                  </p>
                  {provider.provider_avg_rating === null || provider.provider_review_count === null ? (
                    <span className="text-sm text-slate-500">No reviews yet</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      <span className="font-medium text-slate-200">
                        {provider.provider_avg_rating.toFixed(1)}
                      </span>
                      <span className="text-slate-500">
                        ({provider.provider_review_count}{' '}
                        {provider.provider_review_count === 1 ? 'review' : 'reviews'})
                      </span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400 mt-2">
                  {provider.provider_bio ?? (
                    <span className="italic text-slate-500">
                      This provider hasn&apos;t added a description yet.
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-600 font-mono mt-3">{provider.provider_id}</p>
              </>
            ) : (
              <p className="text-sm text-slate-500 italic">Provider information unavailable</p>
            )}
          </section>

          <ReviewsSection
            summary={reviews}
            listing={listing}
            signedIn={customer !== null}
            reviewableBookingId={reviewableBookingId}
          />
        </div>
      </main>
    </div>
  );
}
