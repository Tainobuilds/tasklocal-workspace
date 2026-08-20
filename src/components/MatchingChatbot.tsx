'use client';

import { useState } from 'react';
import { Search, CheckCircle, Sparkles } from 'lucide-react';

interface Props {
  listings: any[];
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

export default function MatchingChatbot({ listings }: Props) {
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; matches?: any[] }>>([
    { sender: 'bot', text: 'Hello! What service are you looking for today? Select a quick category below or type a query.' }
  ]);

  const executeSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    const term = searchTerm.toLowerCase();
    const isAll = term === 'all';
    const intentCategories = matchIntentCategories(term);

    const matched = isAll
      ? listings
      : listings.filter((item) => {
          const name = item.title || item.name || item.service_name || '';
          const cat = item.category || item.type || '';
          const desc = item.description || item.details || '';
          const catLower = cat.toLowerCase();

          return (
            name.toLowerCase().includes(term) ||
            catLower.includes(term) ||
            desc.toLowerCase().includes(term) ||
            intentCategories.some((c) => catLower.includes(c))
          );
        });

    setChatMessages((prev) => [
      ...prev,
      { sender: 'user', text: isAll ? 'Show all services' : `Looking for: ${searchTerm}` },
      {
        sender: 'bot',
        text: matched.length > 0 
          ? `I found ${matched.length} matching service(s):` 
          : `I couldn't find any listings matching "${searchTerm}".`,
        matches: matched
      }
    ]);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(query);
    setQuery('');
  };

  return (
    <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-sm">TaskLocal AI Match Assistant</span>
        </div>
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Sparkles size={12} className="text-indigo-400" /> Instant Search Active
        </span>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${
                msg.sender === 'user' 
                  ? 'bg-indigo-600 text-white rounded-br-none' 
                  : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/50'
              }`}
            >
              {msg.text}
            </div>

            {msg.matches && msg.matches.length > 0 && (
              <div className="mt-3 w-full space-y-2">
                {msg.matches.map((item, matchIdx) => {
                  const title = item.title || item.name || item.service_name || 'Service';
                  const price = item.price_per_hour || item.price || item.rate || 0;
                  return (
                    <div key={matchIdx} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-slate-200">{title}</div>
                        <div className="text-xs text-slate-500">{item.category || 'General'} • ${price}/hr</div>
                      </div>
                      <button className="flex items-center gap-1 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-600/30 transition-all">
                        <CheckCircle size={12} /> Book
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick Category Suggestion Buttons */}
      <div className="px-3 py-2 bg-slate-950/50 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-xs text-slate-500 whitespace-nowrap pl-1">Quick search:</span>
        {CATEGORY_SUGGESTIONS.map((cat) => (
          <button
            key={cat.value}
            onClick={() => executeSearch(cat.value)}
            className="text-xs bg-slate-800 hover:bg-indigo-600/30 hover:border-indigo-500/50 text-slate-300 hover:text-white border border-slate-700/60 px-3 py-1 rounded-full whitespace-nowrap transition-all"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleFormSubmit} className="p-3 border-t border-slate-800 flex gap-2 bg-slate-900">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a service or requirement..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
        />
        <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-all">
          <Search size={18} />
        </button>
      </form>
    </div>
  );
}