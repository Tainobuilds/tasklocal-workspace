/** Shared price maths, so the confirmation screen and the server agree. */

/** TaskLocal's platform fee, applied on top of the provider's flat price. */
export const SERVICE_FEE_RATE = 0.1;

export interface PriceBreakdown {
  price: number;
  serviceFee: number;
  total: number;
}

/** Rounds to whole cents to avoid float drift reaching Stripe. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function priceBreakdown(price: number): PriceBreakdown {
  const serviceFee = toCents(price * SERVICE_FEE_RATE) / 100;
  return { price, serviceFee, total: price + serviceFee };
}

/** Stripe charges in the smallest currency unit. */
export function totalInCents(price: number): number {
  return toCents(priceBreakdown(price).total);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
