/**
 * Tarayıcı tarafı Supabase istemcisi (Auth + RLS korumalı sorgular).
 * Environment variable yoksa null döner; dashboard demo moduna geçer.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return cached;
}

export function isDemoMode(): boolean {
  return getSupabaseBrowser() === null;
}
