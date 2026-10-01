import { describe, it, expect, vi, afterEach } from "vitest";

// P30: прямые unit-тесты OpenAICompatibleProvider.complete.
// До P30 класс исполнялся только сквозь app/api/ai/analyze/route.ts
// (31 тест в ai-analyze-route.test.ts) — каждая ветка provider'а проверялась
// вместе со всем route-пайплайном. Здесь ветки изолированы: ни route, ни
// rate limiter, ни gateway не участвуют.
//
// Реальный провайдер НЕ вызывается: единственный seam — globalThis.fetch,
// который полностью подменяется. Все ответы — настоящие объекты Response.

import {
  OpenAICompatibleProvider,
  type OpenAICompatibleConfig,
} from "../../services/ai-providers/server/openai-compatible";

const CONFIG: OpenAICompatibleConfig = {
  baseUrl: "https://provider.test/v1",
  model: "gpt-4o-mini",
  apiKey: "SECRET-TEST-KEY",
};

interface CapturedCall {
  url: string;
  init: RequestInit;
  body: {
    model: string;
    max_tokens: number;
    messages: { role: string; content: string }[];
  };
}

/** Replaces global fetch with a stub and captures the outgoing request. */
function stubFetch(
  responder: (call: CapturedCall) => Response | Promise<Response>,
): { calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const call: CapturedCall = {
      url: String(url),
      init,
      body: JSON.parse(String(init.body)) as CapturedCall["body"],
    };
    calls.push(call);
    return responder(call);
  });
  return { calls };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completionResponse(content: string, usage?: Record<string, number>): Response {
  return jsonResponse({
    choices: [{ message: { role: "assistant", content } }],
    ...(usage ? { usage } : {}),
  });
}

const originalFetch = globalThis.fetch;

/** Awaits a promise that must reject and returns the rejection reason. */
async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected the call to reject, but it resolved");
}

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ---------- provider identity ----------

describe("OpenAICompatibleProvider identity (P30)", () => {
  it("exposes the provider name used in the analysis contract", () => {
    expect(new OpenAICompatibleProvider(CONFIG).name).toBe("openai-compatible");
  });

  it("keeps the config in a single own property (TS private is compile-time only)", () => {
    const provider = new OpenAICompatibleProvider(CONFIG);
    expect(Object.keys(provider).sort()).toEqual(["config", "name"]);
    // `config` is a TS-private field: erased by the compiler, but a normal
    // enumerable own property at runtime.
    const runtimeConfig = (provider as unknown as { config: OpenAICompatibleConfig }).config;
    expect(runtimeConfig).toEqual(CONFIG);
  });
});

// ---------- success path ----------

describe("OpenAICompatibleProvider.complete — success (P30)", () => {
  it("returns the assistant content and maps usage counters", async () => {
    const { calls } = stubFetch(() =>
      completionResponse("{\"score\":80}", {
        prompt_tokens: 11,
        completion_tokens: 22,
        total_tokens: 33,
      }),
    );

    const result = await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "ignored because userPrompt wins",
      userPrompt: "analyze",
      systemPrompt: "system rules",
    });

    expect(result.content).toBe("{\"score\":80}");
    expect(result.usage).toEqual({
      promptTokens: 11,
      completionTokens: 22,
      totalTokens: 33,
    });
    expect(calls).toHaveLength(1);
  });

  it("defaults all usage counters to 0 when the provider omits usage", async () => {
    stubFetch(() => completionResponse("ok"));

    const result = await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "p",
    });

    expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  });

  it("partially filled usage keeps missing counters at 0", async () => {
    stubFetch(() => completionResponse("ok", { prompt_tokens: 7 }));

    const result = await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" });

    expect(result.usage).toEqual({ promptTokens: 7, completionTokens: 0, totalTokens: 0 });
  });

  it("preserves surrounding whitespace in content (only emptiness is rejected)", async () => {
    stubFetch(() => completionResponse("  padded  "));

    const result = await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" });

    expect(result.content).toBe("  padded  ");
  });
});

// ---------- outgoing request shape ----------

