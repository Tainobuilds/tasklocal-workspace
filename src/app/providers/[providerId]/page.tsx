import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessageSquareOff, Star } from 'lucide-react';

import CustomerNav from '@/components/customer/CustomerNav';
import SiteHeader from '@/components/SiteHeader';
import { formatUsd } from '@/lib/pricing';
import { slotKey } from '@/lib/sanitize';
import { getProviderDetail } from '@/lib/server-data';

export const dynamic = 'force-dynamic';

/** Five stars with `value` filled; decorative, the number beside it carries the value. */
function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star
          key={step}
          size={14}
          className={step <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
        />
      ))}
    </span>
  );
}

export async function generateMetadata({
  params,
}: PageProps<'/providers/[providerId]'>): Promise<Metadata> {
  const { providerId } = await params;
  const detail = await getProviderDetail(providerId);
  return {
    title: detail?.provider?.provider_name
      ? `${detail.provider.provider_name} · TaskLocal`
      : 'Provider not found · TaskLocal',
  };
}
export default async function ProviderPage({ params }: PageProps<'/providers/[providerId]'>) {
  const { providerId } = await params;
  const detail = await getProviderDetail(providerId);
  if (!detail) notFound();

  const { provider, listings, reviews } = detail;
  const { averageRating, ratedCount, totalCount } = reviews;

  return (
    <div className="dark min-h-screen bg-slate-950 text-slate-100 font-sans">
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
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-2xl font-bold leading-tight">
                {provider.provider_name ?? (
                  <span className="italic text-slate-500">Name unavailable</span>
                )}
              </h1>
              {averageRating === null ? (
                <span className="text-sm text-slate-500">No reviews yet</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-100 tabular-nums leading-none">
                    {averageRating.toFixed(1)}
                  </span>
                  <Stars value={Math.round(averageRating)} />
                  <span className="text-sm text-slate-500">
                    {ratedCount} {ratedCount === 1 ? 'rating' : 'ratings'}
                  </span>
                </span>
              )}
            </div>

            <p className="text-sm text-slate-400 mt-3">
              {provider.provider_bio ?? (
                <span className="italic text-slate-500">
                  This provider hasn&apos;t added a description yet.
                </span>
              )}
            </p>
            <p className="text-xs text-slate-600 font-mono mt-4">{provider.provider_id}</p>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="font-semibold text-lg mb-4">Services by this provider</h2>
            {listings.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                No services currently offered on TaskLocal.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {listings.map((listing) => (
                  <Link
                    key={listing.listing_id}
                    href={`/listings/${listing.listing_id}`}
                    className="group bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-2 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <h3 className="font-semibold text-slate-100 leading-snug group-hover:text-white">
                        {listing.title}
                      </h3>
                      {listing.price === null ? (
                        <span className="text-xs text-slate-500 italic whitespace-nowrap">
                          Price unavailable
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-400 whitespace-nowrap">
                          {formatUsd(listing.price)}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm line-clamp-2">
                      {listing.description ?? (
                        <span className="italic text-slate-500">No description provided</span>
                      )}
                    </p>
                    {listing.availability.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                        {listing.availability.map((slot) => (
                          <span
                            key={slotKey(slot)}
                            className="text-xs bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-md"
                          >
                            {slotKey(slot)}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
              <h2 className="font-semibold text-lg">Reviews</h2>
              {averageRating === null ? (
                <span className="text-sm text-slate-500">No ratings yet</span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-100 tabular-nums leading-none">
                    {averageRating.toFixed(1)}
                  </span>
                  <Stars value={Math.round(averageRating)} />
                  <span className="text-sm text-slate-500">
                    {ratedCount} {ratedCount === 1 ? 'rating' : 'ratings'}
                  </span>
                </span>
              )}
            </div>

            {totalCount === 0 ? (
              <div className="text-center py-8">
                <MessageSquareOff size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No reviews for this provider yet.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {reviews.reviews.map((review) => (
                  <li key={review.review_id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      {review.rating === null ? (
                        <span className="text-xs text-slate-500 italic">No rating given</span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Stars value={review.rating} />
                          <span className="text-sm text-slate-300 tabular-nums">{review.rating}</span>
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {review.review_date ?? <span className="italic">Date unavailable</span>}
                      </span>
                    </div>
                    {review.review_text ? (
                      <p className="text-sm text-slate-300 mt-1.5">{review.review_text}</p>
                    ) : (
                      <p className="text-sm text-slate-600 italic mt-1.5">No written feedback.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {totalCount > ratedCount && (
              <p className="text-xs text-slate-600 mt-4">
                {totalCount - ratedCount} of {totalCount} reviews had no usable rating and are
                excluded from the average.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
