'use client';

import { WEEKDAYS } from '@/lib/types';

const PERIODS = ['AM', 'PM'] as const;

interface Props {
  value: string[];
  onChange: (slots: string[]) => void;
}

/**
 * Visual day/period toggle grid for a listing's availability schedule.
 * Emits and consumes the same "Day Period" string format (e.g. "Tue AM")
 * that parseSlot() in sanitize.ts already expects — no transform at save time.
 */
export default function AvailabilitySelector({ value, onChange }: Props) {
  const selected = new Set(value);

  const toggle = (slotKey: string) => {
    const next = new Set(selected);
    if (next.has(slotKey)) {
      next.delete(slotKey);
    } else {
      next.add(slotKey);
    }
    onChange([...next]);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
        Availability Schedule
      </label>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <div key={day} className="flex flex-col items-center gap-1">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{day}</span>
            {PERIODS.map((period) => {
              const slotKey = `${day} ${period}`;
              const isActive = selected.has(slotKey);
              return (
                <button
                  key={slotKey}
                  type="button"
                  onClick={() => toggle(slotKey)}
                  aria-pressed={isActive}
                  className={`w-full text-[11px] font-medium py-1 rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    isActive
                      ? 'bg-teal-600 border-teal-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-teal-400'
                  }`}
                >
                  {period}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {value.length === 0 && (
        <p className="text-[11px] text-slate-500 mt-1.5">No times selected — customers will see "Contact provider for availability."</p>
      )}
    </div>
  );
}
