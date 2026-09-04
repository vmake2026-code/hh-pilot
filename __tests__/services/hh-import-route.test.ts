import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../../app/api/vacancies/import/route";
import { hhImportRateLimiter } from "../../lib/rate-limit";
import { FIXTURE_VACANCY_HTML } from "./hh-html-fixtures";

// P18: контракт POST /api/vacancies/import — validation, error
// normalization (никаких внутренних деталей наружу), success shape.
// HTTP layer mocked — live hh.ru network не нужен.
// P20: rate limiting/concurrency на route boundary (state сбрасывается
// между тестами — лимиты не влияют на остальные кейсы).

let savedFetch: typeof globalThis.fetch;

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/vacancies/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function hhResponse(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...headers },
  });
}

beforeEach(() => {
  savedFetch = globalThis.fetch;
  hhImportRateLimiter.resetForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  hhImportRateLimiter.resetForTests();
  vi.restoreAllMocks();
});

describe("POST /api/vacancies/import — validation", () => {
  it("malformed body -> 400 invalid_body", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("invalid_body");
  });

  it("missing url -> 400 invalid_url", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_url");
  });

  it("non-hh.ru url -> 400 invalid_url, HH never called", async () => {
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return hhResponse("<html></html>");
    }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://evil.com/vacancy/1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_url");
    expect(called).toBe(false);
  });

  it("lookalike domain -> 400 invalid_url", async () => {
    const res = await POST(makeRequest({ url: "https://hh.ru.evil.com/x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_url");
  });

  it("userinfo trick -> 400 invalid_url", async () => {
    const res = await POST(makeRequest({ url: "https://hh.ru@evil.com/x" }));
    expect(res.status).toBe(400);
  });

  it("ftp scheme -> 400 invalid_url", async () => {
    const res = await POST(makeRequest({ url: "ftp://hh.ru/file" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/vacancies/import — success", () => {
  it("returns extracted text with stable contract", async () => {
    globalThis.fetch = (async () => hhResponse(FIXTURE_VACANCY_HTML)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.sourceUrl).toBe("https://hh.ru/vacancy/135822080");
    expect(typeof json.fetchedAt).toBe("string");
    expect(new Date(json.fetchedAt).getTime()).toBeGreaterThan(0);
    expect(json.text).toContain("Frontend- разработчик (Angular)");
    expect(json.text).toContain("Компания: БАНК УРАЛСИБ");
    // HH-заголовки канонизируются в ключи существующего parser'а
    expect(json.text).toMatch(/Требования:/);
    expect(json.text).toContain("разрабатывать пользовательские интерфейсы на Angular");
    expect(json.fields.title).toBe("Frontend- разработчик (Angular)");
    expect(json.fields.company).toBe("БАНК УРАЛСИБ");
    expect(json.fields.workFormat).toBe("удалённо");
  });
});

describe("POST /api/vacancies/import — error normalization", () => {
  it("404 from HH -> 404 vacancy_not_found with user-safe message", async () => {
    globalThis.fetch = (async () => hhResponse("not found", {}, 404)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/999999" }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("vacancy_not_found");
    expect(json.error).toContain("не найдена");
  });

  it("403 from HH -> 403 hh_access_denied", async () => {
    globalThis.fetch = (async () => hhResponse("forbidden", {}, 403)) as unknown as typeof fetch;
    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("hh_access_denied");
  });

  it("429 from HH -> 429 rate_limited with Retry-After", async () => {
    globalThis.fetch = (async () => hhResponse("slow down", {}, 429)) as unknown as typeof fetch;
    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect((await res.json()).code).toBe("rate_limited");
  });

  it("500 from HH -> 502 upstream_error, no internals leaked", async () => {
    globalThis.fetch = (async () =>
      hhResponse("Internal Stack Trace Detail: /var/lib/secret", {}, 500)) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    const raw = await res.text();
    expect(res.status).toBe(502);
    expect(JSON.parse(raw).code).toBe("upstream_error");
    expect(raw).not.toContain("/var/lib/secret");
    expect(raw).not.toContain("Internal Stack Trace");
  });

  it("redirect to forbidden host -> 403 redirect_blocked", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input) === "https://hh.ru/vacancy/1") {
        return new Response(null, {
          status: 302,
          headers: { Location: "https://evil.com/x" },
        });
      }
      return hhResponse("<html>must not be fetched</html>");
    }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("redirect_blocked");
  });

  it("timeout -> 504 timeout with user-safe message", async () => {
    // Route использует AbortSignal.timeout(10s): wait не нужен —
    // эмулируем немедленный abort из undici (TimeoutError).
    const timeoutFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const abortError = new Error("The operation was aborted due to timeout");
        abortError.name = "TimeoutError";
        // signal уже could be aborted или abortится — reject немедленно
        if (init?.signal?.aborted) reject(abortError);
        else init?.signal?.addEventListener("abort", () => reject(abortError), { once: true });
      })) as unknown as typeof fetch;
    globalThis.fetch = timeoutFetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.code).toBe("timeout");
    expect(json.error).toContain("не ответил");
  }, 15_000);

  it("oversized declared response -> 413 response_too_large", async () => {
    globalThis.fetch = (async () =>
      hhResponse("<html>huge</html>", {
        "Content-Length": String(10 * 1024 * 1024),
      })) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("response_too_large");
  });

  it("non-HTML content type -> 415 unsupported_content_type", async () => {
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(415);
    expect((await res.json()).code).toBe("unsupported_content_type");
  });

  it("page without vacancy content -> 502 extraction_failed", async () => {
    globalThis.fetch = (async () =>
      hhResponse("<html><body>nothing here</body></html>")) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("extraction_failed");
  });

  it("network crash -> 502 network_error, no stack trace leaked", async () => {
    globalThis.fetch = (async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:443 at internal/path.js:1:1");
    }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
    const raw = await res.text();
    expect(res.status).toBe(502);
    expect(JSON.parse(raw).code).toBe("network_error");
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("internal/path.js");
  });
});

