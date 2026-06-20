/**
 * Sunucu tarafı Supabase yardımcıları.
 *
 * GÜVENLİK MODELİ:
 * - API'ye gelen Bearer token Supabase Auth ile doğrulanır.
 * - Veri erişimi, kullanıcının KENDİ JWT'si ile açılan istemci üzerinden
 *   yapılır; böylece tüm sorgular Row Level Security'den geçer ve
 *   kullanıcı bazlı izolasyon veritabanı seviyesinde garanti edilir.
 * - Service role key KULLANILMAZ.
 */
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

/** Kullanıcının JWT'siyle RLS-uyumlu istemci oluşturur. */
export function createUserScopedClient(accessToken: string): SupabaseClient {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

/** Bearer token'ı doğrular; geçersizse null döner. */
export async function authenticateRequest(
  authorizationHeader: string | null
): Promise<{ user: User; supabase: SupabaseClient } | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const supabase = createUserScopedClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return { user: data.user, supabase };
}
