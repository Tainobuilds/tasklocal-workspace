'use client';

import { Plus } from 'lucide-react';

interface Props {
  listings: any[];
  onOpenModal: () => void;
}

export default function ProviderDashboard({ listings, onOpenModal }: Props) {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Provider Dashboard</h1>
          <p className="text-slate-400 text-sm">Manage active local listings and services</p>
        </div>
        <button
          onClick={onOpenModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Listing
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {listings.map((item, idx) => {
          const title = item.title || item.name || item.service_name || 'Unnamed Service';
          const category = item.category || item.type || 'General';
          const price = item.price_per_hour || item.price || item.rate || 0;
          const description = item.description || item.details || 'No description available.';

          return (
            <div key={item.id || idx} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-2.5 py-0.5 rounded-full">
                  {category}
                </span>
                <span className="font-bold text-emerald-400">${price}/hr</span>
              </div>
              <h3 className="font-semibold text-lg text-slate-100">{title}</h3>
              <p className="text-slate-400 text-sm mt-1 line-clamp-2">{description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
