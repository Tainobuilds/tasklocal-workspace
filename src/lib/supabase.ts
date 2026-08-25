import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * `null` when Supabase env vars are missing (e.g. a fresh checkout without
 * `.env.local` yet configured) rather than throwing at import time — a throw
 * here would crash every route and server component that imports this module
 * before it even gets a chance to handle the error. Callers are responsible
 * for checking for `null` and degrading (empty data, 503, etc.) instead.
 */
export let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn(
    '[tasklocal] Supabase env vars are missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) — Supabase-backed features are disabled.',
  );
}
