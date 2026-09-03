import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../../app/api/vacancies/import/route";
import { FIXTURE_VACANCY_HTML } from "./hh-html-fixtures";

// P18: контракт POST /api/vacancies/import — validation, error
// normalization (никаких внутренних деталей наружу), success shape.
// HTTP layer mocked — live hh.ru network не нужен.

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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = savedFetch;
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
