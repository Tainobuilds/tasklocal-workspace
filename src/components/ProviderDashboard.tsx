'use client';

import { useState } from 'react';
import { Plus, PackageSearch, X, Loader2, Layers, DollarSign, Gauge, Pencil } from 'lucide-react';
import { SERVICE_TYPES } from '@/lib/types';
import AvailabilitySelector from './AvailabilitySelector';

type ListingFormData = {
  title: string;
  service_type: string;
  price: string;
  description: string;
  availability: string[];
};

interface Props {
  listings: any[];
  bookings: any[];
  realBookings: any[];
  customers: any[];
  onCreateListing: (formData: ListingFormData) => Promise<boolean>;
  onEditListing: (listingId: string, formData: ListingFormData) => Promise<boolean>;
  onToggleListingStatus: (listingId: string, currentStatus: string) => Promise<boolean>;
}

const EMPTY_FORM: ListingFormData = { title: '', service_type: '', price: '', description: '', availability: [] };

/** Defensively builds edit-form state from a listing that may predate this
 * feature (no availability field, or a malformed one) — never throws. */
const toFormData = (item: any): ListingFormData => ({
  title: typeof item?.title === 'string' ? item.title : '',
  service_type: typeof item?.service_type === 'string' ? item.service_type : '',
  price: typeof item?.price === 'number' && Number.isFinite(item.price) ? String(item.price) : '',
  description: typeof item?.description === 'string' ? item.description : '',
  availability: Array.isArray(item?.availability) ? item.availability.filter((s: unknown) => typeof s === 'string') : [],
});

// A small pool of realistic-looking names for bookings whose customer_id
// doesn't resolve to a real record in the customer directory — keeps the
// dashboard looking populated during a demo instead of showing raw ids.
const MOCK_CUSTOMER_NAMES = ['Sarah Jenkins', 'Alex Morgan', 'Jordan Lee', 'Taylor Brooks', 'Casey Rivera', 'Morgan Ellis'];

