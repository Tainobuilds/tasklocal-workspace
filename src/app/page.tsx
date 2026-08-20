'use client';

import { useState, useEffect } from 'react';
import { Store, MessageSquare, Search, CheckCircle } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'provider' | 'chatbot'>('provider');
  const [listings, setListings] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; matches?: any[] }>>([
    { sender: 'bot', text: 'Hello! What service are you looking for today? Try typing "cleaning" or "handyman".' }
  ]);

  useEffect(() => {
    fetch('/api/listings')
      .then((res) => res.json())
      .then((data) => setListings(Array.isArray(data) ? data : []));
  }, []);

  const handleChatSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userText = query;
    setQuery('');

    const matched = listings.filter((item) =>
      item.title?.toLowerCase().includes(userText.toLowerCase()) ||
      item.category?.toLowerCase().includes(userText.toLowerCase()) ||
      item.description?.toLowerCase().includes(userText.toLowerCase())
    );

    setChatMessages((prev) => [
      ...prev,
      { sender: 'user', text: userText },
      {
        sender: 'bot',
        text: matched.length > 0 ? `I found ${matched.length} matching service(s) for you:` : "I couldn't find any listings matching that description.",
        matches: matched
      }
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">TL</div>
            <span className="font-semibold text-lg tracking-tight">TaskLocal Workspace</span>
          </div>

          <nav className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveTab('provider')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'provider' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Store size={16} /> Provider App
            </button>
            <button
              onClick={() => setActiveTab('chatbot')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'chatbot' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare size={16} /> Matching Chatbot
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'provider' ? (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Provider Dashboard</h1>
              <p className="text-slate-400 text-sm">Manage active local listings and services</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((item, idx) => (
                <div key={item.id || idx} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-2.5 py-0.5 rounded-full">
                      {item.category || 'Service'}
                    </span>
                    <span className="font-bold text-emerald-400">${item.price_per_hour || item.price || 0}/hr</span>
                  </div>
                  <h3 className="font-semibold text-lg text-slate-100">{item.title || item.name}</h3>
                  <p className="text-slate-400 text-sm mt-1 line-clamp-2">{item.description || 'No description available.'}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium text-sm">TaskLocal AI Match Assistant</span>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[80%] p-3.5 rounded-2xl text-sm ${
                      msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/50'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {msg.matches && msg.matches.length > 0 && (
                    <div className="mt-3 w-full space-y-2">
                      {msg.matches.map((item, matchIdx) => (
                        <div key={matchIdx} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="font-medium text-sm text-slate-200">{item.title || item.name}</div>
                            <div className="text-xs text-slate-500">{item.category} • ${item.price_per_hour || item.price}/hr</div>
                          </div>
                          <button className="flex items-center gap-1 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                            <CheckCircle size={12} /> Book
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleChatSearch} className="p-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask for a service (e.g., 'cleaning')..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-all">
                <Search size={18} />
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}