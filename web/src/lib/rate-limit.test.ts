/**
 * Rate limit — birim testleri
 * Çalıştırma: npm test  (node --test, tsx loader ile)
 *
 * Supabase istemcisi, sayım sonucunu taklit eden küçük bir sahte ile
 * değiştirilir; ağ/DB gerektirmez.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit } from "./rate-limit";
import type { SupabaseClient } from "@supabase/supabase-js";

/** select(...).eq(...).gte(...) zincirini taklit eden sahte istemci. */
function fakeSupabase(result: {
  count: number | null;
  error: unknown;
}): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => Promise.resolve(result),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const opts = {
  table: "typing_windows",
  windowSeconds: 60,
  maxInWindow: 10,
};

test("sınırın altında izin verilir", async () => {
  const sb = fakeSupabase({ count: 3, error: null });
  const r = await checkRateLimit(sb, "u1", opts);
  assert.equal(r.allowed, true);
  assert.equal(r.count, 3);
  assert.equal(r.retryAfterSeconds, 0);
});

test("sınıra eşitse engellenir (count >= max)", async () => {
  const sb = fakeSupabase({ count: 10, error: null });
  const r = await checkRateLimit(sb, "u1", opts);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfterSeconds, 60);
});

test("sınırın üstünde engellenir", async () => {
  const sb = fakeSupabase({ count: 25, error: null });
  const r = await checkRateLimit(sb, "u1", opts);
  assert.equal(r.allowed, false);
});

test("sayım hatasında fail-open (isteğe izin verilir)", async () => {
  const sb = fakeSupabase({ count: null, error: { message: "db down" } });
  const r = await checkRateLimit(sb, "u1", opts);
  assert.equal(r.allowed, true);
  assert.equal(r.count, 0);
});
