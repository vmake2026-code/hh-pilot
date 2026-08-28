// SERVER-ONLY module.
// Импортируется ТОЛЬКО из app/api/ai/analyze/route.ts.
// Содержит доступ к process.env.AI_API_KEY — никогда не попадает
// в client bundle и не должен импортироваться из client-цепочки.

import type { AIGatewayProvider, AICompletionRequest, AICompletionResponse } from "../../ai";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const TIMEOUT_MS = 30_000;

export interface OpenAICompatibleConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

/**
 * P10.3A: три различимых состояния конфигурации.
 * "mock" возможен ТОЛЬКО при явном AI_PROVIDER=mock;
 * отсутствующий/неизвестный AI_PROVIDER — это configuration error,
 * а не молчаливый fallback на mock.
 */
export type AIProviderConfigResult =
  | { kind: "configured"; config: OpenAICompatibleConfig }
  | { kind: "mock" }
  | { kind: "invalid"; missing: string[] };

/** Читает server-side env. Никогда не вызывается на клиенте. */
export function readOpenAICompatibleConfigFromEnv(): AIProviderConfigResult {
  const provider = process.env.AI_PROVIDER;

  if (!provider) return { kind: "invalid", missing: ["AI_PROVIDER"] };
  if (provider === "mock") return { kind: "mock" };
  if (provider !== "openai-compatible") {
    return { kind: "invalid", missing: ["AI_PROVIDER"] };
  }

  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const missing: string[] = [];
  if (!apiKey) missing.push("AI_API_KEY");
  if (!model) missing.push("AI_MODEL");
  if (missing.length > 0) return { kind: "invalid", missing };

  return {
    kind: "configured",
    config: {
      baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
      model: model as string,
      apiKey: apiKey as string,
    },
  };
}

export class OpenAICompatibleProvider implements AIGatewayProvider {
  readonly name = "openai-compatible";

  constructor(private readonly config: OpenAICompatibleConfig) {}

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Secret живёт только в этом server-side заголовке.
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 2000,
        messages: [
          ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
          { role: "user", content: request.userPrompt ?? request.prompt },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`AI провайдер вернул HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new Error("AI провайдер вернул пустой ответ");
    }

    return {
      content,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        totalTokens: payload.usage?.total_tokens ?? 0,
      },
    };
  }
}
