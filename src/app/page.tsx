import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles, CalendarClock, Layers, Search, Store } from 'lucide-react';

import SpruceLogo from '@/components/SpruceLogo';

export const metadata: Metadata = {
  title: 'Spruce — The Intelligent Local Services Marketplace',
  description:
    'AI-powered matching connects customers with the right local pro in seconds — transparent pricing, real-time scheduling, and zero guesswork.',
};

const FEATURES: Array<{
  icon: typeof Sparkles;
  tint: 'accent' | 'sage';
  title: string;
  description: string;
}> = [
  {
    icon: Sparkles,
    tint: 'accent',
    title: 'Smart AI Matching',
    description: 'Describe unusual or complex jobs in plain English and match with active local pros instantly.',
  },
  {
    icon: CalendarClock,
    tint: 'sage',
    title: 'Upfront Pricing & Calendar',
    description: 'Transparent hourly rates with a live 60-day calendar and zero hidden fees.',
  },
  {
    icon: Layers,
    tint: 'accent',
    title: 'Two-Sided Platform',
    description: 'Seamless booking and Stripe payments for customers, unified workspace for providers.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-background dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <header className="max-w-6xl mx-auto px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2">
          <SpruceLogo />
          <span className="font-semibold text-lg tracking-tight">Spruce</span>
        </Link>
      </header>

      <main>
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight">
            <span className="text-brand-primary dark:text-emerald-400">Spruce</span> — The{' '}
            <span className="text-brand-accent">Intelligent</span> Local Services Marketplace
          </h1>
          <p className="mt-6 text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Solving local service search friction, pricing ambiguity, and booking hassle with
            AI matching, transparent rates, and instant scheduling.
          </p>
        </section>

        {/* Feature Showcase */}
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, tint, title, description }) => (
              <div
                key={title}
                className="bg-white dark:bg-slate-900 border border-brand-line dark:border-stone-800 rounded-2xl p-6 shadow-spruce-sm"
              >
                <div
                  className={`h-11 w-11 rounded-xl flex items-center justify-center mb-4 ${
                    tint === 'accent'
                      ? 'bg-brand-accent/10 text-brand-accent'
                      : 'bg-brand-sage/25 text-brand-primary dark:text-emerald-400'
                  }`}
                >
                  <Icon size={20} />
                </div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Demo Quick-Start Banner */}
        <section className="bg-brand-primary">
          <div className="max-w-4xl mx-auto px-6 py-14 text-center">
            <p className="text-sm font-medium uppercase tracking-wider text-white/70 mb-4">
              Ready to explore? Pick a path:
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/browse"
                className="flex items-center gap-2 bg-white text-brand-primary px-6 py-3 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Search size={16} /> Explore as Customer
              </Link>
              <Link
                href="/provider"
                className="flex items-center gap-2 border border-white/40 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:-translate-y-0.5 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white"
              >
                <Store size={16} /> View Provider Dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
