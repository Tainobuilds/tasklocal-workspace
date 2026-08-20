'use client';

import { useState, useEffect } from 'react';
import { Store, MessageSquare, X, Sparkles, CheckCircle, Loader2 } from 'lucide-react';
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
              onClick={() => setActiveTab('chatbot')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === 'chatbot' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={16} /> AI Matcher
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
            <MatchingChatbot listings={listings} />
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
    </div>
  );
}
