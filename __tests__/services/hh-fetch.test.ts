import { describe, it, expect, afterEach } from "vitest";
import {
  fetchHHVacancyPage,
  extractVacancyText,
  HHFetchError,
} from "../../services/hh-fetch";
import {
  FIXTURE_VACANCY_HTML,
  FIXTURE_NO_LD_HTML,
  FIXTURE_EMPTY_HTML,
} from "./hh-html-fixtures";

// P18: server-side HH fetch — SSRF hardening (scheme/host/redirect/size/
// timeout/content-type/status) + extraction cascade. HTTP layer mocked —
// тесты не зависят от live hh.ru network.

type FetchMock = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

let savedFetch: typeof globalThis.fetch | undefined;

function mockFetch(handler: FetchMock): void {
  globalThis.fetch = handler as unknown as typeof fetch;
}

function makeResponse(
  body: string,
  init: {
    status?: number;
    headers?: Record<string, string>;
    redirectUrl?: string;
  } = {},
): Response {
  const status = init.status ?? 200;
  if (init.redirectUrl) {
    return new Response(null, {
      status,
      headers: { Location: init.redirectUrl, ...(init.headers ?? {}) },
    });
  }
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=UTF-8", ...(init.headers ?? {}) },
  });
}

afterEach(() => {
  if (savedFetch) globalThis.fetch = savedFetch;
});
// ---------- URL validation (SSRF: host allowlist) ----------

describe("fetchHHVacancyPage — URL validation", () => {
  it("accepts https hh.ru URL", async () => {
    let requestedUrl = "";
    mockFetch(async (input) => {
      requestedUrl = String(input);
      return makeResponse("<html></html>");
    });
    const result = await fetchHHVacancyPage("https://hh.ru/vacancy/135822080");
    expect(requestedUrl).toBe("https://hh.ru/vacancy/135822080");
    expect(result.html).toBe("<html></html>");
  });

  it("accepts hh.ru subdomain", async () => {
    let requestedUrl = "";
    mockFetch(async (input) => {
      requestedUrl = String(input);
      return makeResponse("<html></html>");
    });
    await fetchHHVacancyPage("https://api.hh.ru/vacancies");
    expect(requestedUrl).toBe("https://api.hh.ru/vacancies");
  });

  it("rejects external domain (server-side re-validation)", async () => {
    let called = false;
    mockFetch(async () => {
      called = true;
      return makeResponse("<html></html>");
    });
    await expect(
      fetchHHVacancyPage("https://example.com/vacancy/1"),
    ).rejects.toMatchObject({ code: "invalid_url" });
    expect(called).toBe(false);
  });

  it("rejects lookalike domain hh.ru.evil.com", async () => {
    await expect(
      fetchHHVacancyPage("https://hh.ru.evil.com/vacancy/1"),
    ).rejects.toMatchObject({ code: "invalid_url" });
  });

  it("rejects userinfo trick https://hh.ru@evil.com", async () => {
    await expect(
      fetchHHVacancyPage("https://hh.ru@evil.com/x"),
    ).rejects.toMatchObject({ code: "invalid_url" });
  });

  it("rejects ftp scheme", async () => {
    await expect(fetchHHVacancyPage("ftp://hh.ru/file")).rejects.toMatchObject({
      code: "invalid_url",
    });
  });

  it("rejects javascript: scheme", async () => {
    await expect(fetchHHVacancyPage("javascript:alert(1)")).rejects.toMatchObject({
      code: "invalid_url",
    });
  });

  it("rejects malformed URL", async () => {
    await expect(fetchHHVacancyPage("not-a-url")).rejects.toMatchObject({
      code: "invalid_url",
    });
  });

  it("rejects empty URL", async () => {
    await expect(fetchHHVacancyPage("")).rejects.toMatchObject({ code: "invalid_url" });
  });
});

// ---------- HTTP status handling ----------