// ---------- P20: rate limiting / concurrency on the route boundary ----------

describe("POST /api/vacancies/import — rate limiting (P20)", () => {
  function setFetchOk(): void {
    globalThis.fetch = (async () => hhResponse(FIXTURE_VACANCY_HTML)) as unknown as typeof fetch;
  }

  function setEnvAndRestore(): () => void {
    const keys = ["HH_IMPORT_RATE_LIMIT_MAX", "HH_IMPORT_RATE_LIMIT_WINDOW_MS"];
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) saved[k] = process.env[k];
    return () => {
      for (const k of keys) {
        const v = saved[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
  }

  it("A. allows normal traffic up to the limit (10/min/IP default)", async () => {
    setFetchOk();
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
      expect(res.status).toBe(200);
    }
  });

  it("B. blocks burst: 11th request -> 429 rate_limited with Retry-After", async () => {
    setFetchOk();
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
    }
    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("rate_limited");
    expect(json.error).toContain("Слишком много");
  });

  it("B2. rate-limited request does NOT call HH (no outbound fetch)", async () => {
    setFetchOk();
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return hhResponse(FIXTURE_VACANCY_HTML);
    }) as unknown as typeof fetch;

    for (let i = 0; i < 10; i++) {
      await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
    }
    const callsBefore = fetchCalls;
    const res = await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
    expect(res.status).toBe(429);
    expect(fetchCalls).toBe(callsBefore);
  });

  it("B3. limiter key does NOT depend on vacancy URL (different URLs same bucket)", async () => {
    setFetchOk();
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest({ url: `https://hh.ru/vacancy/13582208${i}` }));
    }
    // 6-й запрос с ДРУГИМ vacancy URL от того же IP — тот же bucket
    const res = await POST(
      makeRequest({ url: "https://hh.ru/vacancy/999999" }),
    );
    expect(res.status).toBe(200);
    // всего 6 — но проверяем, что считает общий bucket, а не URL:
    for (let i = 6; i < 10; i++) {
      await POST(makeRequest({ url: `https://hh.ru/vacancy/13582208${i}` }));
    }
    const res2 = await POST(makeRequest({ url: "https://hh.ru/vacancy/777777" }));
    expect(res2.status).toBe(429);
  });

  it("C. different IPs have independent buckets", async () => {
    setFetchOk();
    const restore = setEnvAndRestore();
    try {
      process.env.HH_IMPORT_RATE_LIMIT_MAX = "2";
      hhImportRateLimiter.resetForTests();

      for (let i = 0; i < 2; i++) {
        await POST(makeRequestWithIp({ url: "https://hh.ru/vacancy/1" }, "9.9.9.9"));
      }
      const blocked = await POST(makeRequestWithIp({ url: "https://hh.ru/vacancy/1" }, "9.9.9.9"));
      expect(blocked.status).toBe(429);

      const other = await POST(makeRequestWithIp({ url: "https://hh.ru/vacancy/1" }, "8.8.8.8"));
      expect(other.status).toBe(200);
    } finally {
      restore();
    }
  });

  it("D. window expiration: after window passes, new request allowed", async () => {
    setFetchOk();
    const restore = setEnvAndRestore();
    try {
      process.env.HH_IMPORT_RATE_LIMIT_MAX = "1";
      process.env.HH_IMPORT_RATE_LIMIT_WINDOW_MS = "50";
      hhImportRateLimiter.resetForTests();

      const first = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(first.status).toBe(200);
      const blocked = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(blocked.status).toBe(429);

      // window 50ms — реальный sleep в unit-тесте допустим для 60ms
      await new Promise((r) => setTimeout(r, 70));

      const after = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(after.status).toBe(200);
    } finally {
      restore();
    }
  });

  it("validation errors do NOT consume quota (ordering)", async () => {
    const restore = setEnvAndRestore();
    try {
      process.env.HH_IMPORT_RATE_LIMIT_MAX = "1";
      hhImportRateLimiter.resetForTests();

      // invalid_body / invalid_url не расходуют квоту
      await POST(makeRequest("{not json"));
      await POST(makeRequest({ url: "https://evil.com/x" }));
      await POST(makeRequest({ url: "" }));

      const valid = await POST(makeRequest({ url: "https://hh.ru/vacancy/135822080" }));
      expect(valid.status).toBe(200);
    } finally {
      restore();
      setFetchOk();
    }
  });
});

