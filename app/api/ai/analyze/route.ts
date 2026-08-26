import { NextResponse } from "next/server";
import type { ResumeAnalysisInput } from "@/types/resume";
import { MockAIGateway } from "@/services/ai";
import {
  OpenAICompatibleProvider,
  readOpenAICompatibleConfigFromEnv,
} from "@/services/ai-providers/server/openai-compatible";

// SERVER-ONLY route: AI_API_KEY читается здесь и никогда не покидает сервер.

export async function POST(request: Request) {
  let body: { input?: unknown; versionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Некорректное тело запроса" }, { status: 400 });
  }

  const input = body?.input;
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  if (typeof input !== "object" || input === null || !versionId) {
    return NextResponse.json({ ok: false, error: "Ожидается input и versionId" }, { status: 400 });
  }

  const analysisInput = input as ResumeAnalysisInput;
  const config = readOpenAICompatibleConfigFromEnv();
  // Mock fallback: приложение полноценно работает без AI_API_KEY.
  const provider = config
    ? new OpenAICompatibleProvider(config)
    : undefined;
  const gateway = new MockAIGateway(provider);

  try {
    const analysis = await gateway.analyzeResume(analysisInput, { versionId });
    // Секреты/model наружу не возвращаются — только результат анализа.
    return NextResponse.json({ ok: true, analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI-сервис недоступен";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

// Дополнительная защита: normalizeAnalysis вызывается внутри gateway.analyzeResume,
// поэтому malformed LLM-ответ не доходит до клиента как валидный анализ.
