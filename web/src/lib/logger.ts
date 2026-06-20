/**
 * Yapısal logger.
 *
 * GİZLİLİK/GÜVENLİK:
 * - İstemciye hata detayı sızdırılmaz; bu logger yalnızca sunucu tarafında
 *   (API route'larında) kullanılır.
 * - `redact()` ile bilinen hassas anahtarlar (token, authorization, email,
 *   password vb.) loglardan temizlenir.
 * - Çıktı JSON satırlarıdır; Vercel log toplayıcıları bunları yapısal okur.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEYS = [
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "accesstoken",
  "apikey",
  "api_key",
  "password",
  "secret",
  "email",
  "anonkey",
  "anon_key",
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

/** Hassas alanları özyinelemeli olarak "[redacted]" ile değiştirir. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[max-depth]";
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { value: redact(err) };
}

export interface LogContext {
  requestId?: string;
  route?: string;
  userId?: string;
  [key: string]: unknown;
}

function emit(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): void {
  const entry: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  if (error !== undefined) entry.error = serializeError(error);

  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    emit("debug", message, context),
  info: (message: string, context?: LogContext) =>
    emit("info", message, context),
  warn: (message: string, context?: LogContext) =>
    emit("warn", message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit("error", message, context, error),
};

/** Her istek için kısa, benzersiz bir kimlik üretir (log korelasyonu). */
export function newRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}
