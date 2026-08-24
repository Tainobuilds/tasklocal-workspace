import { NextResponse } from 'next/server';

import { getCustomers, getSessionCustomer } from '@/lib/server-data';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

/** Who is signed in, for chrome that renders on the client. */
export async function GET() {
  const customer = await getSessionCustomer();
  return NextResponse.json({ customer });
}

/** Logs in as a customer account. There are no passwords in this dataset. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const customerId = body && typeof body.customer_id === 'string' ? body.customer_id.trim() : '';
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required.' }, { status: 400 });
    }

    // Only real accounts may be assumed, so a typed id cannot invent a customer.
    const customers = await getCustomers();
    const customer = customers.find((item) => item.customer_id === customerId);
    if (!customer) {
      return NextResponse.json({ error: 'No such customer account.' }, { status: 404 });
    }

    const response = NextResponse.json({ success: true, customer });
    response.cookies.set(SESSION_COOKIE, customer.customer_id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    console.error('[tasklocal] Login failed:', error);
    return NextResponse.json({ error: 'Could not sign in.' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
