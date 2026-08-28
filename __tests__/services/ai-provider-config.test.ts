import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readOpenAICompatibleConfigFromEnv } from "../../services/ai-providers/server/openai-compatible";

// P10.3A: конфигурация провайдера — три различимых состояния.
// Отсутствующий/неизвестный AI_PROVIDER больше НЕ означает mock.

const ENV_KEYS = ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL"] as const;

let saved: Record<string, string | undefined>;

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  clearEnv();
});

afterEach(() => {
  clearEnv();
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value !== undefined) process.env[key] = value;
  }
});

describe("readOpenAICompatibleConfigFromEnv (P10.3A)", () => {
  it("missing AI_PROVIDER -> invalid (NOT mock)", () => {
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toContain("AI_PROVIDER");
  });

  it("empty AI_PROVIDER -> invalid", () => {
    process.env.AI_PROVIDER = "";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toContain("AI_PROVIDER");
  });

  it("explicit AI_PROVIDER=mock -> mock", () => {
    process.env.AI_PROVIDER = "mock";
    expect(readOpenAICompatibleConfigFromEnv().kind).toBe("mock");
  });

  it("explicit mock ignores key/model presence", () => {
    process.env.AI_PROVIDER = "mock";
    process.env.AI_API_KEY = "irrelevant";
    process.env.AI_MODEL = "irrelevant";
    expect(readOpenAICompatibleConfigFromEnv().kind).toBe("mock");
  });

  it("unknown provider -> invalid with AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "openai_compatible"; // опечатка
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toEqual(["AI_PROVIDER"]);
  });

  it("openai-compatible without AI_API_KEY -> invalid", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_MODEL = "gpt-4o-mini";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toEqual(["AI_API_KEY"]);
  });

  it("openai-compatible without AI_MODEL -> invalid", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "test-key";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toEqual(["AI_MODEL"]);
  });

  it("openai-compatible without key and model -> both missing", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.missing).toEqual(["AI_API_KEY", "AI_MODEL"]);
  });

  it("complete config -> configured", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    const result = readOpenAICompatibleConfigFromEnv();
    expect(result.kind).toBe("configured");
    if (result.kind !== "configured") return;
    expect(result.config.apiKey).toBe("test-key");
    expect(result.config.model).toBe("gpt-4o-mini");
  });

  it("default base URL when AI_BASE_URL is absent", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    const result = readOpenAICompatibleConfigFromEnv();
    if (result.kind !== "configured") throw new Error("expected configured");
    expect(result.config.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("normalizes trailing slashes in AI_BASE_URL", () => {
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gpt-4o-mini";
    process.env.AI_BASE_URL = "https://example.test/v1///";
    const result = readOpenAICompatibleConfigFromEnv();
    if (result.kind !== "configured") throw new Error("expected configured");
    expect(result.config.baseUrl).toBe("https://example.test/v1");
  });
});