describe("fetchHHVacancyPage — status handling", () => {
  it("404 -> vacancy_not_found", async () => {
    mockFetch(async () => makeResponse("not found", { status: 404 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "vacancy_not_found",
    });
  });

  it("403 -> hh_access_denied", async () => {
    mockFetch(async () => makeResponse("forbidden", { status: 403 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "hh_access_denied",
    });
  });

  it("401 -> hh_access_denied", async () => {
    mockFetch(async () => makeResponse("unauthorized", { status: 401 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "hh_access_denied",
    });
  });

  it("429 -> rate_limited", async () => {
    mockFetch(async () => makeResponse("too many", { status: 429 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("500 -> upstream_error", async () => {
    mockFetch(async () => makeResponse("boom", { status: 500 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "upstream_error",
    });
  });

  it("503 -> upstream_error", async () => {
    mockFetch(async () => makeResponse("unavailable", { status: 503 }));
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "upstream_error",
    });
  });
});

// ---------- Timeout ----------

describe("fetchHHVacancyPage — timeout", () => {
  it("times out via AbortSignal and maps to timeout error", async () => {
    const slowFetch: FetchMock = (input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted due to timeout");
          error.name = "TimeoutError";
          reject(error);
        });
      });
    await expect(
      fetchHHVacancyPage("https://hh.ru/vacancy/1", {
        timeoutMs: 5,
        fetchImpl: slowFetch as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

// ---------- Response size cap ----------

describe("fetchHHVacancyPage — response size cap", () => {
  it("rejects declared Content-Length above cap", async () => {
    const huge = "x".repeat(100);
    mockFetch(async () =>
      makeResponse(huge, {
        headers: { "Content-Length": String(5 * 1024 * 1024) },
      }),
    );
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "response_too_large",
    });
  });

  it("rejects actual body above cap (chunked, no Content-Length)", async () => {
    const huge = "x".repeat(300 * 1024);
    mockFetch(async () =>
      new Response(huge, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(
      fetchHHVacancyPage("https://hh.ru/vacancy/1", { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });
});

// ---------- Redirect policy ----------

describe("fetchHHVacancyPage — redirect policy", () => {
  it("follows redirect to allowed hh.ru host", async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://hh.ru/vacancy/135822080") {
        return makeResponse("", { status: 301, redirectUrl: "https://hh.ru/vacancy/135822081" });
      }
      return makeResponse("<html>final</html>");
    });
    const result = await fetchHHVacancyPage("https://hh.ru/vacancy/135822080");
    expect(result.html).toBe("<html>final</html>");
    expect(result.finalUrl).toBe("https://hh.ru/vacancy/135822081");
    expect(calls).toHaveLength(2);
  });

  it("follows redirect to allowed hh.ru subdomain", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      if (url === "https://hh.ru/vacancy/1") {
        return makeResponse("", { status: 302, redirectUrl: "https://api.hh.ru/vacancy/1" });
      }
      return makeResponse("<html></html>");
    });
    const result = await fetchHHVacancyPage("https://hh.ru/vacancy/1");
    expect(result.finalUrl).toBe("https://api.hh.ru/vacancy/1");
  });

  it("BLOCKS redirect to forbidden host (hh.ru → evil.com)", async () => {
    mockFetch(async (input) => {
      if (String(input) === "https://hh.ru/vacancy/1") {
        return makeResponse("", { status: 302, redirectUrl: "https://evil.com/vacancy/1" });
      }
      return makeResponse("<html>must not happen</html>");
    });
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "redirect_blocked",
    });
  });

  it("BLOCKS redirect to lookalike host", async () => {
    mockFetch(async (input) => {
      if (String(input) === "https://hh.ru/vacancy/1") {
        return makeResponse("", { status: 301, redirectUrl: "https://hh.ru.evil.com/x" });
      }
      return makeResponse("<html></html>");
    });
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "redirect_blocked",
    });
  });

  it("rejects more than 3 redirect hops", async () => {
    mockFetch(async (input) => {
      const url = String(input);
      const hop = Number(url.split("/").pop() ?? "0");
      return makeResponse("", {
        status: 302,
        redirectUrl: `https://hh.ru/vacancy/${hop + 1}`,
      });
    });
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/0")).rejects.toMatchObject({
      code: "redirect_blocked",
    });
  });

  it("redirect without Location header is a network error", async () => {
    mockFetch(async () =>
      new Response(null, { status: 302 }),
    );
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "network_error",
    });
  });
});

// ---------- Content-Type ----------

