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
  onCreateListing: (formData: ListingFormData) => Promise<boolean>;
  onEditListing: (listingId: string, formData: ListingFormData) => Promise<boolean>;
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

export default function ProviderDashboard({ listings, bookings, realBookings, onCreateListing, onEditListing }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<ListingFormData>(EMPTY_FORM);
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);

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

  const strength = getListingStrength(formData);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Provider Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Manage active local listings and services</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-brand-primary hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent"
        >
          <Plus size={16} /> New Listing
        </button>
      </div>

      {/* Dashboard Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-brand-primary/10 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-brand-primary" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Active Services</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{activeServicesCount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <DollarSign size={18} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Revenue</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">${totalRevenue.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
            <Gauge size={18} className="text-sky-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Average Hourly Rate</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{averageHourlyRate === null ? '—' : `$${averageHourlyRate.toFixed(2)}/hr`}</p>
          </div>
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
            const statusBadge =
              status !== 'active'
                ? {
                    flagged: { label: 'Flagged', className: 'bg-amber-50 text-amber-700 border-amber-200' },
                    pending: { label: 'Pending review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
                    removed: { label: 'Removed', className: 'bg-red-50 text-red-700 border-red-200' },
                  }[status] ?? { label: status, className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700' }
                : null;

            return (
              <div
                key={item.listing_id || item.id || idx}
                className="bg-white dark:bg-slate-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-md"
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 truncate">{title}</h3>
                  <span className={`font-bold shrink-0 ${hasValidRate ? 'text-emerald-600' : 'text-slate-400 text-xs'}`}>
                    {hasValidRate ? `$${rate}/hr` : 'Price needs review'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-block text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                    {category}
                  </span>
                  {statusBadge && (
                    <span className={`inline-block text-[11px] font-medium border px-2 py-0.5 rounded-full ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-slate-600 dark:text-slate-400 text-sm line-clamp-2">{description}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-brand-primary dark:hover:text-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-md px-2 py-1"
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
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Recent Customer Bookings</h2>
          <div className="space-y-2">
            {realBookings.map((booking, idx) => {
              const listing = listings.find((item) => item.listing_id === booking.listing_id);
              const listingTitle = listing?.title || booking.listing_id || 'Unknown service';
              const status = typeof booking.booking_status === 'string' ? booking.booking_status : 'confirmed';
              const statusClassName =
                status === 'cancelled'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : status === 'completed'
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200';

              return (
                <div
                  key={booking.booking_id || idx}
                  className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2.5"
                >
                  <span className="text-sm text-slate-900 dark:text-slate-100 truncate">{listingTitle}</span>
                  <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-full shrink-0 ${statusClassName}`}>
                    {status}
                  </span>
                </div>
              );
            })}
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
