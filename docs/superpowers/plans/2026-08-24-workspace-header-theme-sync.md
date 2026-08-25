# Unified Workspace Header, Theme System, and Real-Time Listing Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One identical header/theme system across Provider App, Matching Chatbot, and Customer Browse, with a working light/dark toggle and listings that sync live from Provider App to the customer-facing views.

**Architecture:** A new `WorkspaceHeader.tsx` replaces the ad-hoc header in `page.tsx` and the `SiteHeader` on `/browse` only (nowhere else). `next-themes` adds class-based dark mode, togglable from that header. A new `/api/catalogue` route exposes the existing server-only `getCatalogue()` validator for client polling, which the Chatbot and Browse both adopt (replacing/augmenting their current data sources) on the same 10s interval the Provider Dashboard already uses.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, `next-themes` (new dependency), TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-24-workspace-header-theme-sync-design.md`

**Verification approach:** This repo has no automated test framework (`package.json` has no test script, no Jest/Vitest/RTL). Steps that would normally be "write a failing test" are instead "verify via `npx tsc --noEmit` / `npx next build`" (compile-time correctness) plus a manual browser check (behavioral correctness), matching how every prior change in this codebase has actually been verified. Use the Browser pane / preview tools for the manual checks — do not ask the human to check manually.

## Global Constraints

- Only `page.tsx` (Provider + Chatbot) and `browse/page.tsx` get the new `WorkspaceHeader`. `bookings`, `login`, `/listings/[id]`, `/providers/[id]` keep `SiteHeader` untouched. Trust & Safety keeps its own separate header untouched.
- No new push infrastructure (SSE/WebSocket) — sync is polling only, 10s interval, matching the existing Provider Dashboard pattern.
- Teal (`teal-600` family) is the only accent color in both themes, everywhere touched by this plan — including replacing the customer side's existing `indigo-*` accent.
- Theme default is light, persisted via `next-themes`' own `localStorage` handling — no custom persistence code.
- The Activity & Bookings button always renders in the same position with the same look on every view; only its click target differs (drawer vs. `/bookings` link), per the approved tweak.

---

## Task 1: Enable class-based dark mode infrastructure

**Files:**
- Modify: `package.json` (add `next-themes`)
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: a `.dark` class on `<html>` that all later tasks' `dark:` utility classes respond to, toggled via `next-themes`' `useTheme()` hook (used starting Task 4).

- [ ] **Step 1: Install next-themes**

```bash
cd ~/tasklocal-provider-chatbot && npm install next-themes
```

- [ ] **Step 2: Enable the class-based dark variant in Tailwind**

In `src/app/globals.css`, add this line immediately after `@import "tailwindcss";` (before the `:root` block):

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
```

- [ ] **Step 3: Wrap the root layout in ThemeProvider**

Replace the full contents of `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TaskLocal Workspace",
  description: "Book trusted local cleaning, handyman, and moving services.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` is required on `<html>` because `next-themes` sets the class attribute via an inline script that runs before React hydrates — without it, React logs a spurious hydration-mismatch warning on every page load.

- [ ] **Step 4: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Verify no hydration warnings in the browser**

Start/open the dev server, navigate to `http://localhost:3000`, and check the browser console for errors (there is no toggle UI yet — this step only confirms `ThemeProvider` mounts cleanly).
Expected: zero console errors, page renders exactly as before (still light, unchanged look — no visual difference expected yet).

- [ ] **Step 6: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add package.json package-lock.json src/app/layout.tsx src/app/globals.css && git commit -m "Add next-themes and enable class-based dark mode"
```

---

## Task 2: Create the `/api/catalogue` route

**Files:**
- Create: `src/app/api/catalogue/route.ts`

**Interfaces:**
- Consumes: `getCatalogue()` from `@/lib/server-data` — `() => Promise<ListingsResult>` where `ListingsResult = { listings: CleanListing[]; issues: DataIssue[] }` (existing, unchanged).
- Produces: `GET /api/catalogue` → JSON `CleanListing[]` (active-only, deduplicated, validated). Consumed by Task 6 (Chatbot) and Task 7 (Browse polling).

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from 'next/server';

import { getCatalogue } from '@/lib/server-data';

/**
 * The same validated, active-only listing catalogue Browse renders
 * server-side, exposed for client-side polling. Unlike /api/listings, this
 * never returns a flagged/removed/pending listing.
 */
export async function GET() {
  const { listings } = await getCatalogue();
  return NextResponse.json(listings);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify the endpoint returns active-only data**

With the dev server running:
```bash
curl -s http://localhost:3000/api/catalogue | python3 -m json.tool | head -60
```
Expected: a JSON array of listings. Confirm none have `listing_id` matching the known flagged/removed/pending test fixtures currently in `data/listings.json` (the "Duplicate Listing Test", "2-Person Furniture Move", "Weekend Moving Help" entries) — they must be absent, unlike `/api/listings` which includes them.

- [ ] **Step 4: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/app/api/catalogue/route.ts && git commit -m "Add /api/catalogue endpoint for client-side polling"
```

