import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../../app/api/ai/analyze/route";
import type { ResumeAnalysisInput } from "../../types/resume";
import { confirmField, missingField } from "../../types/confirmation";

// P10.3A: контракт route boundary — configuration errors, input limit,
// санитизация провайдерских ошибок. Gateway/provider не изменялись.

const ENV_KEYS = ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL"] as const;

let savedEnv: Record<string, string | undefined>;
let savedFetch: typeof globalThis.fetch;
let warnSpy: ReturnType<typeof vi.spyOn>;

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

function makeInput(): ResumeAnalysisInput {
  return {
    id: "res-1", candidateId: "c-1", title: "T",
    desiredPosition: confirmField("Dev"), summary: missingField(),
    location: missingField(), workExperience: [], education: [],
    skills: [{ name: "React", level: "beginner" }], languages: [],
    workFormat: "", employmentType: "",
    currentVersionId: "v-1",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function analysisContent(): string {
  return JSON.stringify({
    overallScore: 77,
    sections: [{ section: "experience", score: 77, feedback: "ok", suggestions: [] }],
    summary: "s", strengths: ["a"], weaknesses: [], recommendations: [],
  });
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  clearEnv();
  savedFetch = globalThis.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  clearEnv();
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value !== undefined) process.env[key] = value;
  }
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

describe("POST /api/ai/analyze — validation (P10.3A)", () => {
  it("malformed body -> 400 invalid_body", async () => {
    const res = await POST(makeRequest("{not json"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("invalid_body");
  });

  it("missing input -> 400 invalid_input", async () => {
    const res = await POST(makeRequest({ versionId: "v-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_input");
  });

  it("missing versionId -> 400 invalid_input", async () => {
    const res = await POST(makeRequest({ input: makeInput() }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_input");
  });
});

describe("POST /api/ai/analyze — configuration (P10.3A Option B)", () => {
  it("missing AI_PROVIDER -> 503 ai_not_configured (no silent mock)", async () => {
    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("ai_not_configured");
    expect(json.error).toBe("AI-анализ не настроен");
    expect(json.analysis).toBeUndefined();
  });

  it("openai-compatible without AI_API_KEY -> 503, provider never called", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_MODEL = "gpt-4o-mini";
    let called = false;
    globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("ai_not_configured");
    expect(called).toBe(false);
  });

  it("unknown provider -> 503 ai_not_configured", async () => {
    process.env.AI_PROVIDER = "openai_compatible";
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("ai_not_configured");
  });

  it("explicit AI_PROVIDER=mock -> 200 with provider=mock and server warning", async () => {
    process.env.AI_PROVIDER = "mock";
    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.analysis.provider).toBe("mock");
    expect(json.analysis.versionId).toBe("v-1");
    expect(json.analysis.resumeId).toBe("res-1");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("provider=mock"));
  });

  it("complete openai-compatible config -> 200 with provider=openai-compatible", async () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    process.env.AI_BASE_URL = "https://provider.test/v1";
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ choices: [{ message: { content: analysisContent() } }] }),
      { status: 200 },
    )) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.analysis.provider).toBe("openai-compatible");
    expect(json.analysis.overallScore).toBe(77);
  });
});

describe("POST /api/ai/analyze — input limit (P10.3A)", () => {
  it("oversized input -> 413 input_too_large", async () => {
    process.env.AI_PROVIDER = "mock";
    const oversized = { ...makeInput(), title: "x".repeat(70 * 1024) };
    const res = await POST(makeRequest({ input: oversized, versionId: "v-1" }));
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.code).toBe("input_too_large");
  });

  it("input just under the limit is accepted", async () => {
    process.env.AI_PROVIDER = "mock";
    const nearLimit = { ...makeInput(), title: "x".repeat(60 * 1024) };
    const res = await POST(makeRequest({ input: nearLimit, versionId: "v-1" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/ai/analyze — error sanitization (P10.3A)", () => {
  function configureReal(): void {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "SECRET-TEST-KEY";
    process.env.AI_MODEL = "gpt-4o-mini";
    process.env.AI_BASE_URL = "https://provider.test/v1";
  }

  it("network failure -> 502 provider_unavailable, no internals leaked", async () => {
    configureReal();
    globalThis.fetch = (async () => { throw new Error("fetch failed"); }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    const json = JSON.parse(raw);
    expect(json.code).toBe("provider_unavailable");
    expect(json.error).toBe("AI-сервис недоступен");
    expect(raw).not.toContain("fetch failed");
    expect(raw).not.toContain("SECRET-TEST-KEY");
    expect(raw).not.toContain("provider.test");
  });

  it("provider HTTP 429 -> 502 provider_rate_limited, no raw HTTP details", async () => {
    configureReal();
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    const json = JSON.parse(raw);
    expect(json.code).toBe("provider_rate_limited");
    expect(raw).not.toContain("HTTP 429");
    expect(raw).not.toContain("SECRET-TEST-KEY");
  });

  it("HTTP 4291-like message is NOT classified as rate limited", async () => {
    configureReal();
    globalThis.fetch = (async () => {
      throw new Error("Request HTTP 4291 failed");
    }) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    const json = JSON.parse(raw);
    expect(json.code).toBe("provider_error");
    expect(json.code).not.toBe("provider_rate_limited");
  });

  it("provider HTTP 500 -> 502 provider_error", async () => {
    configureReal();
    globalThis.fetch = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    expect(JSON.parse(raw).code).toBe("provider_error");
    expect(raw).not.toContain("HTTP 500");
  });

  it("non-JSON provider content -> 502 provider_invalid_response", async () => {
    configureReal();
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ choices: [{ message: { content: "никакого json тут нет" } }] }),
      { status: 200 },
    )) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    expect(JSON.parse(raw).code).toBe("provider_invalid_response");
    expect(raw).not.toContain("AI-провайдер вернул");
  });

  it("schema-violating provider JSON -> 502 provider_invalid_response", async () => {
    configureReal();
    globalThis.fetch = (async () => new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ overallScore: "77", sections: "nope", summary: 5 }) } }],
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));
    const raw = await res.text();

    expect(res.status).toBe(502);
    expect(JSON.parse(raw).code).toBe("provider_invalid_response");
    expect(raw).not.toContain("схеме");
  });

  it("empty provider content -> 502 provider_invalid_response", async () => {
    configureReal();
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ choices: [{ message: { content: "   " } }] }),
      { status: 200 },
    )) as unknown as typeof fetch;

    const res = await POST(makeRequest({ input: makeInput(), versionId: "v-1" }));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("provider_invalid_response");
  });
});
