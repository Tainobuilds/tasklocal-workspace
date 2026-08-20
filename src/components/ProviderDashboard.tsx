'use client';

import { Plus, PackageSearch } from 'lucide-react';

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
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Plus size={16} /> New Listing
        </button>
      </div>

      {listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
          <div className="h-14 w-14 rounded-full bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center mb-4">
            <PackageSearch size={24} className="text-indigo-400" />
          </div>
          <h3 className="text-slate-200 font-semibold mb-1">No service listings found yet!</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-5">
            Publish your first service to get discovered by the AI Matcher and start receiving bookings.
          </p>
          <button
            onClick={onOpenModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Plus size={16} /> Publish Your First Service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {listings.map((item, idx) => {
            const title = item.title || item.name || item.service_name || 'Unnamed Service';
            const category = item.category || item.type || 'General';
            const price = item.price_per_hour || item.price || item.rate || 0;
            const description = item.description || item.details || 'No description available.';

            return (
              <div
                key={item.id || idx}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-lg hover:shadow-black/30"
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-lg text-slate-100 truncate">{title}</h3>
                  <span className="font-bold text-emerald-400 shrink-0">${price}/hr</span>
                </div>
                <span className="inline-block text-[11px] font-medium text-slate-400 bg-slate-800/80 border border-slate-700/50 px-2 py-0.5 rounded-full mb-2">
                  {category}
                </span>
                <p className="text-slate-400 text-sm line-clamp-2">{description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
