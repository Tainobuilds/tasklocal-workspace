'use client';

import { useEffect, useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';

import BookingFlow from './BookingFlow';
import FilterBar from './FilterBar';
import ListingCard from './ListingCard';
import ListingErrorBoundary from './ListingErrorBoundary';
import { normalizePriceRange, slotKey } from '@/lib/sanitize';
import type { CleanListing, Filters } from '@/lib/types';

const NO_FILTERS: Filters = { serviceTypes: [], minPrice: null, maxPrice: null, slots: [] };

interface Props {
  listings: CleanListing[];
  /** Saved address for the signed-in customer, pre-filled at confirmation. */
  defaultAddress: string | null;
  signedIn: boolean;
}

export default function CustomerApp({ listings: initialListings, defaultAddress, signedIn }: Props) {
  const [listings, setListings] = useState<CleanListing[]>(initialListings);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [booking, setBooking] = useState<CleanListing | null>(null);

  // Keeps the customer catalogue live: a listing created in the Provider App
  // shows up here without a manual reload, on the same cadence the Provider
  // Dashboard already polls at.
  useEffect(() => {
    const fetchCatalogue = async () => {
      try {
        const res = await fetch('/api/catalogue');
        const data = await res.json();
        if (Array.isArray(data)) setListings(data);
      } catch (err) {
        console.error('[tasklocal] Could not refresh the catalogue:', err);
      }
    };

    const interval = setInterval(fetchCatalogue, 10000);
    return () => clearInterval(interval);
  }, []);

  /** Slider bounds come from listings that actually have a usable price. */
  const bounds = useMemo(() => {
    const prices = listings
      .map((listing) => listing.price)
      .filter((price): price is number => price !== null);
    if (prices.length === 0) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [listings]);

  const { visible, swapped, hiddenByUnknownPrice, activeCount, failed } = useMemo(() => {
    try {
      // A min above a max is corrected rather than returning an empty grid.
      const { min, max, swapped } = normalizePriceRange(filters.minPrice, filters.maxPrice);

      // Dragging a handle to the very end is the same as not filtering at all.
      const priceActive = (min != null && min > bounds.min) || (max != null && max < bounds.max);
      const selectedSlots = new Set(filters.slots.map(slotKey));

      let hiddenByUnknownPrice = 0;

      const visible = listings.filter((listing) => {
        if (filters.serviceTypes.length > 0 && !filters.serviceTypes.includes(listing.service_type)) {
          return false;
        }

        if (priceActive) {
          // An unknown price cannot satisfy a price range, so it is excluded
          // and counted, rather than silently passing or silently vanishing.
          if (listing.price === null) {
            hiddenByUnknownPrice += 1;
            return false;
          }
          if (min != null && listing.price < min) return false;
          if (max != null && listing.price > max) return false;
        }

        if (selectedSlots.size > 0) {
          const matches = listing.availability.some((slot) => selectedSlots.has(slotKey(slot)));
          if (!matches) return false;
        }

        return true;
      });

      return {
        visible,
        swapped,
        hiddenByUnknownPrice,
        activeCount: filters.serviceTypes.length + filters.slots.length + (priceActive ? 1 : 0),
        failed: false,
      };
    } catch (error) {
      console.error('[tasklocal] Filtering failed; showing the unfiltered catalogue:', error);
      return {
        visible: listings,
        swapped: false,
        hiddenByUnknownPrice: 0,
        activeCount: 0,
        failed: true,
      };
    }
  }, [listings, filters, bounds]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Find a service</h1>
        <p className="text-slate-400 text-sm">
          Browse verified local providers and book in a few steps.
        </p>
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        bounds={bounds}
        swapped={swapped}
        activeCount={activeCount}
      />

      {failed && (
        <p className="mb-4 text-sm text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded-lg p-3">
          Filters could not be applied, so every available listing is shown.
        </p>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <p className="text-sm text-slate-400">
          {visible.length} {visible.length === 1 ? 'listing' : 'listings'}
        </p>
        {hiddenByUnknownPrice > 0 && (
          <p className="text-xs text-slate-500">
            {hiddenByUnknownPrice} hidden — price unavailable
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl">
          <SearchX size={28} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No listings match these filters</p>
          <p className="text-sm text-slate-500 mt-1">
            Try widening the price range or selecting more availability.
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="mt-4 text-sm text-indigo-400 hover:text-indigo-300"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((listing) => (
            <ListingErrorBoundary key={listing.listing_id} label={listing.listing_id}>
              <ListingCard listing={listing} onBook={setBooking} />
            </ListingErrorBoundary>
          ))}
        </div>
      )}

      {booking && (
        <BookingFlow
          listing={booking}
          defaultAddress={defaultAddress}
          signedIn={signedIn}
          onClose={() => setBooking(null)}
        />
      )}
    </div>
  );
}
