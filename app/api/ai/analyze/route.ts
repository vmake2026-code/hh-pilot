import { NextResponse } from "next/server";
import type { ResumeAnalysisInput } from "@/types/resume";
import { MockAIGateway, MockProvider } from "@/services/ai";
import type { AIGatewayProvider } from "@/services/ai";
import {
  OpenAICompatibleProvider,
  readOpenAICompatibleConfigFromEnv,
} from "@/services/ai-providers/server/openai-compatible";

// SERVER-ONLY route: AI_API_KEY читается здесь и никогда не покидает сервер.

// JS string length (UTF-16 code units), not UTF-8 byte length.
const MAX_INPUT_CHARS = 64 * 1024;

/**
 * P10.3A: провайдерские сообщения не уходят клиенту.
 * Наружу — только generic-текст и стабильный code; причина остаётся в server log.
 */
function classifyProviderError(error: unknown): { error: string; code: string } {
  const message = error instanceof Error ? error.message : "";

  if (/HTTP 429(?!\d)/.test(message)) {
    return { error: "AI-сервис временно недоступен", code: "provider_rate_limited" };
  }
  if (/HTTP \d{3}/.test(message)) {
    return { error: "AI-сервис временно недоступен", code: "provider_error" };
  }
  if (/пустой или некорректный ответ|не соответствующий схеме|пустой ответ/.test(message)) {
    return { error: "AI вернул некорректный ответ", code: "provider_invalid_response" };
  }
  return { error: "AI-сервис недоступен", code: "provider_unavailable" };
}

export async function POST(request: Request) {
  let body: { input?: unknown; versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Некорректное тело запроса", code: "invalid_body" },
      { status: 400 },
    );
  }

  const input = body?.input;
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  if (typeof input !== "object" || input === null || !versionId) {
    return NextResponse.json(
      { ok: false, error: "Ожидается input и versionId", code: "invalid_input" },
      { status: 400 },
    );
  }

  if (JSON.stringify(input).length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { ok: false, error: "Резюме слишком большое для анализа", code: "input_too_large" },
      { status: 413 },
    );
  }

  const configResult = readOpenAICompatibleConfigFromEnv();

  // P10.3A: неполная/отсутствующая конфигурация — явная ошибка, а не mock fallback.
  if (configResult.kind === "invalid") {
    console.error(
      `[ai] provider configuration invalid; missing: ${configResult.missing.join(", ")}`,
    );
    return NextResponse.json(
      { ok: false, error: "AI-анализ не настроен", code: "ai_not_configured" },
      { status: 503 },
    );
  }

  let provider: AIGatewayProvider;
  if (configResult.kind === "configured") {
    provider = new OpenAICompatibleProvider(configResult.config);
  } else {
    console.warn("[ai] provider=mock (explicit AI_PROVIDER=mock)");
    provider = new MockProvider();
  }

  const analysisInput = input as ResumeAnalysisInput;
  const gateway = new MockAIGateway(provider);

  try {
    const analysis = await gateway.analyzeResume(analysisInput, { versionId });
    // Секреты/model наружу не возвращаются — только результат анализа.
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    // Полная причина — только в server log; конфиг с ключом не сериализуется.
    console.error("[ai] provider error", error);
    const sanitized = classifyProviderError(error);
    return NextResponse.json({ ok: false, ...sanitized }, { status: 502 });
  }
}

// Дополнительная защита: normalizeAnalysis вызывается внутри gateway.analyzeResume,
// поэтому malformed LLM-ответ не доходит до клиента как валидный анализ.
