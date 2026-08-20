'use client';

import { useState } from 'react';
import { Search, CheckCircle } from 'lucide-react';

interface Props {
  listings: any[];
}

export default function MatchingChatbot({ listings }: Props) {
  const [query, setQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; matches?: any[] }>>([
    { sender: 'bot', text: 'Hello! What service are you looking for today? Try typing "cleaning" or "handyman".' }
  ]);

  const handleChatSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userText = query;
    setQuery('');

    const matched = listings.filter((item) => {
      const name = item.title || item.name || item.service_name || '';
      const cat = item.category || item.type || '';
      const desc = item.description || item.details || '';
      return (
        name.toLowerCase().includes(userText.toLowerCase()) ||
        cat.toLowerCase().includes(userText.toLowerCase()) ||
        desc.toLowerCase().includes(userText.toLowerCase())
      );
    });

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
                {msg.matches.map((item, matchIdx) => {
                  const title = item.title || item.name || item.service_name || 'Service';
                  const price = item.price_per_hour || item.price || item.rate || 0;
                  return (
                    <div key={matchIdx} className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm text-slate-200">{title}</div>
                        <div className="text-xs text-slate-500">{item.category || 'General'} • ${price}/hr</div>
                      </div>
                      <button className="flex items-center gap-1 text-xs bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
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
  );
}