// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 20 } },
      })
    : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env then restart Vite."
    );
  }
  return supabase;
}