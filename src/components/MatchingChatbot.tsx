'use client';

import { useState } from 'react';
import { Search, CheckCircle, Sparkles, Star, Zap, X, SearchX, Loader2, BadgeCheck } from 'lucide-react';

interface Props {
  listings: any[];
  onBookingConfirmed?: (booking: any) => void;
}

const CATEGORY_SUGGESTIONS = [
  { label: '🧹 Cleaning', value: 'cleaning' },
  { label: '🔧 Handyman', value: 'handyman' },
  { label: '⚡ Electrical', value: 'electrical' },
  { label: '🚰 Plumbing', value: 'plumbing' },
  { label: '📋 All Services', value: 'all' }
];

const INTENT_SYNONYMS: Record<string, string[]> = {
  plumbing: ['plumbing', 'leak', 'pipe', 'faucet', 'drain', 'toilet', 'water heater'],
  electrical: ['electrical', 'outlet', 'wire', 'wiring', 'circuit', 'breaker', 'light fixture'],
  cleaning: ['cleaning', 'clean', 'housekeeping', 'maid', 'tidy'],
  handyman: ['handyman', 'repair', 'fix', 'install', 'assemble']
};

const matchIntentCategories = (searchTerm: string) =>
  Object.entries(INTENT_SYNONYMS)
    .filter(([, synonyms]) => synonyms.some((syn) => searchTerm.includes(syn)))
    .map(([category]) => category);

// Broad category terms trigger a Thumbtack-style guided intake question
// instead of dumping unfiltered results straight away.
const BROAD_CATEGORIES = Object.keys(INTENT_SYNONYMS);
const JOB_TYPE_OPTIONS = ['Residential', 'Commercial', 'Emergency'];

// Turns an unstructured request like "fix a leaking tap under my sink today"
// into structured filters: Category / Urgency / Scope.
const URGENCY_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: 'Emergency', keywords: ['emergency', 'urgent', 'urgently', 'asap', 'right away', 'immediately'] },
  { label: 'Today', keywords: ['today', 'now', 'tonight', 'this morning', 'this afternoon'] },
  { label: 'This Week', keywords: ['this week', 'few days', 'couple days', 'soon'] }
];

const SCOPE_RULES: Array<{ label: string; keywords: string[] }> = [
  { label: 'Minor Repair', keywords: ['leak', 'leaking', 'fix', 'repair', 'small', 'minor', 'quick', 'patch', 'clog', 'clogged'] },
  { label: 'Installation', keywords: ['install', 'installation', 'replace', 'replacement', 'set up', 'setup', 'new'] },
  { label: 'Major Project', keywords: ['renovation', 'remodel', 'rebuild', 'overhaul', 'whole house'] }
];

const detectFromRules = (term: string, rules: Array<{ label: string; keywords: string[] }>) =>
  rules.find((rule) => rule.keywords.some((kw) => term.includes(kw)))?.label ?? null;

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const parseStructuredIntent = (term: string) => {
  const categories = matchIntentCategories(term);
  return {
    category: categories[0] ? capitalize(categories[0]) : null,
    urgency: detectFromRules(term, URGENCY_RULES) ?? 'Flexible',
    scope: detectFromRules(term, SCOPE_RULES) ?? 'General'
  };
};

type StructuredIntent = ReturnType<typeof parseStructuredIntent>;

const SERVICE_FEE = 5;
const CONFETTI_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8'];

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getRating = (item: any) => {
  if (typeof item.rating === 'number') return item.rating.toFixed(1);
  const seed = hashString(String(item.listing_id || item.id || item.title || item.name || 'service'));
  return (4.4 + (seed % 6) / 10).toFixed(1);
};

const getResponseTime = (item: any) => {
  if (item.response_time) return item.response_time;
  const seed = hashString(`${item.listing_id || item.id || item.title || item.name || 'service'}-rt`);
  return 5 + (seed % 5) * 5;
};

const getVerified = (item: any) => {
  if (typeof item.verified === 'boolean') return item.verified;
  const seed = hashString(`${item.listing_id || item.id || item.title || item.name || 'service'}-verified`);
  return seed % 5 !== 0; // ~80% of pros are Verified
};

