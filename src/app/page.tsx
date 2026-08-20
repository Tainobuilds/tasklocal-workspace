'use client';

import { useState, useEffect, useRef } from 'react';
import { Store, MessageSquare, X, Sparkles, CheckCircle, Loader2, ClipboardList, Inbox } from 'lucide-react';
import ProviderDashboard from '@/components/ProviderDashboard';
import MatchingChatbot from '@/components/MatchingChatbot';

function ProviderDashboardSkeleton() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-slate-800/70 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-slate-800 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-5 w-20 bg-slate-800 rounded-full animate-pulse" />
              <div className="h-5 w-14 bg-slate-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-5 w-3/4 bg-slate-800 rounded-lg animate-pulse" />
            <div className="h-4 w-full bg-slate-800/70 rounded-lg animate-pulse" />
            <div className="h-4 w-2/3 bg-slate-800/70 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchingChatbotSkeleton() {
  return (
    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <div className="h-4 w-40 bg-slate-800 rounded-lg animate-pulse" />
        <div className="h-4 w-24 bg-slate-800 rounded-lg animate-pulse" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="h-16 w-2/3 bg-slate-800 rounded-2xl animate-pulse" />
        <div className="h-10 w-1/2 bg-slate-800 rounded-2xl animate-pulse ml-auto" />
        <div className="h-20 w-3/4 bg-slate-800 rounded-2xl animate-pulse" />
      </div>
      <div className="px-3 py-2 bg-slate-950/50 border-t border-slate-800/80 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-20 bg-slate-800 rounded-full animate-pulse" />
        ))}
      </div>
      <div className="p-3 border-t border-slate-800 flex gap-2">
        <div className="h-10 flex-1 bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-10 w-10 bg-slate-800 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'provider' | 'chatbot'>('provider');
  const [listings, setListings] = useState<any[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ title: '', category: '', price: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newServiceCount, setNewServiceCount] = useState(0);

  const [bookings, setBookings] = useState<any[]>([]);
  const [isBookingsHydrated, setIsBookingsHydrated] = useState(false);
  const [isBookingsDrawerOpen, setIsBookingsDrawerOpen] = useState(false);

  const knownListingsCountRef = useRef(0);
  const activeTabRef = useRef(activeTab);

  // Hydrate the shared bookings ledger from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tasklocal_bookings');
      if (stored) setBookings(JSON.parse(stored));
    } catch (err) {
      console.error(err);
    } finally {
      setIsBookingsHydrated(true);
    }
  }, []);

  // Persist the ledger whenever it changes, but only after hydration has
  // completed so we don't overwrite stored data with the initial empty state.
  useEffect(() => {
    if (!isBookingsHydrated) return;
    try {
      localStorage.setItem('tasklocal_bookings', JSON.stringify(bookings));
    } catch (err) {
      console.error(err);
    }
  }, [bookings, isBookingsHydrated]);

  const addBooking = (booking: any) => {
    setBookings((prev) => [{ id: `booking-${Date.now()}`, bookedAt: new Date().toISOString(), ...booking }, ...prev]);
  };

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    knownListingsCountRef.current = listings.length;
  }, [listings]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchListings = async () => {
    try {
      const res = await fetch('/api/listings');
      const data = await res.json();
      setListings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchListings();
      setIsInitialLoading(false);
    })();
  }, []);

  // Real-time event pulse: poll for listings created elsewhere (e.g. another
  // provider) and surface them via a tab badge without disrupting the view.
  useEffect(() => {
    const pollForNewListings = async () => {
      try {
        const res = await fetch('/api/listings');
        const data = await res.json();
        const fresh = Array.isArray(data) ? data : [];
        const delta = fresh.length - knownListingsCountRef.current;

        if (delta > 0) {
          setListings(fresh);
          if (activeTabRef.current !== 'chatbot') {
            setNewServiceCount((prev) => prev + delta);
            showToast(`+${delta} New Service${delta > 1 ? 's' : ''} Available`);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };

    const interval = setInterval(pollForNewListings, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || isSubmitting) return;

    const newEntry = {
      id: `list-${Date.now()}`,
      title: formData.title,
      category: formData.category || 'General',
      price_per_hour: Number(formData.price) || 0,
      description: formData.description || 'No description provided.'
    };

    setIsSubmitting(true);
    setSubmitError(null);

    // Optimistic update so both views react instantly, reconciled below.
    setListings((prev) => [...prev, newEntry]);

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });

      if (!res.ok) throw new Error('Failed to save new listing');

      await fetchListings();
      setFormData({ title: '', category: '', price: '', description: '' });
      setIsModalOpen(false);
      showToast('Workspace updated: New service now available in Chatbot!');
    } catch (err) {
      console.error(err);
      setListings((prev) => prev.filter((item) => item.id !== newEntry.id));
      setSubmitError('Something went wrong saving this listing. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeServicesCount = listings.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 backdrop-blur-md bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">TL</div>
            <span className="font-semibold text-lg tracking-tight">TaskLocal Workspace</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/50 px-3 py-1 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400">Active Services</span>
                <span className="font-semibold text-slate-100">{isInitialLoading ? '—' : activeServicesCount}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-indigo-950/60 border border-indigo-800/40 px-3 py-1 rounded-full text-indigo-300">
                <Sparkles size={12} />
                <span>AI Match Rate</span>
                <span className="font-semibold text-indigo-200">98%</span>
              </div>
            </div>

            <button
              onClick={() => setIsBookingsDrawerOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              📋 Activity & Bookings
              {bookings.length > 0 && (
                <span className="text-[10px] font-semibold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookings.length}
                </span>
              )}
            </button>
          </div>

          <nav className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/50 shrink-0">
            <button
              onClick={() => setActiveTab('provider')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'provider' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Store size={16} /> Provider View
            </button>
            <button
              onClick={() => {
                setActiveTab('chatbot');
                setNewServiceCount(0);
              }}
              className={`relative flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'chatbot' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={16} /> AI Matcher
              {newServiceCount > 0 && (
                <span
                  title={`+${newServiceCount} New Service${newServiceCount > 1 ? 's' : ''} Available`}
                  className="glow-badge fade-in slide-in-from-top-2 absolute -top-2.5 -right-2.5 flex items-center gap-1 text-[10px] font-semibold bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full whitespace-nowrap"
                >
                  +{newServiceCount} New
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div key={activeTab} className="tab-transition">
          {activeTab === 'provider' ? (
            isInitialLoading ? (
              <ProviderDashboardSkeleton />
            ) : (
              <ProviderDashboard listings={listings} onOpenModal={() => setIsModalOpen(true)} />
            )
          ) : isInitialLoading ? (
            <MatchingChatbotSkeleton />
          ) : (
            <MatchingChatbot listings={listings} onBookingConfirmed={addBooking} />
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 relative shadow-2xl">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setSubmitError(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold mb-4 text-slate-100">Create New Listing</h2>
            <form onSubmit={handleCreateListing} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Service Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Deep Apartment Cleaning"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="e.g., Cleaning"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Hourly Rate ($)</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="45"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Briefly describe the service..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              {submitError && <p className="text-xs text-red-400">{submitError}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm mt-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

      {toast && (
        <div className="fixed top-20 right-6 z-[60] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 bg-slate-900 border border-indigo-500/30 shadow-2xl shadow-black/40 text-sm text-slate-100 px-4 py-3 rounded-xl max-w-xs">
            <CheckCircle size={16} className="text-emerald-400 shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Global Booking Ledger Drawer */}
      <div
        onClick={() => setIsBookingsDrawerOpen(false)}
        className={`fixed inset-0 bg-black/50 z-[70] transition-opacity duration-300 ${
          isBookingsDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 z-[80] w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isBookingsDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-indigo-400" />
            <h2 className="font-semibold text-slate-100">Activity & Bookings</h2>
          </div>
          <button onClick={() => setIsBookingsDrawerOpen(false)} className="text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-4">
              <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                <Inbox size={20} className="text-slate-500" />
              </div>
              <p className="text-sm text-slate-300 font-medium">No bookings yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Book a service from the AI Matcher and it'll show up here with a full receipt.
              </p>
            </div>
          ) : (
            bookings.map((booking) => (
              <div key={booking.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-100">{booking.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    {booking.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <span>{booking.category}</span>
                  <span>•</span>
                  <span>{new Date(booking.bookedAt).toLocaleString()}</span>
                </div>
                <div className="space-y-1 text-xs border-t border-slate-800 pt-3">
                  <div className="flex justify-between text-slate-400">
                    <span>{booking.hours} hr × ${booking.hourlyRate}/hr</span>
                    <span>${(booking.hours * booking.hourlyRate).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Service fee</span>
                    <span>${Number(booking.serviceFee).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-100 font-semibold pt-1 border-t border-slate-800">
                    <span>Total</span>
                    <span>${Number(booking.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
