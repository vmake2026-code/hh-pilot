// P10.5: route-level rate limiting + concurrency cap for /api/ai/analyze.
//
// MULTI-INSTANCE LIMITATION: state — process-local (module-level Map/counter).
// При нескольких экземплярах приложения aggregate capacity растёт вместе с
// числом инстансов: каждый инстанс считает свою долю независимо (instance A /
// instance B / instance C — независимые buckets). Это НЕ distributed rate
// limiting. Serverless/cold-start окружения могут сбрасывать in-memory state
// (limiter деградирует до best-effort).
//
// Implementation изолирована в этом модуле, чтобы позже её можно было заменить
// на distributed store (Redis и т.п.) без изменения route или AI core.
//
// IP TRUST BOUNDARY: X-Forwarded-For trustworthy ONLY when a trusted reverse
// proxy overwrites/controls the header. In direct/dev deployment XFF может
// быть spoofed — известное ограничение текущего local-first MVP (P10.5 design).

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_WINDOW = 5;
const DEFAULT_CONCURRENCY_MAX = 3;
const DEFAULT_CONCURRENCY_RETRY_AFTER_S = 5;
const DEFAULT_TTL_MS = 10 * 60_000;
const DEFAULT_MAX_BUCKETS = 10_000;
/** IPv4 ≤ 15 chars, IPv6 textual ≤ 45 chars; 64 покрывает оба с запасом. */
const MAX_IP_KEY_LENGTH = 64;

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitBucket>();
let inFlight = 0;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readWindowMs(): number {
  return readPositiveIntEnv("AI_RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
}

function readTtlMs(windowMs: number): number {
  // default TTL не может быть меньше 2×window: живое окно никогда не эвицируется.
  return readPositiveIntEnv("AI_RATE_LIMIT_TTL_MS", Math.max(DEFAULT_TTL_MS, 2 * windowMs));
}

/** Ленивая очистка при каждом обращении: buckets старше TTL удаляются. Без таймеров. */
function cleanupExpired(now: number, ttlMs: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > ttlMs) buckets.delete(key);
  }
}

/** Cap на число buckets: защита памяти от flood рандомизированными fake IP. */
function evictForNewKey(): void {
  const maxBuckets = readPositiveIntEnv("AI_RATE_LIMIT_MAX_BUCKETS", DEFAULT_MAX_BUCKETS);
  while (buckets.size >= maxBuckets) {
    const oldest = buckets.keys().next();
    if (oldest.done || oldest.value === undefined) break;
    buckets.delete(oldest.value);
  }
}

function capKeyLength(value: string): string {
  return value.slice(0, MAX_IP_KEY_LENGTH);
}

/**
 * IP key: последний корректный (непустой) entry X-Forwarded-For,
 * затем x-real-ip, затем "unknown" (общий bucket для headerless клиентов).
 * Malformed values не вызывают crash и используются как opaque key
 * ограниченной длины.
 */
export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded.split(",");
    for (let i = entries.length - 1; i >= 0; i--) {
      const candidate = entries[i].trim();
      if (candidate) return capKeyLength(candidate);
    }
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return capKeyLength(realIp.trim());
  return "unknown";
}

/**
 * Fixed window per IP: AI_RATE_LIMIT_MAX запросов за AI_RATE_LIMIT_WINDOW_MS.
 * Вызывается route ПОСЛЕ validation/configuration checks — ошибки
 * invalid_body / invalid_input / input_too_large / ai_not_configured
 * quota не расходуют.
 */