describe("fetchHHVacancyPage — content type", () => {
  it("rejects non-HTML content type", async () => {
    mockFetch(async () =>
      makeResponse("{}", {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });

  it("rejects binary content type", async () => {
    mockFetch(async () =>
      makeResponse("binary", {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    await expect(fetchHHVacancyPage("https://hh.ru/vacancy/1")).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
  });

  it("accepts HTML with charset in content type", async () => {
    mockFetch(async () => makeResponse("<html></html>"));
    const result = await fetchHHVacancyPage("https://hh.ru/vacancy/1");
    expect(result.html).toBe("<html></html>");
  });
});

// ---------- Extraction ----------

describe("extractVacancyText — JSON-LD primary source", () => {
  it("extracts description from JobPosting JSON-LD", () => {
    const { text } = extractVacancyText(FIXTURE_VACANCY_HTML);
    // HH-заголовки канонизируются в ключи существующего parser'а:
    // "Чем предстоит заниматься" / "Наши ожидания" → "Требования:".
    expect(text).toContain("разрабатывать пользовательские интерфейсы на Angular");
    expect(text).toContain("опыт работы с Angular 20+, TypeScript, RxJS");
    expect(text).toMatch(/^Требования:$/m);
    expect(text).not.toContain("<p>");
    expect(text).not.toContain("<strong>");
  });

  it("builds structured preamble for the existing parser", () => {
    const { text, fields } = extractVacancyText(FIXTURE_VACANCY_HTML);
    expect(fields.title).toBe("Frontend- разработчик (Angular)");
    expect(fields.company).toBe("БАНК УРАЛСИБ");
    expect(fields.location).toBe("Москва");
    expect(fields.experience).toBe("3–6 лет");
    expect(fields.employment).toBe("Полная занятость");
    expect(fields.workFormat).toBe("удалённо");
    expect(text).toContain("Frontend- разработчик (Angular)");
    expect(text).toContain("Компания: БАНК УРАЛСИБ");
    expect(text).toContain("Локация: Москва");
    expect(text).toContain("Опыт работы: 3–6 лет");
    expect(text).toContain("Полная занятость");
    expect(text).toContain("Формат работы: удалённо");
    // Зарплата из meta description (data-qa="vacancy-salary" отсутствует)
    expect(text).toContain("Зарплата: от 250000 до 350000 ₽");
  });

  it("ignores non-JobPosting JSON-LD blocks", () => {
    // fixture содержит второй ld+json (WebSite) — extraction должен
    // использовать только JobPosting
    const { text } = extractVacancyText(FIXTURE_VACANCY_HTML);
    expect(text).not.toContain("WebSite");
    expect(text).not.toContain("nn.hh.ru");
  });

  it("strips React hydration comments from company name", () => {
    const { fields } = extractVacancyText(FIXTURE_NO_LD_HTML);
    expect(fields.company).toBe("ООО Ромашка");
  });
});

describe("extractVacancyText — fallbacks", () => {
  it("falls back to data-qa description container when no JSON-LD", () => {
    const { text, fields } = extractVacancyText(FIXTURE_NO_LD_HTML);
    expect(fields.title).toBe("Backend Developer");
    expect(fields.company).toBe("ООО Ромашка");
    expect(fields.location).toBe("Санкт-Петербург");
    expect(text).toContain("Требования:");
    expect(text).toContain("Знание Python и PostgreSQL");
  });

  it("skips salary line when HH reports 'не указана'", () => {
    const { text } = extractVacancyText(FIXTURE_NO_LD_HTML);
    expect(text).not.toContain("Зарплата: не указана");
  });

  it("throws extraction_failed when no description found", () => {
    expect(() => extractVacancyText(FIXTURE_EMPTY_HTML)).toThrow(HHFetchError);
    try {
      extractVacancyText(FIXTURE_EMPTY_HTML);
    } catch (error) {
      expect((error as HHFetchError).code).toBe("extraction_failed");
    }
  });

  it("survives damaged JSON-LD by falling back to containers", () => {
    const damaged = FIXTURE_VACANCY_HTML.replace(
      /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
      '<script type="application/ld+json">{"broken json',
    );
    const { text } = extractVacancyText(damaged);
    expect(text).toContain("разрабатывать пользовательские интерфейсы");
  });
});

// ---------- Parser integration: extracted text → existing parser ----------

describe("extractVacancyText → parseVacancyImport integration", () => {
  it("extracted text produces a meaningful draft via the existing parser", async () => {
    const { parseVacancyImport } = await import("../../services/vacancy-import");
    const { text } = extractVacancyText(FIXTURE_VACANCY_HTML);
    const draft = parseVacancyImport({ source: "url", sourceUrl: "https://hh.ru/vacancy/135822080", text });

    expect(draft.source).toBe("url");
    expect(draft.extractedFields.title.value).toBe("Frontend- разработчик (Angular)");
    expect(draft.extractedFields.company.value).toBe("БАНК УРАЛСИБ");
    expect(draft.extractedFields.salaryFrom.value).toBe("250000");
    expect(draft.extractedFields.salaryTo.value).toBe("350000");
    expect(draft.extractedFields.location.value).toBe("Москва");
    expect(draft.extractedFields.workFormat.value).toBe("remote");
    expect(draft.extractedFields.employmentType.value).toBe("full_time");
    expect(draft.extractedFields.skills).toContain("typescript");
    expect(draft.extractedFields.requirements.length).toBeGreaterThan(0);
  });
});