const getAvailableToday = (item: any) => {
  if (typeof item.available_today === 'boolean') return item.available_today;
  const seed = hashString(`${item.listing_id || item.id || item.title || item.name || 'service'}-avail`);
  return seed % 3 !== 0; // ~66% available today
};

const QUICK_FILTERS = [
  { key: 'availableToday', label: '⚡ Available Today' },
  { key: 'under60', label: '💰 Under $60/hr' },
  { key: 'topRated', label: '⭐ Top Rated (4.8+)' }
] as const;

type FilterKey = (typeof QUICK_FILTERS)[number]['key'];

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  matches?: any[];
  intakeCategory?: string;
  resolved?: boolean;
  structured?: StructuredIntent;
}

export default function MatchingChatbot({ listings, onBookingConfirmed }: Props) {
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: 'bot', text: 'Hello! What service are you looking for today? Select a quick category below or type a query.' }
  ]);

  const [bookingListing, setBookingListing] = useState<any | null>(null);
  const [bookingHours, setBookingHours] = useState(2);
  const [bookingStatus, setBookingStatus] = useState<'form' | 'success'>('form');
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<Array<{ id: number; left: number; color: string; delay: number; rotate: number }>>([]);

  const [activeFilters, setActiveFilters] = useState<Record<FilterKey, boolean>>({
    availableToday: false,
    under60: false,
    topRated: false
  });

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  const hasAnyResults = chatMessages.some((m) => m.matches);

  const applyFilters = (items: any[]) =>
    items.filter((item) => {
      if (activeFilters.availableToday && !getAvailableToday(item)) return false;
      if (activeFilters.under60) {
        const price = item.price_per_hour || item.price || item.rate || 0;
        if (price >= 60) return false;
      }
      if (activeFilters.topRated && parseFloat(getRating(item)) < 4.8) return false;
      return true;
    });

  const runMatch = (term: string, isAll: boolean) => {
    const intentCategories = matchIntentCategories(term);

    return isAll
      ? listings
      : listings.filter((item) => {
          const name = item.title || item.name || item.service_name || '';
          const cat = item.category || item.service_type || item.type || '';
          const desc = item.description || item.details || '';
          const catLower = cat.toLowerCase();

          return (
            name.toLowerCase().includes(term) ||
            catLower.includes(term) ||
            desc.toLowerCase().includes(term) ||
            intentCategories.some((c) => catLower.includes(c))
          );
        });
  };

  const executeSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    const term = searchTerm.toLowerCase().trim();
    const isAll = term === 'all';

    // Broad category query: ask a quick guided-intake question instead of
    // dumping every listing in that category straight away.
    if (!isAll && BROAD_CATEGORIES.includes(term)) {
      setChatMessages((prev) => [
        ...prev,
        { sender: 'user', text: `Looking for: ${searchTerm}` },
        { sender: 'bot', text: `Got it — ${term}. What type of job is this?`, intakeCategory: term }
      ]);
      return;
    }

    const matched = runMatch(term, isAll);

    // Free-text requests carry more signal than a bare category — parse out
    // Category / Urgency / Scope so the customer can see what we understood.
    const structured = !isAll ? parseStructuredIntent(term) : undefined;
    if (structured?.category && (structured.urgency === 'Today' || structured.urgency === 'Emergency')) {
      setActiveFilters((prev) => ({ ...prev, availableToday: true }));
    }

    setChatMessages((prev) => [
      ...prev,
      { sender: 'user', text: isAll ? 'Show all services' : `Looking for: ${searchTerm}` },
      {
        sender: 'bot',
        text: matched.length > 0
          ? `I found ${matched.length} matching service(s):`
          : `I couldn't find any listings matching "${searchTerm}".`,
        matches: matched,
        structured: structured?.category ? structured : undefined
      }
    ]);
  };

  const resolveIntake = (msgIndex: number, category: string, jobType: string) => {
    const combinedTerm = `${category} ${jobType.toLowerCase()}`;
    const matched = runMatch(combinedTerm, false);

    setChatMessages((prev) => [
      ...prev.map((m, idx) => (idx === msgIndex ? { ...m, resolved: true } : m)),
      { sender: 'user', text: jobType },
      {
        sender: 'bot',
        text: matched.length > 0
          ? `Here are ${jobType.toLowerCase()} ${category} pros I found:`
          : `I couldn't find any ${jobType.toLowerCase()} ${category} listings — here's what's available in ${category}:`,
        matches: matched
      }
    ]);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
    setQuery('');
  };

  const openBookingModal = (item: any) => {
    setBookingListing(item);
    setBookingHours(2);
    setBookingStatus('form');
  };

  const closeBookingModal = () => {
    setBookingListing(null);
    setBookingStatus('form');
    setIsBookingSubmitting(false);
    setConfettiPieces([]);
  };

  const confirmBooking = () => {
    setIsBookingSubmitting(true);

    setTimeout(() => {
      setIsBookingSubmitting(false);
      setBookingStatus('success');
      setConfettiPieces(
        Array.from({ length: 16 }).map((_, i) => ({
          id: i,
          left: Math.random() * 100,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delay: Math.random() * 200,
          rotate: Math.random() * 360
        }))
      );

      const title = bookingListing?.title || bookingListing?.name || bookingListing?.service_name || 'the service';
      setChatMessages((prev) => [
        ...prev,
        { sender: 'bot', text: `✅ Booking confirmed for ${title} — estimated total $${bookingTotal.toFixed(2)}.` }
      ]);

      onBookingConfirmed?.({
        title,
        category: bookingListing?.category || bookingListing?.service_type || bookingListing?.type || 'General',
        hours: bookingHours,
        hourlyRate,
        serviceFee: SERVICE_FEE,
        total: bookingTotal,
        status: 'Confirmed'
      });

      setTimeout(() => closeBookingModal(), 2200);
    }, 700);
  };

  const hourlyRate = bookingListing ? bookingListing.price_per_hour || bookingListing.price || bookingListing.rate || 0 : 0;
  const bookingSubtotal = hourlyRate * bookingHours;
  const bookingTotal = bookingSubtotal + SERVICE_FEE;
  const bookingTitle = bookingListing?.title || bookingListing?.name || bookingListing?.service_name || 'Service';

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-sm text-slate-900 dark:text-slate-100">TaskLocal AI Match Assistant</span>
        </div>
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Sparkles size={12} className="text-teal-600" /> Instant Search Active
        </span>
      </div>

      {/* Smart Quick-Filters */}
      {hasAnyResults && (
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide shrink-0">Filters</span>
          {QUICK_FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => toggleFilter(filter.key)}
              aria-pressed={activeFilters[filter.key]}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                activeFilters[filter.key]
                  ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {filter.label}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              onClick={() => setActiveFilters({ availableToday: false, under60: false, topRated: false })}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline ml-auto focus:outline-none"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`animate-in fade-in slide-in-from-bottom-2 flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${
                msg.sender === 'user'
                  ? 'bg-teal-600 text-white rounded-br-none'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-none border border-slate-200 dark:border-slate-700'
              }`}
            >
              {msg.text}
            </div>

            {msg.structured && (
              <div className="animate-in fade-in slide-in-from-bottom-2 mt-2 w-full bg-teal-50/60 border border-teal-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-teal-700 uppercase tracking-wide mb-1.5">
                  <Sparkles size={11} /> Parsed Intent
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-medium text-teal-700 bg-white dark:bg-slate-900 border border-teal-200 px-2 py-0.5 rounded-full">
                    Category: {msg.structured.category}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                    Urgency: {msg.structured.urgency}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                    Scope: {msg.structured.scope}
                  </span>
                </div>
              </div>
            )}

            {msg.intakeCategory && !msg.resolved && (
              <div className="animate-in fade-in slide-in-from-bottom-2 mt-3 flex flex-wrap gap-2">
                {JOB_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => resolveIntake(i, msg.intakeCategory!, option)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all focus:outline-none focus:ring-2 ${
                      option === 'Emergency'
                        ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100 focus:ring-red-500'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 focus:ring-teal-500'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            {msg.matches && msg.matches.length > 0 && (() => {
              const filteredMatches = applyFilters(msg.matches);

              if (filteredMatches.length === 0) {
                return (
                  <div className="animate-in fade-in slide-in-from-bottom-2 mt-3 w-full flex flex-col items-center text-center bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-5">
                    <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                      <SearchX size={18} className="text-slate-500" />
                    </div>
                    <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">No pros match your filters</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">Try loosening or clearing a filter above.</p>
                  </div>
                );
              }

              return (
                <div className="mt-3 w-full space-y-2">
                  {filteredMatches.map((item, matchIdx) => {
                    const title = item.title || item.name || item.service_name || 'Service';
                    const price = item.price_per_hour || item.price || item.rate || 0;
                    const rating = getRating(item);
                    const responseTime = getResponseTime(item);
                    const verified = getVerified(item);
                    return (
                      <div
                        key={matchIdx}
                        style={{ animationDelay: `${matchIdx * 60}ms` }}
                        className="animate-in fade-in slide-in-from-bottom-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-sm flex items-center gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">{title}</span>
                            <span className="font-bold text-emerald-600 text-sm shrink-0">${price}/hr</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                              {item.category || item.service_type || 'General'}
                            </span>
                            <span className="flex items-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                              <Star size={10} className="fill-amber-400 text-amber-400" /> {rating}
                            </span>
                            {verified && (
                              <span className="flex items-center gap-0.5 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                                <BadgeCheck size={10} /> Verified Pro
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[11px] text-slate-500">
                              <Zap size={10} className="text-emerald-500" /> ~{responseTime}m response time
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => openBookingModal(item)}
                          className="shrink-0 self-center flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-emerald-100 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <CheckCircle size={12} /> Book
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {msg.matches && msg.matches.length === 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-2 mt-3 w-full flex flex-col items-center text-center bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                  <SearchX size={18} className="text-slate-500" />
                </div>
                <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">No service listings found yet!</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Head to the Provider Dashboard tab to publish your first service, or try a different search term.
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Category Suggestion Buttons */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs text-slate-500 whitespace-nowrap pl-1">Quick search:</span>
        {CATEGORY_SUGGESTIONS.map((cat) => (
          <button
            key={cat.value}
            onClick={() => executeSearch(cat.value)}
            className="text-xs bg-white dark:bg-slate-900 hover:bg-teal-50 hover:border-teal-300 text-slate-600 dark:text-slate-400 hover:text-teal-700 border border-slate-200 dark:border-slate-800 px-3 py-1 rounded-full whitespace-nowrap transition-all"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleFormSubmit} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2 bg-white dark:bg-slate-900">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a service or requirement..."
          className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
        />
        <button type="submit" className="bg-teal-600 hover:bg-teal-700 text-white p-2.5 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-teal-500">
          <Search size={18} />
        </button>
      </form>

      {/* Booking Modal */}
      {bookingListing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-xl">
            {confettiPieces.map((piece) => (
              <span
                key={piece.id}
                className="confetti-piece absolute top-0 h-2 w-1 rounded-sm"
                style={{
                  left: `${piece.left}%`,
                  backgroundColor: piece.color,
                  animationDelay: `${piece.delay}ms`,
                  transform: `rotate(${piece.rotate}deg)`
                }}
              />
            ))}

            <button onClick={closeBookingModal} className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
              <X size={18} />
            </button>

            {bookingStatus === 'form' ? (
              <>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">Confirm Booking</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{bookingTitle}</p>

                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 mb-4">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Estimated hours</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setBookingHours((h) => Math.max(1, h - 1))}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      −
                    </button>
                    <span className="text-sm font-semibold w-4 text-center text-slate-900 dark:text-slate-100">{bookingHours}</span>
                    <button
                      onClick={() => setBookingHours((h) => Math.min(8, h + 1))}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm mb-5">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>{bookingHours} hr × ${hourlyRate}/hr</span>
                    <span>${bookingSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Service fee</span>
                    <span>${SERVICE_FEE.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 dark:text-slate-100 font-semibold pt-1.5 border-t border-slate-200 dark:border-slate-800">
                    <span>Total</span>
                    <span>${bookingTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={confirmBooking}
                  disabled={isBookingSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-70 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {isBookingSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Confirming...
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center text-center py-4">
                <div className="checkmark-pop h-14 w-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
                  <CheckCircle size={28} className="text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">Booking Confirmed!</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {bookingTitle} is on its way. Total: ${bookingTotal.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