export function consumeRateLimit(ip: string): RateLimitDecision {
  const now = Date.now();
  const windowMs = readWindowMs();
  cleanupExpired(now, readTtlMs(windowMs));

  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    evictForNewKey();
    buckets.set(ip, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count < readPositiveIntEnv("AI_RATE_LIMIT_MAX", DEFAULT_MAX_PER_WINDOW)) {
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const remainingMs = windowMs - (now - bucket.windowStart);
  return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

/** Global in-flight cap: AI_CONCURRENCY_MAX одновременных AI requests на процесс. */
export function tryAcquireConcurrency(): RateLimitDecision {
  if (inFlight >= readPositiveIntEnv("AI_CONCURRENCY_MAX", DEFAULT_CONCURRENCY_MAX)) {
    return {
      allowed: false,
      retryAfterSeconds: readPositiveIntEnv("AI_CONCURRENCY_RETRY_AFTER_S", DEFAULT_CONCURRENCY_RETRY_AFTER_S),
    };
  }
  inFlight += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Обязателен в finally вызывающего: release при success / error / exception / timeout. */
export function releaseConcurrency(): void {
  if (inFlight > 0) inFlight -= 1;
}

/** Изоляция тестов: сброс module-level state. Не использовать в runtime-коде. */
export function resetRateLimiterForTests(): void {
  buckets.clear();
  inFlight = 0;
}

// ---------- P20: scoped rate limiter (multiple routes) ----------
//
// Существующие AI-функции выше держат один общий buckets/inFlight state с
// env-именами AI_*. Прямое переиспользование их для другого route (HH import)
// невозможно: HH-импорты расходовали бы AI-квоту того же IP и наоборот.
// Минимальная абстракция: factory с изолированным state и собственными
// env-именами. Same fixed-window semantics, same IP trust boundary caveat.

export interface ScopedRateLimiter {
  consumeRateLimit(ip: string): RateLimitDecision;
  tryAcquireConcurrency(): RateLimitDecision;
  releaseConcurrency(): void;
  /** Изоляция тестов: сброс state. Не использовать в runtime-коде. */
  resetForTests(): void;
}

interface ScopedLimiterOptions {
  envNames: {
    windowMs: string;
    maxPerWindow: string;
    concurrencyMax?: string;
    concurrencyRetryAfterS?: string;
    ttlMs?: string;
    maxBuckets?: string;
  };
  defaults: {
    windowMs: number;
    maxPerWindow: number;
    concurrencyMax: number;
    concurrencyRetryAfterS: number;
    ttlMs: number;
    maxBuckets: number;
  };
}

function createScopedRateLimiter(options: ScopedLimiterOptions): ScopedRateLimiter {
  const localBuckets = new Map<string, RateLimitBucket>();
  let localInFlight = 0;

  const readEnv = (name: string | undefined, fallback: number): number =>
    name ? readPositiveIntEnv(name, fallback) : fallback;

  const readWindowMs = () => readEnv(options.envNames.windowMs, options.defaults.windowMs);
  const readMax = () => readEnv(options.envNames.maxPerWindow, options.defaults.maxPerWindow);
  const readTtlMs = (windowMs: number) =>
    Math.max(readEnv(options.envNames.ttlMs, options.defaults.ttlMs), 2 * windowMs);
  const readMaxBuckets = () => readEnv(options.envNames.maxBuckets, options.defaults.maxBuckets);

  const cleanup = (now: number, ttlMs: number): void => {
    for (const [key, bucket] of localBuckets) {
      if (now - bucket.windowStart > ttlMs) localBuckets.delete(key);
    }
  };

  const evict = (): void => {
    while (localBuckets.size >= readMaxBuckets()) {
      const oldest = localBuckets.keys().next();
      if (oldest.done || oldest.value === undefined) break;
      localBuckets.delete(oldest.value);
    }
  };

  return {
    consumeRateLimit(ip: string): RateLimitDecision {
      const now = Date.now();
      const windowMs = readWindowMs();
      cleanup(now, readTtlMs(windowMs));

      const bucket = localBuckets.get(ip);
      if (!bucket || now - bucket.windowStart >= windowMs) {
        evict();
        localBuckets.set(ip, { count: 1, windowStart: now });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (bucket.count < readMax()) {
        bucket.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
      }
      const remainingMs = windowMs - (now - bucket.windowStart);
      return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
    },

    tryAcquireConcurrency(): RateLimitDecision {
      if (localInFlight >= readEnv(options.envNames.concurrencyMax, options.defaults.concurrencyMax)) {
        return {
          allowed: false,
          retryAfterSeconds: readEnv(
            options.envNames.concurrencyRetryAfterS,
            options.defaults.concurrencyRetryAfterS,
          ),
        };
      }
      localInFlight += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },

    releaseConcurrency(): void {
      if (localInFlight > 0) localInFlight -= 1;
    },

    resetForTests(): void {
      localBuckets.clear();
      localInFlight = 0;
    },
  };
}

/**
 * P20: HH import limiter — per-IP fixed window + in-process concurrency cap
 * на outbound HH fetch. Defaults консервативны: ручной UI-импорт — это
 * единицы запросов в минуту; 10/min/IP режет bursts, concurrency 3
 * ограничивает одновременные outbound HH requests на процесс.
 */
export const hhImportRateLimiter: ScopedRateLimiter = createScopedRateLimiter({
  envNames: {
    windowMs: "HH_IMPORT_RATE_LIMIT_WINDOW_MS",
    maxPerWindow: "HH_IMPORT_RATE_LIMIT_MAX",
    concurrencyMax: "HH_IMPORT_CONCURRENCY_MAX",
    concurrencyRetryAfterS: "HH_IMPORT_CONCURRENCY_RETRY_AFTER_S",
    ttlMs: "HH_IMPORT_RATE_LIMIT_TTL_MS",
    maxBuckets: "HH_IMPORT_RATE_LIMIT_MAX_BUCKETS",
  },
  defaults: {
    windowMs: 60_000,
    maxPerWindow: 10,
    concurrencyMax: 3,
    concurrencyRetryAfterS: 5,
    ttlMs: 10 * 60_000,
    maxBuckets: 10_000,
  },
});