describe("OpenAICompatibleProvider.complete — request shape (P30)", () => {
  it("posts JSON to <baseUrl>/chat/completions with a bearer token header", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" });

    const call = calls[0];
    expect(call.url).toBe("https://provider.test/v1/chat/completions");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer SECRET-TEST-KEY");
  });

  it("never puts the api key into the request body", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "p",
      systemPrompt: "s",
    });

    // The secret travels ONLY in the Authorization header.
    expect(JSON.stringify(calls[0].body)).not.toContain("SECRET-TEST-KEY");
    expect(JSON.stringify(calls[0].init.headers)).toContain("SECRET-TEST-KEY");
  });

  it("builds system + user messages when a system prompt is provided", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "legacy prompt",
      systemPrompt: "be strict",
      userPrompt: "the user text",
    });

    expect(calls[0].body.messages).toEqual([
      { role: "system", content: "be strict" },
      { role: "user", content: "the user text" },
    ]);
  });

  it("omits the system message entirely when no system prompt is given", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "only prompt" });

    expect(calls[0].body.messages).toEqual([{ role: "user", content: "only prompt" }]);
  });

  it("falls back to prompt when userPrompt is absent", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "fallback text" });

    expect(calls[0].body.messages[0]).toEqual({ role: "user", content: "fallback text" });
  });

  it("prefers userPrompt over prompt when both are present", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "P",
      userPrompt: "U",
    });

    expect(calls[0].body.messages[0].content).toBe("U");
  });

  it("uses the configured model verbatim", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider({
      ...CONFIG,
      model: "some/custom-model:v2",
    }).complete({ prompt: "p" });

    expect(calls[0].body.model).toBe("some/custom-model:v2");
  });

  it("defaults max_tokens to 2000 and honours an explicit value", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));
    const provider = new OpenAICompatibleProvider(CONFIG);

    await provider.complete({ prompt: "p" });
    await provider.complete({ prompt: "p", maxTokens: 128 });

    expect(calls[0].body.max_tokens).toBe(2000);
    expect(calls[1].body.max_tokens).toBe(128);
    expect(typeof calls[0].body.max_tokens).toBe("number");
  });

  it("P12.4: sampling parameters are never sent to the provider", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({
      prompt: "p",
      temperature: 0.7,
    });

    const serialized = JSON.stringify(calls[0].body);
    expect(serialized).not.toContain("temperature");
    expect(serialized).not.toContain("top_p");
    expect(serialized).not.toContain("top_k");
  });

  it("attaches an abort signal so the request can time out", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));

    await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" });

    expect(calls[0].init.signal).toBeDefined();
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });
});

// ---------- HTTP failure path ----------

describe("OpenAICompatibleProvider.complete — HTTP failures (P30)", () => {
  it("throws an Error naming the HTTP status", async () => {
    stubFetch(() => new Response("nope", { status: 500 }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("includes the upstream body (truncated) for server-side logging", async () => {
    stubFetch(() => new Response("upstream says no", { status: 502 }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/upstream says no/);
  });

  it("truncates a huge upstream body to 500 characters", async () => {
    const huge = "z".repeat(5000);
    stubFetch(() => new Response(huge, { status: 500 }));

    const error = await captureError(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    );

    expect(error.message).toContain("HTTP 500");
    expect(error.message).not.toContain(huge);
    expect(error.message.length).toBeLessThan(700);
  });

  it("still throws the status when the error body cannot be read", async () => {
    stubFetch(() => {
      const response = new Response("partial", { status: 503 });
      response.text = async () => {
        throw new Error("body stream closed");
      };
      return response;
    });

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/HTTP 503$/);
  });

  it("propagates a 429 as a plain Error (rate-limit classification happens upstream)", async () => {
    stubFetch(() => new Response("slow down", { status: 429 }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/HTTP 429/);
  });
});

// ---------- malformed / empty payload ----------

describe("OpenAICompatibleProvider.complete — invalid payloads (P30)", () => {
  it("rejects an empty content string", async () => {
    stubFetch(() => completionResponse(""));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/пустой ответ/);
  });

  it("rejects whitespace-only content", async () => {
    stubFetch(() => completionResponse("   \n\t "));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/пустой ответ/);
  });

  it("rejects a payload with no choices at all", async () => {
    stubFetch(() => jsonResponse({ id: "x", usage: {} }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/пустой ответ/);
  });

  it("rejects a choice without a message", async () => {
    stubFetch(() => jsonResponse({ choices: [{}] }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/пустой ответ/);
  });

  it("rejects a message without content", async () => {
    stubFetch(() => jsonResponse({ choices: [{ message: { role: "assistant" } }] }));

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/пустой ответ/);
  });

  it("uses only the first choice", async () => {
    stubFetch(() =>
      jsonResponse({
        choices: [
          { message: { content: "first" } },
          { message: { content: "second" } },
        ],
      }),
    );

    const result = await new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" });

    expect(result.content).toBe("first");
  });

  it("propagates a non-JSON 200 body as a parse error", async () => {
    stubFetch(
      () => new Response("<html>not json</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    );

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow();
  });
});

// ---------- transport failures ----------

describe("OpenAICompatibleProvider.complete — transport failures (P30)", () => {
  it("does not swallow a network rejection", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("fetch failed");
    });

    await expect(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    ).rejects.toThrow(/fetch failed/);
  });

  it("does not swallow an abort/timeout rejection", async () => {
    const abort = new Error("This operation was aborted");
    abort.name = "TimeoutError";
    vi.stubGlobal("fetch", async () => {
      throw abort;
    });

    const error = await captureError(
      new OpenAICompatibleProvider(CONFIG).complete({ prompt: "p" }),
    );

    expect(error.name).toBe("TimeoutError");
  });

  it("makes exactly one network call per complete() invocation", async () => {
    const { calls } = stubFetch(() => completionResponse("ok"));
    const provider = new OpenAICompatibleProvider(CONFIG);

    await provider.complete({ prompt: "p" });
    await provider.complete({ prompt: "p" });

    expect(calls).toHaveLength(2);
  });

  it("makes no network call when construction only happens", () => {
    const { calls } = stubFetch(() => completionResponse("ok"));
    new OpenAICompatibleProvider(CONFIG);
    expect(calls).toHaveLength(0);
  });
});