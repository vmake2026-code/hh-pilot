import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  consumeRateLimit,
  tryAcquireConcurrency,
  releaseConcurrency,
  extractClientIp,
  resetRateLimiterForTests,
  hhImportRateLimiter,
} from "../../lib/rate-limit";

// P10.5: unit-контракт rate limiter — fixed window per IP + concurrency cap.
// Module-level state изолируется через resetRateLimiterForTests() (без DI).

const RATE_ENV_KEYS = [
  "AI_RATE_LIMIT_WINDOW_MS",
  "AI_RATE_LIMIT_MAX",
  "AI_RATE_LIMIT_TTL_MS",
  "AI_RATE_LIMIT_MAX_BUCKETS",
  "AI_CONCURRENCY_MAX",
  "AI_CONCURRENCY_RETRY_AFTER_S",
] as const;

// P20: HH import limiter env keys
const HH_ENV_KEYS = [
  "HH_IMPORT_RATE_LIMIT_WINDOW_MS",
  "HH_IMPORT_RATE_LIMIT_MAX",
  "HH_IMPORT_RATE_LIMIT_TTL_MS",
  "HH_IMPORT_RATE_LIMIT_MAX_BUCKETS",
  "HH_IMPORT_CONCURRENCY_MAX",
  "HH_IMPORT_CONCURRENCY_RETRY_AFTER_S",
] as const;

let savedEnv: Record<string, string | undefined>;

function clearEnv(): void {
  for (const key of RATE_ENV_KEYS) delete process.env[key];
  for (const key of HH_ENV_KEYS) delete process.env[key];
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  savedEnv = {};
  for (const key of RATE_ENV_KEYS) savedEnv[key] = process.env[key];
  for (const key of HH_ENV_KEYS) savedEnv[key] = process.env[key];
  clearEnv();
  resetRateLimiterForTests();
  hhImportRateLimiter.resetForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  clearEnv();
  for (const key of RATE_ENV_KEYS) {
    const value = savedEnv[key];
    setEnv(key, value);
  }
  for (const key of HH_ENV_KEYS) {
    const value = savedEnv[key];
    setEnv(key, value);
  }
  resetRateLimiterForTests();
  hhImportRateLimiter.resetForTests();
});

describe("consumeRateLimit — basic fixed window (P10.5)", () => {
  it("first request is allowed", () => {
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
  });

  it("requests within limit are allowed (default 5)", () => {
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
    }
  });

  it("limit + 1 is rejected", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    const decision = consumeRateLimit("1.2.3.4");
    expect(decision.allowed).toBe(false);
  });

  it("after the window expires requests are allowed again", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
  });

  it("AI_RATE_LIMIT_MAX=2 overrides the default limit", () => {
    process.env.AI_RATE_LIMIT_MAX = "2";
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(false);
  });
});

describe("consumeRateLimit — window boundaries (P10.5)", () => {
  it("request at windowStart + window - 1ms is still the same window (rejected)", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    vi.advanceTimersByTime(59_999);
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(false);
  });

  it("request at windowStart + window starts a new window (allowed)", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    vi.advanceTimersByTime(60_000);
    expect(consumeRateLimit("1.2.3.4").allowed).toBe(true);
  });
});

describe("consumeRateLimit — Retry-After (P10.5)", () => {
  it("rejected request gets a positive integer retryAfterSeconds", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    vi.advanceTimersByTime(10_000); // прошло 10s окна 60s

    const decision = consumeRateLimit("1.2.3.4");
    expect(decision.allowed).toBe(false);
    expect(Number.isInteger(decision.retryAfterSeconds)).toBe(true);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    // не больше длительности окна в секундах
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("retryAfterSeconds shrinks as the window progresses", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.2.3.4");
    const early = consumeRateLimit("1.2.3.4").retryAfterSeconds;
    vi.advanceTimersByTime(30_000);
    const late = consumeRateLimit("1.2.3.4").retryAfterSeconds;
    expect(late).toBeLessThan(early);
    expect(late).toBe(30);
  });
});

describe("consumeRateLimit — independent IP buckets (P10.5)", () => {
  it("IP A exhausted does not affect IP B", () => {
    for (let i = 0; i < 5; i++) consumeRateLimit("1.1.1.1");
    expect(consumeRateLimit("1.1.1.1").allowed).toBe(false);
    expect(consumeRateLimit("2.2.2.2").allowed).toBe(true);
  });
});

