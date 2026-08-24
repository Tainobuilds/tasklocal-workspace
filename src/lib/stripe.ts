import Stripe from 'stripe';

/**
 * Stripe is optional: the app stays fully demoable without keys, and the
 * payment step degrades to a clearly-labelled unconfigured state.
 */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