/** Deterministic, not random — the same id always maps to the same mock
 * name, so a booking doesn't change appearance between polls. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function resolveCustomerName(customerId: string, customers: any[]): string {
  const match = customers.find((c) => c?.customer_id === customerId);
  if (typeof match?.customer_name === 'string' && match.customer_name.trim()) {
    return match.customer_name.trim();
  }
  return MOCK_CUSTOMER_NAMES[hashString(customerId) % MOCK_CUSTOMER_NAMES.length];
}

function formatBookingDateTime(value: unknown): string {
  if (typeof value !== 'string') return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const getListingStrength = (formData: typeof EMPTY_FORM) => {
  let score = 0;
  if (formData.title.trim()) score += 20;
  if (formData.service_type.trim()) score += 20;
  if (Number(formData.price) > 0) score += 20;
  if (formData.description.trim()) score += 15;
  if (formData.description.trim().length >= 40) score += 25;

  if (score >= 75) return { score, label: 'Excellent', barClass: 'bg-emerald-500', textClass: 'text-emerald-700' };
  if (score >= 40) return { score, label: 'Good', barClass: 'bg-amber-500', textClass: 'text-amber-700' };
  return { score, label: 'Weak', barClass: 'bg-red-400', textClass: 'text-red-600' };
};

export default function ProviderDashboard({
  listings,
  bookings,
  realBookings,
  customers,
  onCreateListing,
  onEditListing,
  onToggleListingStatus,
}: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<ListingFormData>(EMPTY_FORM);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);

  const [bookingFilter, setBookingFilter] = useState<'all' | 'confirmed' | 'completed' | 'cancelled'>('all');

  const closeModal = () => {
    setIsModalOpen(false);
    setSubmitError(null);
  };

  const openEditModal = (item: any) => {
    setEditingListingId(item.listing_id);
    setEditFormData(toFormData(item));
    setEditSubmitError(null);
  };

  const closeEditModal = () => {
    setEditingListingId(null);
    setEditSubmitError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListingId || !editFormData.title || isEditSubmitting) return;

    setIsEditSubmitting(true);
    setEditSubmitError(null);

    const success = await onEditListing(editingListingId, editFormData);

    if (success) {
      closeEditModal();
    } else {
      setEditSubmitError('Something went wrong saving these changes. Please try again.');
    }
    setIsEditSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const success = await onCreateListing(formData);

    if (success) {
      setFormData(EMPTY_FORM);
      setIsModalOpen(false);
    } else {
      setSubmitError('Something went wrong saving this listing. Please try again.');
    }
    setIsSubmitting(false);
  };

  const activeServicesCount = listings.filter((item) => (item.listing_status ?? 'active') === 'active').length;
  const totalRevenue = bookings.reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  const validRates = listings
    .map((item) => item.price)
    .filter((rate) => typeof rate === 'number' && Number.isFinite(rate));
  const averageHourlyRate = validRates.length ? validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length : null;

  const now = new Date();
  const payoutsThisMonth = bookings.filter((b) => {
    const bookedAt = new Date(b.bookedAt);
    return !Number.isNaN(bookedAt.getTime()) && bookedAt.getMonth() === now.getMonth() && bookedAt.getFullYear() === now.getFullYear();
  }).length;

  const strength = getListingStrength(formData);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-[11.5px] font-semibold tracking-[0.1em] uppercase text-brand-sage mb-2">Provider workspace</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-brand-primary dark:text-slate-100">Provider Dashboard</h1>
          <p className="mt-1.5 text-[14.5px] text-brand-ink-muted dark:text-slate-400">Manage active local listings and services</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary-hover text-white px-[22px] py-[11px] rounded-full text-[13.5px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent"
        >
          <Plus size={16} /> New Listing
        </button>
      </div>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 shadow-spruce-sm hover:shadow-spruce-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-3 mb-3.5">
            <div className="h-[38px] w-[38px] rounded-xl bg-brand-sage/20 flex items-center justify-center shrink-0">
              <Layers size={18} className="text-brand-primary dark:text-emerald-400" />
            </div>
            <p className="text-[12.5px] font-semibold text-brand-ink-muted dark:text-slate-400">Active Services</p>
          </div>
          <p className="font-display text-[34px] font-extrabold tracking-tight leading-none text-brand-primary dark:text-slate-100">{activeServicesCount}</p>
          <p className="mt-2.5 text-xs text-brand-slate dark:text-slate-500 leading-relaxed">
            of {listings.length} listings published · {listings.length - activeServicesCount} paused
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 shadow-spruce-sm hover:shadow-spruce-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-3 mb-3.5">
            <div className="h-[38px] w-[38px] rounded-xl bg-[#E8EFEA] dark:bg-emerald-950 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-brand-primary dark:text-emerald-400" />
            </div>
            <p className="text-[12.5px] font-semibold text-brand-ink-muted dark:text-slate-400">Total Revenue</p>
          </div>
          <p className="font-display text-[34px] font-extrabold tracking-tight leading-none text-brand-primary dark:text-slate-100">${totalRevenue.toFixed(2)}</p>
          <p className="mt-2.5 text-xs text-brand-slate dark:text-slate-500 leading-relaxed">
            {payoutsThisMonth} completed payout{payoutsThisMonth === 1 ? '' : 's'} this month
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 shadow-spruce-sm hover:shadow-spruce-md hover:-translate-y-0.5 transition-all">
          <div className="flex items-center gap-3 mb-3.5">
            <div className="h-[38px] w-[38px] rounded-xl bg-brand-amber-tint dark:bg-amber-950/40 flex items-center justify-center shrink-0">
              <Gauge size={18} className="text-brand-accent" />
            </div>
            <p className="text-[12.5px] font-semibold text-brand-ink-muted dark:text-slate-400">Average Hourly Rate</p>
          </div>
          <p className="font-display text-[34px] font-extrabold tracking-tight leading-none text-brand-primary dark:text-slate-100">
            {averageHourlyRate === null ? '—' : `$${averageHourlyRate.toFixed(2)}`}
            {averageHourlyRate !== null && <span className="text-lg font-bold text-brand-slate">/hr</span>}
          </p>
          <p className="mt-2.5 text-xs text-brand-slate dark:text-slate-500 leading-relaxed">across {validRates.length} priced listing{validRates.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-800">
          <div className="h-14 w-14 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center mb-4">
            <PackageSearch size={24} className="text-brand-primary" />
          </div>
          <h3 className="text-slate-900 dark:text-slate-100 font-semibold mb-1">No service listings found yet!</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-5">
            Publish your first service to get discovered by the AI Matcher and start receiving bookings.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-brand-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <Plus size={16} /> Publish Your First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((item, idx) => {
            const title = item.title || 'Unnamed Service';
            const category = item.service_type || 'General';
            const rate = item.price;
            const hasValidRate = typeof rate === 'number' && Number.isFinite(rate);
            const description = item.description || item.details || 'No description available.';
            const status = (item.listing_status ?? 'active') as string;
            // active/removed get the interactive segmented control below, not a
            // plain badge — flagged/pending are moderation states a provider
            // can't casually click away, so they keep the non-interactive badge.
            const moderationBadge =
              status === 'flagged' || status === 'pending'
                ? { flagged: { label: 'Flagged' }, pending: { label: 'Pending review' } }[status]
                : null;
            const isActive = status === 'active';
            const isToggleable = status === 'active' || status === 'removed';

            return (
              <div
                key={item.listing_id || item.id || idx}
                className={`flex flex-col min-h-[216px] bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-5 shadow-spruce-sm transition-all hover:shadow-spruce-md hover:-translate-y-0.5 hover:border-[#D6D3D1] dark:hover:border-stone-700 ${
                  isActive ? '' : 'opacity-[0.66]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-[17px] font-bold tracking-tight leading-tight line-clamp-2 min-h-[3.5rem] text-brand-primary dark:text-slate-100">
                    {title}
                  </h3>
                  <span className={`font-display shrink-0 font-bold text-[15px] whitespace-nowrap ${hasValidRate ? 'text-brand-primary dark:text-slate-100' : 'text-slate-400 text-xs'}`}>
                    {hasValidRate ? `$${rate}/hr` : 'Price needs review'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="inline-block text-[11px] font-semibold text-brand-ink-muted dark:text-slate-400 bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 px-2.5 py-1 rounded-full">
                    {category}
                  </span>
                  {moderationBadge && (
                    <span className="inline-block text-[11px] font-semibold border px-2.5 py-1 rounded-full bg-brand-amber-tint text-[#B45309] border-[#F3DFBE]">
                      {moderationBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-brand-ink-muted dark:text-slate-400 text-[13.5px] leading-relaxed line-clamp-2 mt-3 flex-1">{description}</p>
                <div className="mt-auto pt-4 flex items-center justify-between gap-3 border-t border-[#F0EEE9] dark:border-slate-800">
                  {isToggleable ? (
                    <div className="flex items-center gap-[3px] bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 p-[3px] rounded-full">
                      <button
                        type="button"
                        onClick={() => !isActive && onToggleListingStatus(item.listing_id, status)}
                        className={`text-[11px] font-semibold px-[11px] py-[5px] rounded-full transition-colors ${
                          isActive ? 'bg-brand-primary text-white' : 'text-brand-slate hover:text-brand-primary dark:hover:text-slate-100'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => isActive && onToggleListingStatus(item.listing_id, status)}
                        className={`text-[11px] font-semibold px-[11px] py-[5px] rounded-full transition-colors ${
                          isActive ? 'text-brand-slate hover:text-brand-primary dark:hover:text-slate-100' : 'bg-white dark:bg-slate-900 text-brand-primary dark:text-emerald-400 shadow-spruce-sm'
                        }`}
                      >
                        Paused
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand-slate dark:text-slate-400 hover:text-brand-primary dark:hover:text-emerald-400 hover:bg-brand-soft dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-full px-2 py-1"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {realBookings.length > 0 && (
        <div className="mt-12">
          <div className="flex flex-wrap items-center justify-between gap-6 mb-4">
            <h2 className="font-display text-[22px] font-extrabold tracking-tight text-brand-primary dark:text-slate-100">
              Recent Customer Bookings
            </h2>
            <div className="inline-flex items-center gap-1 bg-brand-soft dark:bg-slate-800 border border-brand-line dark:border-slate-700 p-1 rounded-full">
              {(['all', 'confirmed', 'completed', 'cancelled'] as const).map((filterKey) => {
                const count =
                  filterKey === 'all'
                    ? realBookings.length
                    : realBookings.filter((b) => (typeof b.booking_status === 'string' ? b.booking_status : 'confirmed') === filterKey).length;
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setBookingFilter(filterKey)}
                    className={`text-[12.5px] font-semibold px-3.5 py-[7px] rounded-full whitespace-nowrap capitalize transition-all ${
                      bookingFilter === filterKey
                        ? 'bg-white dark:bg-slate-900 text-brand-primary dark:text-slate-100 shadow-[0_1px_3px_rgba(11,43,34,0.12)]'
                        : 'text-brand-slate dark:text-slate-400 hover:text-brand-primary dark:hover:text-slate-100'
                    }`}
                  >
                    {filterKey} <span className="opacity-60 font-medium">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl overflow-hidden shadow-spruce-sm divide-y divide-[#F0EEE9] dark:divide-slate-800">
            {(() => {
              const filtered = realBookings.filter((booking) => {
                if (bookingFilter === 'all') return true;
                const status = typeof booking.booking_status === 'string' ? booking.booking_status : 'confirmed';
                return status === bookingFilter;
              });

              if (filtered.length === 0) {
                return (
                  <div className="py-11 px-5 text-center">
                    <p className="text-sm font-semibold text-brand-primary dark:text-slate-100">No {bookingFilter} bookings</p>
                    <p className="mt-1.5 text-[13px] text-brand-ink-muted dark:text-slate-400">Switch filters to see the rest of this week&apos;s activity.</p>
                  </div>
                );
              }

              return filtered.map((booking, idx) => {
                const listing = listings.find((item) => item.listing_id === booking.listing_id);
                const listingTitle = listing?.title || booking.listing_id || 'Unknown service';
                const status = typeof booking.booking_status === 'string' ? booking.booking_status : 'confirmed';
                const statusClassName =
                  status === 'cancelled'
                    ? 'bg-[#FBEFEC] text-[#9A3412] border-[#F3D9CE] dark:bg-red-950/40 dark:text-red-400 dark:border-red-900'
                    : status === 'completed'
                      ? 'bg-brand-soft text-brand-ink-muted border-brand-line dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      : 'bg-[#E8EFEA] text-brand-primary border-[#CFE0D5] dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900';

                const customerId = typeof booking.customer_id === 'string' ? booking.customer_id : 'unknown';
                const customerName = resolveCustomerName(customerId, customers);
                const dateTime = formatBookingDateTime(booking.scheduled_at);
                const hasValidPrice = typeof listing?.price === 'number' && Number.isFinite(listing.price);
                const amountDisplay = hasValidPrice ? `$${listing.price.toFixed(2)}` : '—';

                return (
                  <div
                    key={booking.booking_id || idx}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:grid-cols-[minmax(0,1fr)_130px_110px_120px] items-center gap-4 px-5 py-4 transition-colors hover:bg-[#FCFBF9] dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold tracking-tight text-brand-primary dark:text-slate-100 truncate">{listingTitle}</p>
                      <p className="mt-1 text-xs text-brand-ink-muted dark:text-slate-400 truncate">{customerName}</p>
                    </div>
                    <p className="hidden sm:block text-[13px] text-brand-ink-muted dark:text-slate-400 whitespace-nowrap">{dateTime}</p>
                    <p className="font-display text-sm font-bold text-brand-primary dark:text-slate-100 whitespace-nowrap">{amountDisplay}</p>
                    <div className="justify-self-end">
                      <span className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize border ${statusClassName}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Create New Listing Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={closeModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">Create New Listing</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Service Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Deep Apartment Cleaning"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
                  <select
                    value={formData.service_type}
                    onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                  >
                    <option value="">Select a category</option>
                    {SERVICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type[0].toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Hourly Rate ($)</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="45"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Briefly describe the service..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent resize-none"
                />
              </div>

              <AvailabilitySelector
                value={formData.availability}
                onChange={(slots) => setFormData({ ...formData, availability: slots })}
              />

              {/* Listing Strength Meter */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Listing Strength</span>
                  <span className={`text-xs font-semibold ${strength.textClass}`}>{strength.label}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${strength.barClass}`}
                    style={{ width: `${strength.score}%` }}
                  />
                </div>
                {strength.score < 75 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {!formData.description.trim()
                      ? 'Add a description to strengthen your listing.'
                      : 'Add more detail to your description to reach Excellent.'}
                  </p>
                )}
              </div>

              {submitError && <p className="text-xs text-red-600">{submitError}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  'Save & Add Listing'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Listing Modal */}
      {editingListingId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 relative shadow-xl">
            <button onClick={closeEditModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-slate-100">Edit Listing</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Service Title</label>
                <input
                  type="text"
                  required
                  value={editFormData.title}
                  onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                  placeholder="e.g., Deep Apartment Cleaning"
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Category</label>
                  <select
                    value={editFormData.service_type}
                    onChange={(e) => setEditFormData({ ...editFormData, service_type: e.target.value })}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                  >
                    <option value="">Select a category</option>
                    {SERVICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type[0].toUpperCase() + type.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Hourly Rate ($)</label>
                  <input
                    type="number"
                    value={editFormData.price}
                    onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                    placeholder="45"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Briefly describe the service..."
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent resize-none"
                />
              </div>

              <AvailabilitySelector
                value={editFormData.availability}
                onChange={(slots) => setEditFormData({ ...editFormData, availability: slots })}
              />

              {editSubmitError && <p className="text-xs text-red-600">{editSubmitError}</p>}
              <button
                type="submit"
                disabled={isEditSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-brand-primary hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-brand-accent"
              >
                {isEditSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