describe("POST /api/vacancies/import — concurrency cap (P20)", () => {
  it("E. saturates at HH_IMPORT_CONCURRENCY_MAX in-flight fetches", async () => {
    const restore = (() => {
      const saved = process.env.HH_IMPORT_CONCURRENCY_MAX;
      return () => {
        if (saved === undefined) delete process.env.HH_IMPORT_CONCURRENCY_MAX;
        else process.env.HH_IMPORT_CONCURRENCY_MAX = saved;
      };
    })();
    try {
      process.env.HH_IMPORT_CONCURRENCY_MAX = "2";
      hhImportRateLimiter.resetForTests();

      // blocking fetch: висит до ручного release
      const pending: Array<() => void> = [];
      globalThis.fetch = (async () =>
        new Promise<Response>((resolve) => {
          pending.push(() => resolve(hhResponse(FIXTURE_VACANCY_HTML)));
        })) as unknown as typeof fetch;

      const p1 = POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      const p2 = POST(makeRequest({ url: "https://hh.ru/vacancy/2" }));
      await new Promise((r) => setTimeout(r, 0));

      const p3 = await POST(makeRequest({ url: "https://hh.ru/vacancy/3" }));
      expect(p3.status).toBe(429);
      expect((await p3.json()).code).toBe("rate_limited");
      expect(p3.headers.get("Retry-After")).toBeTruthy();

      pending[0]!();
      const r1 = await p1;
      expect(r1.status).toBe(200);

      pending[1]!();
      await p2;
    } finally {
      restore();
    }
  });

  it("F. concurrency slot is released after fetch error (no deadlock)", async () => {
    const restore = (() => {
      const saved = process.env.HH_IMPORT_CONCURRENCY_MAX;
      return () => {
        if (saved === undefined) delete process.env.HH_IMPORT_CONCURRENCY_MAX;
        else process.env.HH_IMPORT_CONCURRENCY_MAX = saved;
      };
    })();
    try {
      process.env.HH_IMPORT_CONCURRENCY_MAX = "1";
      hhImportRateLimiter.resetForTests();

      globalThis.fetch = (async () => {
        throw new Error("fetch failed");
      }) as unknown as typeof fetch;
      const failed = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(failed.status).toBe(502);

      // слот обязан быть свободен: следующий запрос проходит до fetch
      globalThis.fetch = (async () => hhResponse(FIXTURE_VACANCY_HTML)) as unknown as typeof fetch;
      const next = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(next.status).toBe(200);
    } finally {
      restore();
    }
  });

  it("F2. concurrency slot released after timeout/abort too", async () => {
    const restore = (() => {
      const saved = process.env.HH_IMPORT_CONCURRENCY_MAX;
      return () => {
        if (saved === undefined) delete process.env.HH_IMPORT_CONCURRENCY_MAX;
        else process.env.HH_IMPORT_CONCURRENCY_MAX = saved;
      };
    })();
    try {
      process.env.HH_IMPORT_CONCURRENCY_MAX = "1";
      hhImportRateLimiter.resetForTests();

      const timeoutFetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          if (init?.signal?.aborted) reject(err);
          else init?.signal?.addEventListener("abort", () => reject(err), { once: true });
        })) as unknown as typeof fetch;
      globalThis.fetch = timeoutFetch;

      const timed = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(timed.status).toBe(504);

      globalThis.fetch = (async () => hhResponse(FIXTURE_VACANCY_HTML)) as unknown as typeof fetch;
      const next = await POST(makeRequest({ url: "https://hh.ru/vacancy/1" }));
      expect(next.status).toBe(200);
    } finally {
      restore();
    }
  }, 15_000);
});

/** Хелпер: request с явным X-Forwarded-For (per-IP bucket тесты). */
function makeRequestWithIp(body: unknown, ip: string): Request {
  return new Request("http://localhost/api/vacancies/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
