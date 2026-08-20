'use client';

import { useId } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

import { slotKey } from '@/lib/sanitize';
import { formatUsd } from '@/lib/pricing';
import { SERVICE_TYPES, WEEKDAYS, type AvailabilitySlot, type Filters, type ServiceType } from '@/lib/types';

const PERIODS = ['AM', 'PM'] as const;

const SERVICE_LABELS: Record<ServiceType, string> = {
  cleaning: 'Cleaning',
  handyman: 'Handyman',
  moving: 'Moving',
};

interface Props {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Price slider bounds, derived from the listings that actually have a price. */
  bounds: { min: number; max: number };
  /** True when the entered min exceeded the max and was auto-corrected. */
  swapped: boolean;
  activeCount: number;
}

export default function FilterBar({ filters, onChange, bounds, swapped, activeCount }: Props) {
  const sliderId = useId();

  const minValue = filters.minPrice ?? bounds.min;
  const maxValue = filters.maxPrice ?? bounds.max;
  const span = Math.max(bounds.max - bounds.min, 1);
  const leftPct = ((Math.min(minValue, maxValue) - bounds.min) / span) * 100;
  const rightPct = ((Math.max(minValue, maxValue) - bounds.min) / span) * 100;

  const toggleService = (type: ServiceType) => {
    const next = filters.serviceTypes.includes(type)
      ? filters.serviceTypes.filter((t) => t !== type)
      : [...filters.serviceTypes, type];
    onChange({ ...filters, serviceTypes: next });
  };

  const toggleSlot = (slot: AvailabilitySlot) => {
    const key = slotKey(slot);
    const next = filters.slots.some((s) => slotKey(s) === key)
      ? filters.slots.filter((s) => slotKey(s) !== key)
      : [...filters.slots, slot];
    onChange({ ...filters, slots: next });
  };

  const clearAll = () =>
    onChange({ serviceTypes: [], minPrice: null, maxPrice: null, slots: [] });

  return (
    <section
      aria-label="Filter listings"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-200">
          <SlidersHorizontal size={16} />
          <h2 className="font-semibold text-sm">Filters</h2>
          {activeCount > 0 && (
            <span className="text-xs bg-indigo-950 text-indigo-400 border border-indigo-800/50 px-2 py-0.5 rounded-full">
              {activeCount} active
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={13} /> Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Service type */}
        <fieldset>
          <legend className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Service type
          </legend>
          <div className="flex flex-wrap gap-2">
            {SERVICE_TYPES.map((type) => {
              const active = filters.serviceTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleService(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                    active
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {SERVICE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Price range */}
        <fieldset>
          <legend className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Price
          </legend>
          <div className="flex items-baseline justify-between text-sm mb-2">
            <span className="text-slate-200 font-medium">
              {formatUsd(Math.min(minValue, maxValue))} – {formatUsd(Math.max(minValue, maxValue))}
            </span>
            {swapped && <span className="text-xs text-amber-400">Range auto-corrected</span>}
          </div>

          <div className="relative h-6 flex items-center">
            <div className="absolute inset-x-0 h-1.5 rounded-full bg-slate-800" />
            <div
              className="absolute h-1.5 rounded-full bg-indigo-500"
              style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 0)}%` }}
            />
            <input
              id={`${sliderId}-min`}
              type="range"
              aria-label="Minimum price"
              min={bounds.min}
              max={bounds.max}
              value={minValue}
              onChange={(e) => onChange({ ...filters, minPrice: Number(e.target.value) })}
              className="range-thumb absolute w-full"
            />
            <input
              id={`${sliderId}-max`}
              type="range"
              aria-label="Maximum price"
              min={bounds.min}
              max={bounds.max}
              value={maxValue}
              onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
              className="range-thumb absolute w-full"
            />
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Listings without a valid price are hidden while a price filter is set.
          </p>
        </fieldset>

        {/* Availability */}
        <fieldset>
          <legend className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Availability
          </legend>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="flex flex-col gap-1">
                <span className="text-[11px] text-center text-slate-500">{day}</span>
                {PERIODS.map((period) => {
                  const slot: AvailabilitySlot = { day, period };
                  const active = filters.slots.some((s) => slotKey(s) === slotKey(slot));
                  return (
                    <button
                      key={period}
                      type="button"
                      aria-pressed={active}
                      aria-label={`${day} ${period}`}
                      onClick={() => toggleSlot(slot)}
                      className={`text-[11px] py-1 rounded border transition-all ${
                        active
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {period}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