describe("extractClientIp (P10.5)", () => {
  function headersWith(xff?: string, realIp?: string): Headers {
    const headers = new Headers();
    if (xff !== undefined) headers.set("X-Forwarded-For", xff);
    if (realIp !== undefined) headers.set("X-Real-IP", realIp);
    return headers;
  }

  it("single-entry XFF is used", () => {
    expect(extractClientIp(headersWith("3.3.3.3"))).toBe("3.3.3.3");
  });

  it("multiple-entry XFF uses the LAST non-empty entry", () => {
    expect(extractClientIp(headersWith("1.1.1.1, 2.2.2.2 , 3.3.3.3"))).toBe("3.3.3.3");
  });

  it("empty entries and trailing/multiple commas are tolerated", () => {
    expect(extractClientIp(headersWith(" , ,5.5.5.5,  ,"))).toBe("5.5.5.5");
  });

  it("all-empty XFF falls back to x-real-ip", () => {
    expect(extractClientIp(headersWith(" , ,", "6.6.6.6"))).toBe("6.6.6.6");
  });

  it("missing headers fall back to 'unknown'", () => {
    expect(extractClientIp(headersWith())).toBe("unknown");
  });

  it("malformed values do not crash and become the key as-is", () => {
    expect(extractClientIp(headersWith("not-an-ip"))).toBe("not-an-ip");
  });

  it("very long header value is capped to a bounded key", () => {
    const longValue = "x".repeat(10_000);
    const key = extractClientIp(headersWith(longValue));
    expect(key.length).toBeLessThanOrEqual(64);
  });

  it("headerless requests share the 'unknown' bucket", () => {
    const h = headersWith();
    expect(extractClientIp(h)).toBe("unknown");
    // все unknown-запросы конкурируют за один bucket
    for (let i = 0; i < 5; i++) consumeRateLimit(extractClientIp(headersWith()));
    expect(consumeRateLimit(extractClientIp(headersWith())).allowed).toBe(false);
  });
});

describe("consumeRateLimit — TTL cleanup (P10.5)", () => {
  it("buckets older than TTL are evicted lazily", () => {
    process.env.AI_RATE_LIMIT_TTL_MS = "1000";
    process.env.AI_RATE_LIMIT_MAX_BUCKETS = "3";
    consumeRateLimit("1.1.1.1");
    vi.advanceTimersByTime(1500);
    // cleanup происходит при следующем обращении; buckets.size остаётся ограничен
    consumeRateLimit("2.2.2.2");
    consumeRateLimit("3.3.3.3");
    consumeRateLimit("4.4.4.4");
    // старый bucket не должен занимать место: новые IP помещаются в cap
    expect(consumeRateLimit("1.1.1.1").allowed).toBe(true);
  });
});

describe("consumeRateLimit — bucket cap (P10.5)", () => {
  it("more than AI_RATE_LIMIT_MAX_BUCKETS does not grow state unbounded", () => {
    process.env.AI_RATE_LIMIT_MAX_BUCKETS = "10";
    for (let i = 0; i < 100; i++) {
      consumeRateLimit(`ip-${i}`);
    }
    //(bucket cap удерживает размер; старые evicted)
    // первые IP уже вытеснены и не влияют на последующие
    for (let i = 100; i < 130; i++) {
      expect(consumeRateLimit(`ip-${i}`).allowed).toBe(true);
    }
  });
});

describe("concurrency cap (P10.5)", () => {
  it("capacity available -> acquire allowed", () => {
    expect(tryAcquireConcurrency().allowed).toBe(true);
    releaseConcurrency();
  });

  it("capacity exhausted -> reject (default 3)", () => {
    expect(tryAcquireConcurrency().allowed).toBe(true);
    expect(tryAcquireConcurrency().allowed).toBe(true);
    expect(tryAcquireConcurrency().allowed).toBe(true);
    expect(tryAcquireConcurrency().allowed).toBe(false);
  });

  it("release makes capacity available again", () => {
    tryAcquireConcurrency();
    tryAcquireConcurrency();
    tryAcquireConcurrency();
    expect(tryAcquireConcurrency().allowed).toBe(false);
    releaseConcurrency();
    expect(tryAcquireConcurrency().allowed).toBe(true);
    releaseConcurrency();
  });

  it("release is safe against underflow (extra release does not go negative)", () => {
    releaseConcurrency();
    expect(tryAcquireConcurrency().allowed).toBe(true);
  });

  it("AI_CONCURRENCY_MAX=2 override works", () => {
    process.env.AI_CONCURRENCY_MAX = "2";
    expect(tryAcquireConcurrency().allowed).toBe(true);
    expect(tryAcquireConcurrency().allowed).toBe(true);
    expect(tryAcquireConcurrency().allowed).toBe(false);
  });

  it("concurrency rejection returns AI_CONCURRENCY_RETRY_AFTER_S (default 5)", () => {
    tryAcquireConcurrency();
    tryAcquireConcurrency();
    tryAcquireConcurrency();
    const decision = tryAcquireConcurrency();
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBe(5);
  });
});

