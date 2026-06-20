/**
 * Payload doğrulama — birim testleri
 * Çalıştırma: npm test  (node --test, tsx loader ile)
 *
 * Bu testler whitelist/aralık/tip zorlamasının güvenlik ağıdır: gizlilik
 * garantisi (fazladan alanların düşmesi) ve sınır kontrolleri burada korunur.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTypingWindow } from "./validation";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    mean_flight_ms: 120,
    median_flight_ms: 110,
    p95_flight_ms: 250,
    backspace_percentage: 6,
    total_samples: 80,
    active_typing_seconds: 150,
    pause_ratio: 0.2,
    window_started_at: "2026-06-20T10:00:00.000Z",
    window_ended_at: "2026-06-20T10:03:00.000Z",
    local_hour: 13,
    ...overrides,
  };
}

test("geçerli payload doğrulamadan geçer", () => {
  const { data, errors } = validateTypingWindow(validBody());
  assert.equal(errors, null);
  assert.ok(data);
  assert.equal(data!.mean_flight_ms, 120);
  assert.equal(data!.local_hour, 13);
});

test("whitelist: beklenmeyen alanlar (ham veri) sonuçtan düşürülür", () => {
  const { data, errors } = validateTypingWindow(
    validBody({
      raw_keys: ["a", "b", "c"],
      typed_text: "gizli mesaj",
      url: "https://example.com",
    })
  );
  assert.equal(errors, null);
  assert.ok(data);
  const keys = Object.keys(data!);
  assert.ok(!keys.includes("raw_keys"));
  assert.ok(!keys.includes("typed_text"));
  assert.ok(!keys.includes("url"));
});

test("sayısal alan aralık dışıysa hata verir", () => {
  const { data, errors } = validateTypingWindow(
    validBody({ backspace_percentage: 150 })
  );
  assert.equal(data, null);
  assert.ok(errors);
  assert.ok(errors!.some((e) => e.field === "backspace_percentage"));
});

test("sayısal alan eksikse hata verir", () => {
  const body = validBody();
  delete (body as Record<string, unknown>).mean_flight_ms;
  const { data, errors } = validateTypingWindow(body);
  assert.equal(data, null);
  assert.ok(errors!.some((e) => e.field === "mean_flight_ms"));
});

test("sayısal alan string olarak gelirse reddedilir (tip zorlaması)", () => {
  const { data, errors } = validateTypingWindow(
    validBody({ total_samples: "80" })
  );
  assert.equal(data, null);
  assert.ok(errors!.some((e) => e.field === "total_samples"));
});

test("NaN/Infinity reddedilir", () => {
  const { errors: e1 } = validateTypingWindow(
    validBody({ mean_flight_ms: NaN })
  );
  const { errors: e2 } = validateTypingWindow(
    validBody({ p95_flight_ms: Infinity })
  );
  assert.ok(e1!.some((e) => e.field === "mean_flight_ms"));
  assert.ok(e2!.some((e) => e.field === "p95_flight_ms"));
});

test("total_samples ve active_typing_seconds yuvarlanır", () => {
  const { data } = validateTypingWindow(
    validBody({ total_samples: 80.7, active_typing_seconds: 150.4 })
  );
  assert.equal(data!.total_samples, 81);
  assert.equal(data!.active_typing_seconds, 150);
});

test("geçersiz tarih reddedilir", () => {
  const { data, errors } = validateTypingWindow(
    validBody({ window_started_at: "not-a-date" })
  );
  assert.equal(data, null);
  assert.ok(errors!.some((e) => e.field === "window_started_at"));
});

test("local_hour verilmezse window_ended_at'ten türetilir", () => {
  const body = validBody({ window_ended_at: "2026-06-20T22:03:00.000Z" });
  delete (body as Record<string, unknown>).local_hour;
  const { data, errors } = validateTypingWindow(body);
  assert.equal(errors, null);
  // Yerel saate çevrilir; 0-23 aralığında geçerli bir değer olmalı.
  assert.ok(data!.local_hour >= 0 && data!.local_hour <= 23);
});

test("local_hour aralık dışıysa hata verir", () => {
  const { data, errors } = validateTypingWindow(validBody({ local_hour: 25 }));
  assert.equal(data, null);
  assert.ok(errors!.some((e) => e.field === "local_hour"));
});

test("local_hour ondalıksa aşağı yuvarlanır", () => {
  const { data } = validateTypingWindow(validBody({ local_hour: 13.9 }));
  assert.equal(data!.local_hour, 13);
});

test("null/undefined gövde tüm zorunlu alanlar için hata verir", () => {
  const { data, errors } = validateTypingWindow(null);
  assert.equal(data, null);
  assert.ok(errors!.length > 0);
});

test("sınır değerleri (min/max) kabul edilir", () => {
  const { data, errors } = validateTypingWindow(
    validBody({
      backspace_percentage: 0,
      pause_ratio: 1,
      mean_flight_ms: 0,
      total_samples: 0,
    })
  );
  assert.equal(errors, null);
  assert.ok(data);
});
