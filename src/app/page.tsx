'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Store, MessageSquare, X, Sparkles, CheckCircle, ClipboardList, Inbox, Search, ShieldCheck, LogIn } from 'lucide-react';
import ProviderDashboard from '@/components/ProviderDashboard';
import MatchingChatbot from '@/components/MatchingChatbot';

function ProviderDashboardSkeleton() {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-72 bg-slate-200/70 rounded-lg animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-slate-200 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-5 w-20 bg-slate-200 rounded-full animate-pulse" />
              <div className="h-5 w-14 bg-slate-200 rounded-lg animate-pulse" />
            </div>
            <div className="h-5 w-3/4 bg-slate-200 rounded-lg animate-pulse" />
            <div className="h-4 w-full bg-slate-200/70 rounded-lg animate-pulse" />
            <div className="h-4 w-2/3 bg-slate-200/70 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchingChatbotSkeleton() {
  return (
    <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[600px]">
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="h-4 w-40 bg-slate-200 rounded-lg animate-pulse" />
        <div className="h-4 w-24 bg-slate-200 rounded-lg animate-pulse" />
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="h-16 w-2/3 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="h-10 w-1/2 bg-slate-200 rounded-2xl animate-pulse ml-auto" />
        <div className="h-20 w-3/4 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-20 bg-slate-200 rounded-full animate-pulse" />
        ))}
      </div>
      <div className="p-3 border-t border-slate-200 flex gap-2">
        <div className="h-10 flex-1 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-10 w-10 bg-slate-200 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

export default function Home() {
  // `useSearchParams` suspends during prerendering, so the page owns the boundary.
  return (
    <Suspense fallback={null}>
      <HomeTabs />
    </Suspense>
  );
}

function HomeTabs() {
  const searchParams = useSearchParams();
  // Lets links from other pages (e.g. /internal/trust-safety) deep-link into the chatbot tab.
  const [activeTab, setActiveTab] = useState<'provider' | 'chatbot'>(
    searchParams.get('tab') === 'chatbot' ? 'chatbot' : 'provider',
  );
  const [listings, setListings] = useState<any[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
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

  // Owns the actual data mutation (optimistic update, POST, reconciliation,
  // toast) while ProviderDashboard owns the "Create New Listing" form/modal UI.
  const createListing = async (formData: { title: string; category: string; price: string; description: string }) => {
    const newEntry = {
      id: `list-${Date.now()}`,
      title: formData.title,
      category: formData.category || 'General',
      price_per_hour: Number(formData.price) || 0,
      description: formData.description || 'No description provided.'
    };

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
      showToast('Workspace updated: New service now available in Chatbot!');
      return true;
    } catch (err) {
      console.error(err);
      setListings((prev) => prev.filter((item) => item.id !== newEntry.id));
      return false;
    }
  };

  const activeServicesCount = listings.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="border-b border-slate-200 backdrop-blur-md bg-white/80 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white">TL</div>
            <span className="font-semibold text-lg tracking-tight text-slate-900">TaskLocal Workspace</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-500">Active Services</span>
                <span className="font-semibold text-slate-900">{isInitialLoading ? '—' : activeServicesCount}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full text-teal-700">
                <Sparkles size={12} />
                <span>AI Match Rate</span>
                <span className="font-semibold text-teal-800">98%</span>
              </div>
            </div>

            <button
              onClick={() => setIsBookingsDrawerOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              📋 Activity & Bookings
              {bookings.length > 0 && (
                <span className="text-[10px] font-semibold bg-teal-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookings.length}
                </span>
              )}
            </button>
          </div>

          <nav className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              onClick={() => setActiveTab('provider')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'provider' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
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
                activeTab === 'chatbot' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <MessageSquare size={16} /> AI Matcher
              {newServiceCount > 0 && (
                <span
                  title={`+${newServiceCount} New Service${newServiceCount > 1 ? 's' : ''} Available`}
                  className="glow-badge fade-in slide-in-from-top-2 absolute -top-2.5 -right-2.5 flex items-center gap-1 text-[10px] font-semibold bg-emerald-500 text-white px-2 py-0.5 rounded-full whitespace-nowrap"
                >
                  +{newServiceCount} New
                </span>
              )}
            </button>
          </nav>

          {/*
            Cross-links into the customer-facing app (kanubow's feature/customer-dashboard):
            that suite has its own SiteHeader/dark theme, so these are plain links rather than
            an imported shared header, to avoid mismatching this workspace's light theme.
          */}
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200 shrink-0 text-xs">
            <Link href="/browse" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors">
              <Search size={14} />
              <span className="hidden sm:inline">Browse</span>
            </Link>
            <Link href="/login" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors">
              <LogIn size={14} />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
            <Link
              href="/internal/trust-safety"
              title="Internal trust & safety console"
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ShieldCheck size={14} />
              <span className="hidden lg:inline">Trust &amp; Safety</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div key={activeTab} className="tab-transition">
          {activeTab === 'provider' ? (
            isInitialLoading ? (
              <ProviderDashboardSkeleton />
            ) : (
              <ProviderDashboard listings={listings} bookings={bookings} onCreateListing={createListing} />
            )
          ) : isInitialLoading ? (
            <MatchingChatbotSkeleton />
          ) : (
            <MatchingChatbot listings={listings} onBookingConfirmed={addBooking} />
          )}
        </div>
      </main>

      {toast && (
        <div className="fixed top-20 right-6 z-[60] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 bg-white border border-teal-200 shadow-lg text-sm text-slate-900 px-4 py-3 rounded-xl max-w-xs">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Global Booking Ledger Drawer */}
      <div
        onClick={() => setIsBookingsDrawerOpen(false)}
        className={`fixed inset-0 bg-black/40 z-[70] transition-opacity duration-300 ${
          isBookingsDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 z-[80] w-full max-w-md bg-white border-l border-slate-200 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
          isBookingsDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-teal-600" />
            <h2 className="font-semibold text-slate-900">Activity & Bookings</h2>
          </div>
          <button onClick={() => setIsBookingsDrawerOpen(false)} className="text-slate-400 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {bookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Inbox size={20} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-900 font-medium">No bookings yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Book a service from the AI Matcher and it'll show up here with a full receipt.
              </p>
            </div>
          ) : (
            bookings.map((booking) => (
              <div key={booking.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-sm text-slate-900">{booking.title}</span>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                    {booking.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <span>{booking.category}</span>
                  <span>•</span>
                  <span>{new Date(booking.bookedAt).toLocaleString()}</span>
                </div>
                <div className="space-y-1 text-xs border-t border-slate-200 pt-3">
                  <div className="flex justify-between text-slate-600">
                    <span>{booking.hours} hr × ${booking.hourlyRate}/hr</span>
                    <span>${(booking.hours * booking.hourlyRate).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Service fee</span>
                    <span>${Number(booking.serviceFee).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-semibold pt-1 border-t border-slate-200">
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
