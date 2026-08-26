import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Provider Dashboard · Spruce',
  description: 'Manage listings, bookings, and the AI matching chatbot.',
};

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
