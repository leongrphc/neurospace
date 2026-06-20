/**
 * API payload doğrulaması.
 * GÜVENLİK: Beklenmeyen alanlar atılır (whitelist yaklaşımı), tipler ve
 * aralıklar zorlanır. Bu sayede ham tuş listesi gibi fazladan veri
 * gönderilse bile sunucu tarafında ASLA işlenmez/saklanmaz.
 */

import type { IncomingWindow } from "./analysis-engine";

export interface ValidatedWindow extends IncomingWindow {
  p95_flight_ms: number;
  active_typing_seconds: number;
  window_started_at: string;
  window_ended_at: string;
  local_hour: number;
  flight_cv: number;
  backspace_burst_ratio: number;
}

interface ValidationError {
  field: string;
  message: string;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateTypingWindow(
  body: unknown
):
  | { data: ValidatedWindow; errors: null }
  | { data: null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const numField = (
    field: string,
    min: number,
    max: number
  ): number | undefined => {
    const v = b[field];
    if (!isNum(v) || v < min || v > max) {
      errors.push({
        field,
        message: `must be a number between ${min} and ${max}`,
      });
      return undefined;
    }
    return v;
  };

  const mean_flight_ms = numField("mean_flight_ms", 0, 10000);
  const median_flight_ms = numField("median_flight_ms", 0, 10000);
  const p95_flight_ms = numField("p95_flight_ms", 0, 10000);
  const backspace_percentage = numField("backspace_percentage", 0, 100);
  const total_samples = numField("total_samples", 0, 5000);
  const active_typing_seconds = numField("active_typing_seconds", 0, 300);
  const pause_ratio = numField("pause_ratio", 0, 1);

  const dateField = (field: string): string | undefined => {
    const v = b[field];
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
      errors.push({ field, message: "must be a valid ISO date string" });
      return undefined;
    }
    return v;
  };

  const window_started_at = dateField("window_started_at");
  const window_ended_at = dateField("window_ended_at");

  // GERİYE UYUMLU opsiyonel metrikler: eski content.js bunları göndermez.
  // Yoksa veya geçersizse 0 kabul edilir (hata değil); varsa aralığa zorlanır.
  const optNum = (field: string, min: number, max: number): number => {
    const v = b[field];
    if (!isNum(v)) return 0;
    return Math.min(max, Math.max(min, v));
  };
  const flight_cv = optNum("flight_cv", 0, 10);
  const backspace_burst_ratio = optNum("backspace_burst_ratio", 0, 1);

  // local_hour: eklenti gönderirse doğrula; yoksa window_ended_at'ten türet.
  let local_hour: number;
  const lh = b["local_hour"];
  if (isNum(lh)) {
    if (lh < 0 || lh > 23) {
      errors.push({ field: "local_hour", message: "must be between 0 and 23" });
    }
    local_hour = Math.floor(lh as number);
  } else {
    local_hour = window_ended_at
      ? new Date(window_ended_at).getHours()
      : new Date().getHours();
  }

  if (errors.length > 0) return { data: null, errors };

  // GİZLİLİK: Yalnızca bu whitelist alanları geçer; payload'daki diğer her
  // şey (örn. yanlışlıkla eklenmiş ham veri) burada düşürülür.
  return {
    data: {
      mean_flight_ms: mean_flight_ms!,
      median_flight_ms: median_flight_ms!,
      p95_flight_ms: p95_flight_ms!,
      backspace_percentage: backspace_percentage!,
      total_samples: Math.round(total_samples!),
      active_typing_seconds: Math.round(active_typing_seconds!),
      pause_ratio: pause_ratio!,
      window_started_at: window_started_at!,
      window_ended_at: window_ended_at!,
      local_hour,
      flight_cv,
      backspace_burst_ratio,
    },
    errors: null,
  };
}
