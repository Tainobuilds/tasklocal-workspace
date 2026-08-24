import { MessageSquareOff, Star } from 'lucide-react';

import WriteReview from './WriteReview';
import type { ListingReviewSummary } from '@/lib/reviews';
import type { CleanListing } from '@/lib/types';

interface Props {
  summary: ListingReviewSummary;
  listing: CleanListing;
  signedIn: boolean;
  /** A completed, not-yet-reviewed booking this customer has for this listing. */
  reviewableBookingId: string | null;
}

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

export default function ReviewsSection({
  summary,
  listing,
  signedIn,
  reviewableBookingId,
}: Props) {
  const { reviews, averageRating, ratedCount, totalCount } = summary;

  return (
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

      <div className="flex justify-end mb-4">
        <WriteReview
          listing={listing}
          signedIn={signedIn}
          reviewableBookingId={reviewableBookingId}
        />
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-8">
          <MessageSquareOff size={24} className="text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No reviews for this listing yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-800">
          {reviews.map((review) => (
            <li key={review.review_id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                {review.rating === null ? (
                  // A discarded rating must not read as a zero-star review.
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
          {totalCount - ratedCount} of {totalCount} reviews had no usable rating and are excluded
          from the average.
        </p>
      )}
    </section>
  );
}
