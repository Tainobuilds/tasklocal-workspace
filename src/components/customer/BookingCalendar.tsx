'use client';

import { useMemo } from 'react';

import { PERIOD_HOURS } from '@/lib/sanitize';
import { WEEKDAYS, type CleanListing, type Period, type Weekday } from '@/lib/types';

/** How far ahead a customer may book. */
const HORIZON_DAYS = 60;
/** Grid rows needed to comfortably cover the horizon from the current week's Monday. */
const WEEKS_SHOWN = Math.ceil((HORIZON_DAYS + 7) / 7);

/** `YYYY-MM-DD` in the customer's own timezone. */
function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function weekdayOf(date: Date): Weekday {
  // `getDay()` is 0-indexed from Sunday; WEEKDAYS starts at Monday.
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

export function describeSlot(dateKey: string, period: Period): string {
  const date = new Date(`${dateKey}T${String(PERIOD_HOURS[period]).padStart(2, '0')}:00:00`);
  const day = date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

interface Props {
  listing: CleanListing;
  selectedDate: string | null;
  selectedPeriod: Period | null;
  onSelect: (dateKey: string, period: Period | null) => void;
}

/**
 * A month-style grid that only permits days and times the provider actually
 * published. Days outside the listing's availability — and days in the past —
 * are never selectable.
 */
export default function BookingCalendar({ listing, selectedDate, selectedPeriod, onSelect }: Props) {
  const { days, periodsByWeekday } = useMemo(() => {
    // Which periods the provider offers, per weekday.
    const periodsByWeekday = new Map<Weekday, Period[]>();
    for (const slot of listing.availability) {
      const existing = periodsByWeekday.get(slot.day) ?? [];
      if (!existing.includes(slot.period)) existing.push(slot.period);
      // Keep AM before PM regardless of the order in the source data.
      existing.sort((a, b) => PERIOD_HOURS[a] - PERIOD_HOURS[b]);
      periodsByWeekday.set(slot.day, existing);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = toDateKey(today);

    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);
    const horizonKey = toDateKey(horizon);

    // Start the grid on the Monday of the current week so columns line up.
    const start = new Date(today);
    start.setDate(start.getDate() - ((today.getDay() + 6) % 7));

    const days = Array.from({ length: WEEKS_SHOWN * 7 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const key = toDateKey(date);
      const weekday = weekdayOf(date);
      const periods = periodsByWeekday.get(weekday) ?? [];

      return {
        key,
        dayOfMonth: date.getDate(),
        isPast: key < todayKey,
        isToday: key === todayKey,
        selectable: periods.length > 0 && key >= todayKey && key <= horizonKey,
      };
    });

    return { days, periodsByWeekday };
  }, [listing.availability]);

  const selectedWeekday = selectedDate
    ? weekdayOf(new Date(`${selectedDate}T12:00:00`))
    : null;
  const periodOptions = selectedWeekday ? periodsByWeekday.get(selectedWeekday) ?? [] : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-brand-ink-muted dark:text-slate-400 mb-3">
          Only the days this provider published are selectable.
        </p>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-[11px] text-center text-slate-500 dark:text-slate-500 font-medium py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isSelected = day.key === selectedDate;
            return (
              <button
                key={day.key}
                type="button"
                disabled={!day.selectable}
                aria-pressed={isSelected}
                onClick={() => onSelect(day.key, null)}
                className={`aspect-square rounded-lg text-sm transition-all border ${
                  isSelected
                    ? 'bg-brand-primary border-brand-primary text-white font-semibold'
                    : day.selectable
                      ? 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-brand-primary dark:hover:border-brand-primary'
                      : 'bg-slate-100/60 dark:bg-slate-950/40 border-transparent text-slate-300 dark:text-slate-700 cursor-not-allowed'
                } ${day.isToday && !isSelected ? 'ring-1 ring-slate-400 dark:ring-slate-600' : ''}`}
              >
                {day.dayOfMonth}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-500 font-semibold mb-2">
            Available times
          </p>
          <div className="flex gap-2">
            {periodOptions.map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={selectedPeriod === period}
                onClick={() => onSelect(selectedDate, period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selectedPeriod === period
                    ? 'bg-brand-primary border-brand-primary text-white'
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand-primary dark:hover:border-brand-primary'
                }`}
              >
                {period === 'AM' ? 'Morning (9:00 AM)' : 'Afternoon (2:00 PM)'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
