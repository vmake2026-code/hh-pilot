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

/** Читает server-side env. Никогда не вызывается на клиенте. */
export function readOpenAICompatibleConfigFromEnv(): OpenAICompatibleConfig | null {
  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (provider !== "openai-compatible" || !apiKey || !model) return null;
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model,
    apiKey,
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
