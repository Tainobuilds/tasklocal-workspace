import Link from 'next/link';
import { CalendarCheck, LayoutGrid } from 'lucide-react';

const LINKS = [
  { id: 'browse', label: 'Browse services', href: '/browse', icon: LayoutGrid },
  { id: 'bookings', label: 'My bookings', href: '/bookings', icon: CalendarCheck },
] as const;

/** Sub-navigation within the customer app: browsing and booking history. */
export default function CustomerNav({ active }: { active: 'browse' | 'bookings' }) {
  return (
    <nav className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
      {LINKS.map(({ id, label, href, icon: Icon }) => {
        const isActive = active === id;
        return (
          <Link
            key={id}
            href={href}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-teal-500 text-slate-900 dark:text-slate-100'
                : 'border-transparent text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon size={15} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