---

## Task 3: Fix the create-listing schema so new listings pass catalogue validation

**Files:**
- Modify: `src/components/ProviderDashboard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `ProviderDashboard`'s `onCreateListing` prop now receives `{ title: string; service_type: string; price: string; description: string }` (was `{ title, category, price, description }`).
- Produces: `createListing` in `page.tsx` now POSTs `{ listing_id, title, service_type, price_per_hour, description, listing_status: 'active' }` (was `{ id, title, category, price_per_hour, description }`), so it satisfies `sanitizeListings()` in `@/lib/sanitize` and appears in `getCatalogue()`.

- [ ] **Step 1: Change the form's Category field to a constrained dropdown**

In `src/components/ProviderDashboard.tsx`, import the enum and rename the field throughout:

```tsx
import { useState } from 'react';
import { Plus, PackageSearch, X, Loader2, Layers, DollarSign, Gauge } from 'lucide-react';
import { SERVICE_TYPES } from '@/lib/types';
```

Replace:
```tsx
const EMPTY_FORM = { title: '', category: '', price: '', description: '' };
```
with:
```tsx
const EMPTY_FORM = { title: '', service_type: '', price: '', description: '' };
```

Replace `if (formData.category.trim()) score += 20;` in `getListingStrength` with:
```tsx
  if (formData.service_type.trim()) score += 20;
```

Replace the `Props` interface's `onCreateListing` signature:
```tsx
interface Props {
  listings: any[];
  bookings: any[];
  onCreateListing: (formData: { title: string; service_type: string; price: string; description: string }) => Promise<boolean>;
}
```

Replace the Category `<input>` in the modal form:
```tsx
<div>
  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
  <input
    type="text"
    value={formData.category}
    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
    placeholder="e.g., Cleaning"
    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
  />