// ---------- P20: scoped HH import limiter ----------

describe("hhImportRateLimiter — scoped fixed window (P20)", () => {
  it("default: 10 requests per IP allowed, 11th blocked", () => {
    for (let i = 0; i < 10; i++) {
      expect(hhImportRateLimiter.consumeRateLimit("1.2.3.4").allowed).toBe(true);
    }
    const decision = hhImportRateLimiter.consumeRateLimit("1.2.3.4");
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("HH_IMPORT_RATE_LIMIT_MAX override works", () => {
    process.env.HH_IMPORT_RATE_LIMIT_MAX = "2";
    expect(hhImportRateLimiter.consumeRateLimit("5.5.5.5").allowed).toBe(true);
    expect(hhImportRateLimiter.consumeRateLimit("5.5.5.5").allowed).toBe(true);
    expect(hhImportRateLimiter.consumeRateLimit("5.5.5.5").allowed).toBe(false);
  });

  it("independent IP buckets", () => {
    for (let i = 0; i < 10; i++) hhImportRateLimiter.consumeRateLimit("1.1.1.1");
    expect(hhImportRateLimiter.consumeRateLimit("1.1.1.1").allowed).toBe(false);
    expect(hhImportRateLimiter.consumeRateLimit("2.2.2.2").allowed).toBe(true);
  });

  it("window expiration via fake timers (no real sleep)", () => {
    process.env.HH_IMPORT_RATE_LIMIT_MAX = "1";
    expect(hhImportRateLimiter.consumeRateLimit("7.7.7.7").allowed).toBe(true);
    expect(hhImportRateLimiter.consumeRateLimit("7.7.7.7").allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z")); // +60s, окно истекло
    expect(hhImportRateLimiter.consumeRateLimit("7.7.7.7").allowed).toBe(true);
  });

  it("HH limiter state is ISOLATED from AI limiter (different buckets)", () => {
    process.env.AI_RATE_LIMIT_MAX = "1";
    process.env.HH_IMPORT_RATE_LIMIT_MAX = "1";

    // исчерпываем AI-бакет IP
    expect(consumeRateLimit("9.9.9.9").allowed).toBe(true);
    expect(consumeRateLimit("9.9.9.9").allowed).toBe(false);
    // HH-бакет того же IP независим
    expect(hhImportRateLimiter.consumeRateLimit("9.9.9.9").allowed).toBe(true);
    expect(hhImportRateLimiter.consumeRateLimit("9.9.9.9").allowed).toBe(false);
    // AI-бакет по-прежнему блокирует
    expect(consumeRateLimit("9.9.9.9").allowed).toBe(false);
  });

  it("concurrency: default 3 in-flight, release frees the slot", () => {
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    const saturated = hhImportRateLimiter.tryAcquireConcurrency();
    expect(saturated.allowed).toBe(false);
    expect(saturated.retryAfterSeconds).toBe(5);

    hhImportRateLimiter.releaseConcurrency();
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
  });

  it("HH_IMPORT_CONCURRENCY_MAX override + underflow-safe release", () => {
    process.env.HH_IMPORT_CONCURRENCY_MAX = "2";
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(false);
    hhImportRateLimiter.releaseConcurrency();
    hhImportRateLimiter.releaseConcurrency();
    hhImportRateLimiter.releaseConcurrency(); // extra release — no underflow
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
  });

  it("HH concurrency state is ISOLATED from AI concurrency counter", () => {
    process.env.AI_CONCURRENCY_MAX = "1";
    process.env.HH_IMPORT_CONCURRENCY_MAX = "1";

    expect(tryAcquireConcurrency().allowed).toBe(true); // AI slot занят
    expect(tryAcquireConcurrency().allowed).toBe(false); // AI saturated
    // HH slots независимы
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(true);
    expect(hhImportRateLimiter.tryAcquireConcurrency().allowed).toBe(false);
    releaseConcurrency(); // AI освобождён
    expect(tryAcquireConcurrency().allowed).toBe(true);
  });
});
