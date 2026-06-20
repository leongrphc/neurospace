/**
 * Supabase tabanlı rate limiting.
 *
 * Ayrı bir altyapı (Redis/KV) gerektirmez: kullanıcının kendi verisindeki son
 * kayıtların sayısına bakarak karar verir. RLS aktif olduğundan her kullanıcı
 * yalnızca kendi satırlarını sayar.
 *
 * NOT: Bu yaklaşım "yumuşak" bir sınırdır; amacı normal kullanımı (3 dakikada
 * 1 pencere) engellemeden bariz kötüye kullanımı (saniyede onlarca istek)
 * durdurmaktır. Sert garanti gerekiyorsa Redis/KV tabanlı sayaca geçilebilir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitResult {
  allowed: boolean;
  /** Pencere içinde sayılan kayıt adedi. */
  count: number;
  /** İstemciye Retry-After header'ı için saniye cinsinden öneri. */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Sayım yapılacak tablo. */
  table: string;
  /** Kullanıcıyı işaret eden sütun (varsayılan user_id). */
  userColumn?: string;
  /** Zaman damgası sütunu (varsayılan created_at). */
  timeColumn?: string;
  /** Pencere uzunluğu (saniye). */
  windowSeconds: number;
  /** Pencere içinde izin verilen maksimum kayıt sayısı. */
  maxInWindow: number;
}

/**
 * Belirtilen zaman penceresinde kullanıcının kaç kayıt oluşturduğunu sayar ve
 * sınırın aşılıp aşılmadığını döndürür.
 *
 * Sayım hatası durumunda istek ENGELLENMEZ (fail-open): rate limit bir koruma
 * katmanıdır, asıl güvenlik RLS + auth'tadır. Sayım çökerse kullanıcıyı
 * yanlışlıkla kilitlemek yerine isteğe izin veririz.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  const {
    table,
    userColumn = "user_id",
    timeColumn = "created_at",
    windowSeconds,
    maxInWindow,
  } = opts;

  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(userColumn, userId)
    .gte(timeColumn, since);

  if (error || count === null) {
    // fail-open: sayım başarısızsa isteği engelleme.
    return { allowed: true, count: 0, retryAfterSeconds: 0 };
  }

  const allowed = count < maxInWindow;
  return {
    allowed,
    count,
    retryAfterSeconds: allowed ? 0 : windowSeconds,
  };
}