</div>
```
with:
```tsx
<div>
  <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
  <select
    value={formData.service_type}
    onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
    className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500"
  >
    <option value="">Select a category</option>
    {SERVICE_TYPES.map((type) => (
      <option key={type} value={type}>
        {type[0].toUpperCase() + type.slice(1)}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 2: Correct the POST payload in `page.tsx`**

In `src/app/page.tsx`, replace:
```tsx
  const createListing = async (formData: { title: string; category: string; price: string; description: string }) => {
    const newEntry = {
      id: `list-${Date.now()}`,
      title: formData.title,
      category: formData.category || 'General',
      price_per_hour: Number(formData.price) || 0,
      description: formData.description || 'No description provided.'
    };

    // Optimistic update so both views react instantly, reconciled below.
    setListings((prev) => [...prev, newEntry]);

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });

      if (!res.ok) throw new Error('Failed to save new listing');

      await fetchListings();
      showToast('Workspace updated: New service now available in Chatbot!');
      return true;
    } catch (err) {
      console.error(err);
      setListings((prev) => prev.filter((item) => item.id !== newEntry.id));
      return false;
    }
  };
```
with:
```tsx
  const createListing = async (formData: { title: string; service_type: string; price: string; description: string }) => {
    const newEntry = {
      listing_id: `list-${Date.now()}`,
      title: formData.title,
      service_type: formData.service_type,
      price_per_hour: Number(formData.price) || 0,
      description: formData.description || 'No description provided.',
      listing_status: 'active'
    };

    // Optimistic update so both views react instantly, reconciled below.
    setListings((prev) => [...prev, newEntry]);

    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry)
      });

      if (!res.ok) throw new Error('Failed to save new listing');

      await fetchListings();
      showToast('Workspace updated: New service now available in Chatbot!');
      return true;
    } catch (err) {
      console.error(err);
      setListings((prev) => prev.filter((item) => item.listing_id !== newEntry.listing_id));
      return false;
    }
  };
```

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify a created listing reaches the catalogue**

With the dev server running, open the Provider Dashboard, click "New Listing", fill in a title, pick a Category from the dropdown, set a price, submit. Then:
```bash
curl -s http://localhost:3000/api/catalogue | python3 -m json.tool | grep -A5 "<the title you entered>"
```
Expected: the new listing appears in the `/api/catalogue` response with the correct `service_type`.

- [ ] **Step 5: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/components/ProviderDashboard.tsx src/app/page.tsx && git commit -m "Fix create-listing payload to satisfy catalogue validation"
```

---

## Task 4: Build WorkspaceHeader.tsx and wire it into page.tsx

**Files:**
- Create: `src/components/WorkspaceHeader.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `WorkspaceHeader` component with props:
  ```ts
  interface WorkspaceHeaderProps {
    active: 'provider' | 'chatbot' | 'customer';
    onSelectWorkspaceTab?: (tab: 'provider' | 'chatbot') => void;
    bookingsBadgeCount: number;
    onOpenBookings?: () => void;
    bookingsHref?: string;
  }
  ```
- Consumes (Task 5, 7): reused as-is on `browse/page.tsx`.

- [ ] **Step 1: Write WorkspaceHeader.tsx**

```tsx
'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Store, MessageSquare, Search, Moon, Sun, ClipboardList } from 'lucide-react';

interface Props {
  active: 'provider' | 'chatbot' | 'customer';
  /** Provided by page.tsx, which switches tabs in place; browse omits it so tabs navigate instead. */
  onSelectWorkspaceTab?: (tab: 'provider' | 'chatbot') => void;
  bookingsBadgeCount: number;
  /** Provider/Chatbot: opens the local ledger drawer. */
  onOpenBookings?: () => void;
  /** Browse: links to the customer's real bookings page instead. */
  bookingsHref?: string;
}

const TABS: Array<{ id: 'provider' | 'chatbot' | 'customer'; label: string; icon: typeof Store; href: string }> = [
  { id: 'provider', label: 'Provider App', icon: Store, href: '/' },
  { id: 'chatbot', label: 'Matching Chatbot', icon: MessageSquare, href: '/?tab=chatbot' },
  { id: 'customer', label: 'Customer App', icon: Search, href: '/browse' },
];

export default function WorkspaceHeader({ active, onSelectWorkspaceTab, bookingsBadgeCount, onOpenBookings, bookingsHref }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  // Avoids a light/dark icon flash before next-themes reports the real value on mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="border-b border-slate-200 dark:border-slate-800 backdrop-blur-md bg-white/80 dark:bg-slate-900/80 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4 flex-wrap">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-white">TL</div>
          <span className="font-semibold text-lg tracking-tight text-slate-900 dark:text-slate-100 hidden sm:inline">
            TaskLocal Workspace
          </span>
        </Link>

        <nav className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
          {TABS.map(({ id, label, icon: Icon, href }) => {
            const isActive = active === id;
            const className = `flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-teal-600 text-white shadow-md'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`;

            // page.tsx passes onSelectWorkspaceTab and owns provider/chatbot as local
            // tab state; browse doesn't, so provider/chatbot become plain navigation.
            if (onSelectWorkspaceTab && id !== 'customer') {
              return (
                <button key={id} type="button" onClick={() => onSelectWorkspaceTab(id)} className={className}>
                  <Icon size={16} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              );
            }

            return (
              <Link key={id} href={href} className={className}>
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle light/dark theme"
            className="flex items-center justify-center h-9 w-9 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {mounted && resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {onOpenBookings ? (
            <button
              type="button"
              onClick={onOpenBookings}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <ClipboardList size={14} /> Activity & Bookings
              {bookingsBadgeCount > 0 && (
                <span className="text-[10px] font-semibold bg-teal-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookingsBadgeCount}
                </span>
              )}
            </button>
          ) : (
            <Link
              href={bookingsHref ?? '/bookings'}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <ClipboardList size={14} /> Activity & Bookings
              {bookingsBadgeCount > 0 && (
                <span className="text-[10px] font-semibold bg-teal-600 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {bookingsBadgeCount}
                </span>
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Wire it into page.tsx**

In `src/app/page.tsx`, add the import:
```tsx
import WorkspaceHeader from '@/components/WorkspaceHeader';
```

Replace the entire `<header>...</header>` block (the one starting `<header className="border-b border-slate-200 backdrop-blur-md bg-white/80 sticky top-0 z-50">` and ending at its matching `</header>`, immediately before `<main`) with:

```tsx
      <WorkspaceHeader
        active={activeTab}
        onSelectWorkspaceTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'chatbot') setNewServiceCount(0);
        }}
        bookingsBadgeCount={bookings.length}
        onOpenBookings={() => setIsBookingsDrawerOpen(true)}
      />
```

This removes the old inline header, its "Active Services"/"AI Match Rate" pills, the old tab buttons, the old "Activity & Bookings" button, and the old Browse/Sign in/Trust & Safety links block added earlier this session — all superseded by `WorkspaceHeader`. The bookings drawer itself (the sliding `<div>` panel with `isBookingsDrawerOpen`) stays exactly as-is; only its trigger button moved into the shared header. The "+N New" glow badge on the chatbot tab (`newServiceCount`) is dropped — `WorkspaceHeader`'s tabs don't carry per-tab badges by design (identical header everywhere), and the toast notification already communicates new services.

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors. Removing the old header also removes the only usages of `Store`, `MessageSquare`, `Sparkles`, `Search`, `ShieldCheck`, and `LogIn` from `page.tsx` (they were the tab icons, the "AI Match Rate" pill icon, and the Browse/Sign in/Trust & Safety link icons). `X`, `CheckCircle`, `ClipboardList`, and `Inbox` are still used further down by the toast and the bookings drawer. Update the import line to:
```tsx
import { X, CheckCircle, ClipboardList, Inbox } from 'lucide-react';
```

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:3000`. Confirm: the new header renders, Provider App/Matching Chatbot tabs switch views without navigation, the theme toggle button is visible and clicking it flips the page dark (and back), and clicking "Activity & Bookings" opens the existing drawer.

- [ ] **Step 5: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/components/WorkspaceHeader.tsx src/app/page.tsx && git commit -m "Add WorkspaceHeader and wire it into the Provider/Chatbot page"
```

---

## Task 5: Wire WorkspaceHeader into browse/page.tsx

**Files:**
- Modify: `src/app/browse/page.tsx`

**Interfaces:**
- Consumes: `WorkspaceHeader` from Task 4 (no `onSelectWorkspaceTab` passed, so its tabs render as navigation links), `getCustomerBookings(customerId: string): Promise<BookingsResult>` from `@/lib/server-data` (existing).

- [ ] **Step 1: Replace SiteHeader with WorkspaceHeader and fetch the booking count**

Replace the full contents of `src/app/browse/page.tsx` with:

```tsx
import type { Metadata } from 'next';

import CustomerApp from '@/components/customer/CustomerApp';
import CustomerNav from '@/components/customer/CustomerNav';
import WorkspaceHeader from '@/components/WorkspaceHeader';
import { getCatalogue, getCustomerBookings, getSessionCustomer } from '@/lib/server-data';

export const metadata: Metadata = {
  title: 'Find a service · TaskLocal',
  description: 'Browse and book local cleaning, handyman, and moving services.',
};

export const dynamic = 'force-dynamic';

/**
 * Validation runs on the server so rejected records are logged where they can
 * be reviewed, and the browser only ever receives render-safe listings.
 */
export default async function BrowsePage() {
  const [{ listings }, customer] = await Promise.all([getCatalogue(), getSessionCustomer()]);
  const { bookings } = customer ? await getCustomerBookings(customer.customer_id) : { bookings: [] };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      <WorkspaceHeader active="customer" bookingsBadgeCount={bookings.length} bookingsHref="/bookings" />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <CustomerNav active="browse" />
        <CustomerApp
          listings={listings}
          defaultAddress={customer?.default_address ?? null}
          signedIn={customer !== null}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify in the browser**

Navigate to `http://localhost:3000/browse`. Confirm: the header is visually identical to the one on `/` (same component), "Customer App" tab is highlighted active, "Provider App"/"Matching Chatbot" tabs navigate to `/` (and `/?tab=chatbot`) instead of switching in place, and "Activity & Bookings" navigates to `/bookings` rather than opening a drawer.

- [ ] **Step 4: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/app/browse/page.tsx && git commit -m "Use WorkspaceHeader on the Browse page"
```

---

## Task 6: Switch Matching Chatbot to the catalogue feed with polling

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/MatchingChatbot.tsx`

**Interfaces:**
- Produces (page.tsx): a second state, `catalogueListings: any[]`, polled from `/api/catalogue` every 10s, passed to `MatchingChatbot` in place of the provider-wide `listings` state.
- `MatchingChatbot`'s `listings` prop now receives `CleanListing`-shaped objects (`service_type`, `price: number | null`, `listing_id`) instead of the raw `/api/listings` shape — its internal field-fallback chains are updated to read both.

- [ ] **Step 1: Add a polled catalogue state to page.tsx**

In `src/app/page.tsx`, near the existing `listings`/`fetchListings` state (after the `knownListingsCountRef`/`activeTabRef` declarations), add:

```tsx
  const [catalogueListings, setCatalogueListings] = useState<any[]>([]);
```

Add a new effect alongside the existing polling effect (after the `pollForNewListings` effect block), so it runs independently on its own 10s cycle:

```tsx
  // Matching Chatbot searches the same active-only, validated catalogue Browse
  // uses — not the full provider feed, so it can never surface a flagged or
  // removed listing to a customer.
  useEffect(() => {
    const fetchCatalogue = async () => {
      try {
        const res = await fetch('/api/catalogue');
        const data = await res.json();
        setCatalogueListings(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    };

    fetchCatalogue();
    const interval = setInterval(fetchCatalogue, 10000);
    return () => clearInterval(interval);
  }, []);
```

Change the `MatchingChatbot` render call from:
```tsx
            <MatchingChatbot listings={listings} onBookingConfirmed={addBooking} />
```
to:
```tsx
            <MatchingChatbot listings={catalogueListings} onBookingConfirmed={addBooking} />
```

- [ ] **Step 2: Fix MatchingChatbot's field-fallback chains for the catalogue shape**

In `src/components/MatchingChatbot.tsx`, `CleanListing` objects have `service_type` (not `category`/`type`) and `listing_id` (not `id`). Update every fallback chain that reads those fields so it checks the catalogue field first, keeping the old fallbacks for safety:

Line with `const seed = hashString(String(item.id || item.title || item.name || 'service'));` and its three siblings (`-rt`, `-verified`, `-avail` variants) — change `item.id` to `item.listing_id || item.id` in all four:
```tsx
const seed = hashString(String(item.listing_id || item.id || item.title || item.name || 'service'));
```
(apply the same `item.listing_id || item.id` substitution to the other three hash-seed lines, keeping each line's own suffix string unchanged).

Line `const cat = item.category || item.type || '';` — change to:
```tsx
          const cat = item.category || item.service_type || item.type || '';
```

Line `category: bookingListing?.category || bookingListing?.type || 'General',` — change to:
```tsx
        category: bookingListing?.category || bookingListing?.service_type || bookingListing?.type || 'General',
```

Line `{item.category || 'General'}` (inside the results-list render) — change to:
```tsx
                              {item.category || item.service_type || 'General'}
```

Do not change the price fallback chains (`item.price_per_hour || item.price || item.rate || 0`) — `CleanListing.price` already satisfies these via the existing `.price` fallback.

- [ ] **Step 3: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:3000`, switch to the Matching Chatbot tab, search for "cleaning" (or click the Cleaning quick-search chip). Confirm results show real titles/categories/prices (not blank/undefined). Then check that the flagged "2-Person Furniture Move" and the removed "Duplicate Listing Test" fixtures are never returned by a "moving"/"handyman" search — only the active-status seed listings should match.

- [ ] **Step 5: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/app/page.tsx src/components/MatchingChatbot.tsx && git commit -m "Point Matching Chatbot at the polled active-only catalogue"
```

---

## Task 7: Add client-side polling to Browse

**Files:**
- Modify: `src/components/customer/CustomerApp.tsx`

**Interfaces:**
- `CustomerApp`'s `listings` prop is now treated as the *initial* value only; the component seeds its own state from it and refreshes from `/api/catalogue` every 10s. Its public props interface is unchanged.

- [ ] **Step 1: Seed local state from the prop and poll for updates**

In `src/components/customer/CustomerApp.tsx`, add `useEffect` to the existing import:
```tsx
import { useEffect, useMemo, useState } from 'react';
```

Replace:
```tsx
export default function CustomerApp({ listings, defaultAddress, signedIn }: Props) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [booking, setBooking] = useState<CleanListing | null>(null);
```
with:
```tsx
export default function CustomerApp({ listings: initialListings, defaultAddress, signedIn }: Props) {
  const [listings, setListings] = useState<CleanListing[]>(initialListings);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [booking, setBooking] = useState<CleanListing | null>(null);

  // Keeps the customer catalogue live: a listing created in the Provider App
  // shows up here without a manual reload, on the same cadence the Provider
  // Dashboard already polls at.
  useEffect(() => {
    const fetchCatalogue = async () => {
      try {
        const res = await fetch('/api/catalogue');
        const data = await res.json();
        if (Array.isArray(data)) setListings(data);
      } catch (err) {
        console.error('[tasklocal] Could not refresh the catalogue:', err);
      }
    };

    const interval = setInterval(fetchCatalogue, 10000);
    return () => clearInterval(interval);
  }, []);
```

Everything below this (the `bounds`/`visible`/filtering `useMemo` blocks and the JSX) already reads from the `listings` variable, which now refers to local state instead of the prop directly — no further changes needed in the rest of the file.

- [ ] **Step 2: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Verify end-to-end sync**

Open two browser tabs: `http://localhost:3000` (Provider App) and `http://localhost:3000/browse`. In the Provider tab, create a new listing (Task 3's dropdown form). Without reloading the Browse tab, wait up to 10 seconds and confirm the new listing's card appears in the grid.

- [ ] **Step 4: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/components/customer/CustomerApp.tsx && git commit -m "Poll /api/catalogue on Browse so new listings appear live"
```

---

## Task 8: Dark-mode class pass — Provider side

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ProviderDashboard.tsx`
- Modify: `src/components/MatchingChatbot.tsx`

These three files are currently light-only. Add the paired `dark:` class to every color utility, using this mapping consistently (this table is also used by Task 9, applied in the opposite direction):

| Purpose | Light (existing) | Add |
|---|---|---|
| Page background | `bg-slate-50` | `dark:bg-slate-950` |
| Card/panel background | `bg-white` | `dark:bg-slate-900` |
| Primary text | `text-slate-900` | `dark:text-slate-100` |
| Secondary text | `text-slate-600` | `dark:text-slate-400` |
| Muted text | `text-slate-500` | `dark:text-slate-500` (unchanged — already neutral enough) |
| Borders | `border-slate-200` | `dark:border-slate-800` |
| Subtle fill (pills, inputs, hover bg) | `bg-slate-100` | `dark:bg-slate-800` |
| Hover subtle fill | `hover:bg-slate-200` | `dark:hover:bg-slate-700` |
| Accent (unchanged both themes) | `bg-teal-600` / `text-teal-600` / `border-teal-*` | *(no dark variant needed — teal stays identical)* |

- [ ] **Step 1: Apply the mapping to `src/app/page.tsx`**

Every remaining hardcoded light class in the file (the toast, the bookings drawer, its empty state, its booking-card rows) gets its paired `dark:` class from the table above. Worked example — the toast:
```tsx
      {toast && (
        <div className="fixed top-20 right-6 z-[60] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800 shadow-lg text-sm text-slate-900 dark:text-slate-100 px-4 py-3 rounded-xl max-w-xs">
            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}
```
Apply the same pattern (light class kept, matching `dark:` class from the table appended) to the drawer overlay, drawer panel, drawer header, empty-state icon circle, and each booking row's `bg-slate-50 border-slate-200` card — using `bg-slate-800`/`border-slate-800` as their dark pairing per the table.

- [ ] **Step 2: Apply the mapping to `src/components/ProviderDashboard.tsx`**

Worked example — the page header and New Listing button area (button itself uses only `bg-teal-600`, no dark variant needed per the table):
```tsx
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Provider Dashboard</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">Manage active local listings and services</p>
        </div>
```
Worked example — a metric card:
```tsx
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center gap-3">
```
Apply the same pattern to every metric card, the empty state, each listing card (`bg-white border-slate-200` → add `dark:bg-slate-900 dark:border-slate-800`), the category/status badge backgrounds (`bg-slate-100 border-slate-200` → add `dark:bg-slate-800 dark:border-slate-700`), and the modal (`bg-white` → add `dark:bg-slate-900`, its inputs' `bg-white border-slate-200 text-slate-900` → add `dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100`). Leave the Flagged/Removed/Pending status badge colors (`amber-*`/`red-*`) and the emerald price color as-is in both themes — they're semantic, not the light/dark palette.

- [ ] **Step 3: Apply the mapping to `src/components/MatchingChatbot.tsx`**

Same pattern: the chat panel background/border, message bubbles, quick-search chip bar, and input field all get their `dark:` pairing from the table. Worked example — the chat panel container:
```tsx
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[600px]">
```
Apply the same substitution throughout the rest of the file's light-only classes.

- [ ] **Step 4: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Verify in the browser**

On `http://localhost:3000`, click the theme toggle. Confirm the Provider Dashboard, the bookings drawer, and the Matching Chatbot all switch to dark and back with no unstyled (still-light) patches, and teal remains the accent in both.

- [ ] **Step 6: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/app/page.tsx src/components/ProviderDashboard.tsx src/components/MatchingChatbot.tsx && git commit -m "Add dark-mode variants to the Provider Dashboard and Matching Chatbot"
```

---

## Task 9: Dark-mode class pass — Customer side, plus indigo-to-teal accent swap

**Files:**
- Modify: `src/app/browse/page.tsx`
- Modify: `src/components/customer/CustomerApp.tsx`
- Modify: `src/components/customer/FilterBar.tsx`
- Modify: `src/components/customer/ListingCard.tsx`

These four files are currently dark-only, using `indigo-*` as their accent. Apply the Task 8 mapping table **in reverse** (their current dark classes become the `dark:` variant; add the light-mode base), and separately replace every `indigo-*` class with the matching `teal-*` shade (`indigo-600`→`teal-600`, `indigo-500`→`teal-500`, `indigo-400`→`teal-400`, `indigo-950`→`teal-950` or `teal-50` for light-mode badge backgrounds, `indigo-800`→`teal-800` or `teal-200` for light-mode borders — pick the light-mode shade that keeps the same visual weight the existing light components already established, e.g. badges elsewhere in this app use `bg-teal-50 border-teal-200 text-teal-700` in light mode).

- [ ] **Step 1: `src/app/browse/page.tsx`**

Already done in Task 5 (`bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100` on the wrapper `div`) — no further change needed here.

- [ ] **Step 2: `src/components/customer/CustomerApp.tsx`**

Worked example — the page intro:
```tsx
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Find a service</h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm">
          Browse verified local providers and book in a few steps.
        </p>
      </div>
```
Worked example — the empty state and its accent link:
```tsx
      {visible.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
          <SearchX size={28} className="text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-700 dark:text-slate-300 font-medium">No listings match these filters</p>
          <p className="text-sm text-slate-500 mt-1">
            Try widening the price range or selecting more availability.
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="mt-4 text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
```
Apply the same pattern to the listing-count row (`text-slate-500` variants) and the `failed` filter-error banner (`text-amber-400 bg-amber-950/40 border-amber-800/60` → add light equivalents `text-amber-700 bg-amber-50 border-amber-200` as the base, keep the existing dark classes as `dark:`).

- [ ] **Step 3: `src/components/customer/FilterBar.tsx`**

Worked example — the panel container and header:
```tsx
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 mb-6"
```
```tsx
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
```
```tsx
          <h2 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Filters</h2>
            <span className="text-xs bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 px-2 py-0.5 rounded-full">
```
Apply the same substitutions to: the price-range track (`bg-slate-800` → add `bg-slate-100 dark:bg-slate-800`, and its filled portion `bg-indigo-500` → `bg-teal-500` with no light/dark split needed since teal is theme-invariant), the day/period availability grid cells, and the "Range auto-corrected" amber note (`text-amber-400` → base `text-amber-700 dark:text-amber-400`).

- [ ] **Step 4: `src/components/customer/ListingCard.tsx`**

Worked example — the card container and category badge:
```tsx
      className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-3 hover:border-slate-300 dark:hover:border-slate-600 transition-all focus:outline-none focus-visible:border-teal-500"
```
```tsx
        <span className="text-xs font-semibold uppercase tracking-wider bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800/50 px-2.5 py-0.5 rounded-full whitespace-nowrap">
```
```tsx
        <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 leading-snug group-hover:text-slate-950 dark:group-hover:text-white">
```
Apply the same pattern to the provider-name/description text (`text-slate-400`→ add `text-slate-600 dark:text-slate-400`), the availability chip (`bg-slate-950 border-slate-800 text-slate-300` → add light base `bg-slate-50 border-slate-200 text-slate-600`), and the Book button — `bg-indigo-600 hover:bg-indigo-500` becomes `bg-teal-600 hover:bg-teal-700` (no dark variant needed, matching the rest of the app's teal button convention), while its `disabled:bg-slate-800 disabled:text-slate-500` gets a light base added: `disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500`.

- [ ] **Step 5: Verify it compiles**

```bash
cd ~/tasklocal-provider-chatbot && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Verify in the browser**

On `http://localhost:3000/browse`, confirm the page renders in light mode by default (white background, teal accents, not indigo), toggling the header's theme button switches it to dark and preserves the same look these pages had before this plan (slate-950 background), and the accent color is teal in both modes — no indigo remaining anywhere on this page.

- [ ] **Step 7: Commit**

```bash
cd ~/tasklocal-provider-chatbot && git add src/app/browse/page.tsx src/components/customer/CustomerApp.tsx src/components/customer/FilterBar.tsx src/components/customer/ListingCard.tsx && git commit -m "Add light-mode variants to Browse and swap its accent from indigo to teal"
```

---

## Task 10: End-to-end verification

**Files:** none (verification only; fix forward in the relevant file from Tasks 1-9 if something fails)

- [ ] **Step 1: Full production build**

```bash
cd ~/tasklocal-provider-chatbot && npx next build
```
Expected: all routes compile with zero errors, matching the route list from earlier in this project (`/`, `/browse`, `/bookings`, `/login`, `/listings/[listingId]`, `/providers/[providerId]`, `/internal/trust-safety`, plus the API routes including the new `/api/catalogue`).

- [ ] **Step 2: Header identity check**

In the browser, compare the header on `/`, `/?tab=chatbot`, and `/browse` — confirm it is the same component (identical logo, tab order, toggle position, Activity & Bookings button position) on all three, per the spec's "completely identical" requirement.

- [ ] **Step 3: Theme toggle consistency check**

Toggle dark mode while on `/`. Navigate to `/browse` (a full route change). Confirm the dark choice persisted (next-themes' localStorage). Toggle back to light on `/browse`, navigate back to `/`, confirm it's light there too.

- [ ] **Step 4: Live sync check**

Repeat Task 7 Step 3's two-tab check, but this time also confirm the new listing is findable via the Matching Chatbot's search within the same 10s window (Task 6), not just visible on Browse.

- [ ] **Step 5: Data-quality boundary check**

Confirm the flagged/removed/pending test fixtures (from `data/listings.json`) still show with status badges on the Provider Dashboard (existing behavior from earlier this session, unchanged by this plan), but do not appear on `/browse` and are not returned by a Chatbot search — the two feeds (`/api/listings` vs `/api/catalogue`) diverge exactly as designed.

- [ ] **Step 6: Activity & Bookings behavior check**

On `/`, click "Activity & Bookings" — confirm the ledger drawer opens. On `/browse`, click "Activity & Bookings" — confirm it navigates to `/bookings` instead.

- [ ] **Step 7: Regression check on untouched pages**

Visit `/login`, `/bookings`, a listing detail page, a provider detail page, and `/internal/trust-safety`. Confirm all five still use their original `SiteHeader`/internal header and original dark-only styling, completely unaffected by this plan (per the spec's explicit non-goals).

- [ ] **Step 8: Final commit (only if Steps 1-7 required fixes)**

If any check above required a fix, commit it with a message describing what broke and the fix — otherwise no commit needed for this task.
