'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Star, TriangleAlert, X } from 'lucide-react';

interface Props {
  bookingId: string;
  listingTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReviewDialog({ bookingId, listingTitle, onClose, onSaved }: Props) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rating < 1) {
      setError('Choose a star rating from 1 to 5.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, rating, review_text: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? 'Could not save your review.');
        return;
      }
      setSaved(true);
      onSaved();
    } catch (caught) {
      console.error('[tasklocal] Review submission failed:', caught);
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Review ${listingTitle}`}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 backdrop-blur-sm p-4 sm:p-8"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-brand-line dark:border-slate-800 rounded-2xl shadow-xl my-auto">
        <header className="flex items-start justify-between gap-4 p-5 border-b border-brand-line dark:border-slate-800">
          <div>
            <h2 className="font-display font-semibold text-brand-primary dark:text-slate-100">How did it go?</h2>
            <p className="text-sm text-brand-ink-muted dark:text-slate-400">{listingTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-brand-slate dark:text-slate-500 hover:text-brand-primary dark:hover:text-slate-200">
            <X size={18} />
          </button>
        </header>

        {saved ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 size={36} className="text-brand-primary dark:text-emerald-400 mx-auto" />
            <h3 className="font-semibold text-brand-primary dark:text-slate-100">Thanks for the review</h3>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <fieldset>
              <legend className="text-sm text-brand-ink-muted dark:text-slate-300 font-medium mb-2">Rating</legend>
              <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
                {[1, 2, 3, 4, 5].map((step) => (
                  <button
                    key={step}
                    type="button"
                    aria-label={`${step} ${step === 1 ? 'star' : 'stars'}`}
                    aria-pressed={rating === step}
                    onMouseEnter={() => setHovered(step)}
                    onClick={() => {
                      setRating(step);
                      setError(null);
                    }}
                    className="p-0.5"
                  >
                    <Star
                      size={26}
                      className={
                        step <= (hovered || rating)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-brand-line dark:text-slate-700 hover:text-brand-slate dark:hover:text-slate-500'
                      }
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 text-sm text-brand-slate dark:text-slate-400 tabular-nums">{rating} of 5</span>
                )}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm text-brand-ink-muted dark:text-slate-300 font-medium">
                Feedback <span className="text-brand-slate dark:text-slate-500 font-normal">(optional)</span>
              </span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={4}
                placeholder="What went well, or what could have been better?"
                className="mt-1.5 w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-brand-ink-muted dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent resize-y"
              />
            </label>

            {error && (
              <p className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 rounded-lg p-3">
                <TriangleAlert size={15} className="shrink-0 mt-0.5" />
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-brand-ink-muted dark:text-slate-300 border border-brand-line dark:border-slate-800 hover:border-brand-slate dark:hover:border-slate-700"
              >
                Not now
              </button>
              <button
                type="submit"
                disabled={submitting || rating < 1}
                className="flex-1 flex items-center justify-center gap-2 bg-brand-primary hover:bg-brand-primary-hover disabled:bg-brand-soft dark:disabled:bg-slate-800 disabled:text-brand-slate dark:disabled:text-slate-500 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Submit review
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
