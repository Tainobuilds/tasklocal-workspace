import { cookies } from 'next/headers';

/**
 * Demo session handling.
 *
 * There are no passwords in the dataset, so "logging in" means selecting an
 * account and storing its id in a cookie. Every action that records data reads
 * the id from here rather than from the request body, so a client cannot
 * attribute a booking, review, or report to somebody else.
 */
export const SESSION_COOKIE = 'tasklocal_customer';

/** One month; long enough that the demo session survives a restart. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function getSessionCustomerId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value?.trim();
  return value && value.length > 0 ? value : null;
}
