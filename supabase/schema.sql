-- supabase/schema.sql
create type service_type as enum ('cleaning', 'handyman', 'moving');
create type listing_status as enum ('active', 'flagged', 'removed', 'pending');

create table if not exists listings (
  listing_id text primary key,
  provider_id text,
  title text not null,
  service_type service_type not null,
  description text,
  price numeric check (price >= 0),
  availability jsonb not null default '[]'::jsonb,
  listing_status listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table listings enable row level security;

create policy "Allow anon full access (temporary, pre-auth)"
  on listings for all
  using (true)
  with check (true);

create type booking_status as enum ('confirmed', 'completed', 'cancelled');

create table if not exists bookings (
  booking_id text primary key,
  listing_id text,
  customer_id text,
  scheduled_at timestamptz,
  booking_status booking_status not null default 'confirmed',
  address text,
  payment_intent_id text,
  created_at timestamptz not null default now()
);

alter table bookings enable row level security;

create policy "Allow anon full access (temporary, pre-auth)"
  on bookings for all
  using (true)
  with check (true);
