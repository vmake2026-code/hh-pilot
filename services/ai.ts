import type { Resume, ResumeAnalysisInput } from "../types/resume";
import { buildAnalysisPrompt, ANALYSIS_JSON_MARKER } from "./ai-prompt";
import type { Vacancy } from "../types/vacancy";
import type { ResumeAnalysis } from "../types/analysis";
import type { MatchResult, OptimizationSuggestion } from "../types/match";
import type { CoverLetter } from "../types/cover-letter";
import { generateId } from "../lib/ids";

interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  userPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

interface AICompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

interface AIGatewayProvider {
  readonly name: string;
  complete(request: AICompletionRequest): Promise<AICompletionResponse>;
}

interface AIGateway {
  setProvider(provider: AIGatewayProvider): void;
  getProvider(): AIGatewayProvider;

  /** context.versionId binds the produced analysis to a ResumeVersion. */
  analyzeResume(resume: ResumeAnalysisInput, context?: { versionId?: string }): Promise<ResumeAnalysis>;
  matchResumeToVacancy(resume: Resume, vacancy: Vacancy): Promise<MatchResult>;
  generateCoverLetter(resume: Resume, vacancy: Vacancy): Promise<CoverLetter>;
  optimizeResume(resume: Resume, vacancy: Vacancy): Promise<OptimizationSuggestion[]>;
}

class MockAIGateway implements AIGateway {
  private provider: AIGatewayProvider;

  constructor(provider?: AIGatewayProvider) {
    this.provider = provider ?? new MockProvider();
  }

  setProvider(provider: AIGatewayProvider): void {
    this.provider = provider;
  }

  getProvider(): AIGatewayProvider {
    return this.provider;
  }

  async analyzeResume(resume: ResumeAnalysisInput, context?: { versionId?: string }): Promise<ResumeAnalysis> {
    // P10.2: provider path — the gateway builds the prompt and delegates
    // text generation to the configured provider, then parses/normalizes.
    const { systemPrompt, userPrompt } = buildAnalysisPrompt(resume);
    const completion = await this.provider.complete({
      prompt: userPrompt,
      systemPrompt,
      temperature: 0.2,
    });

    const extracted = extractJson(completion.content);
    if (!extracted) {
      throw new Error("AI-провайдер вернул пустой или некорректный ответ");
    }

    const validated = normalizeAnalysis({
      ...(extracted as Record<string, unknown>),
      id: generateId(),
      resumeId: resume.id,
      versionId: context?.versionId ?? "unknown",
      provider: this.provider.name,
      createdAt: new Date().toISOString(),
    });
    if (!validated) {
      throw new Error("AI-провайдер вернул результат, не соответствующий схеме анализа");
    }

    // Deterministic fallback for mock-less/broken providers is intentionally
    // NOT silent: controlled errors are handled by the orchestration layer.
    return validated;
  }

  async matchResumeToVacancy(resume: Resume, vacancy: Vacancy): Promise<MatchResult> {
    void this.provider;
    return {
      id: generateId(),
      resumeId: resume.id,
      resumeVersionId: "mock",
      vacancyId: vacancy.id,
      overallScore: 60,
      level: "partial" as const,
      matchedSkills: [],
      missingSkills: [],
      matchedRequirements: [],
      missingRequirements: vacancy.requirements.map((r) => ({
        requirementId: r.id,
        requirementText: r.text,
        status: "missing" as const,
        confidence: 0,
      })),
      risks: [],
      recommendations: [
        "Если у вас есть недостающие навыки — добавьте их в резюме",
      ],
      createdAt: new Date().toISOString(),
    };
  }

  async generateCoverLetter(resume: Resume, vacancy: Vacancy): Promise<CoverLetter> {
    void this.provider;
    return {
      id: generateId(),
      resumeId: resume.id,
      vacancyId: vacancy.id,
      subject: `Заявка на должность: ${vacancy.title}`,
      body: "Уважаемый hiring manager,\n\nЯ заинтересован в данной позиции и готов обсудить мой опыт.\n\nС уважением",
      tone: "formal",
      language: "ru",
      createdAt: new Date().toISOString(),
    };
  }

  async optimizeResume(_resume: Resume, _vacancy: Vacancy): Promise<OptimizationSuggestion[]> {
    return [
      {
        id: generateId(),
        category: "summary",
        title: "Усильте раздел 'О себе'",
        description: "Добавьте конкретные результаты и цифры",
        priority: "high",
        affectedField: "summary",
      },
    ];
  }
}

/**
 * Extract a JSON object from LLM text: handles ```json fences and
 * falls back to the outermost {...} span. Returns null when unusable.
 */
function extractJson(content: string): unknown | null {
  if (!content || !content.trim()) return null;
  let text = content.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    // fall through to brace-span extraction
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

class MockProvider implements AIGatewayProvider {
  readonly name = "mock";

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const content = this.mockAnalysisJson(request.userPrompt ?? request.prompt);
    return {
      content,
      usage: {
        promptTokens: request.prompt.length,
        completionTokens: content.length,
        totalTokens: request.prompt.length + content.length,
      },
    };
  }

  /** Deterministic analysis JSON derived from the serialized resume payload. */
  private mockAnalysisJson(userPrompt: string): string {
    const markerStart = userPrompt.indexOf(ANALYSIS_JSON_MARKER);
    let hasAchievements = false;
    let hasDates = false;
    let hasEducation = false;
    let skillCount = 0;
    if (markerStart !== -1) {
      const jsonStart = userPrompt.indexOf("{", markerStart);
      const jsonEnd = userPrompt.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        try {
          const payload = JSON.parse(userPrompt.slice(jsonStart, jsonEnd + 1)) as {
            workExperience?: { achievements?: unknown[]; startDate?: unknown; endDate?: unknown; isCurrent?: unknown }[];
            education?: unknown[];
            skills?: unknown[];
          };
          const w0 = payload.workExperience?.[0];
          hasAchievements = Array.isArray(w0?.achievements) && w0.achievements.length > 0;
          hasDates = Boolean(w0?.startDate) && (Boolean(w0?.endDate) || Boolean(w0?.isCurrent));
          hasEducation = Array.isArray(payload.education) && payload.education.length > 0;
          skillCount = Array.isArray(payload.skills) ? payload.skills.length : 0;
        } catch {
          // ignore — fall back to defaults below
        }
      }
    }

    const sections: { section: string; score: number; feedback: string; suggestions: string[] }[] = [
      {
        section: "experience",
        score: hasDates ? 80 : 50,
        feedback: hasDates ? "Опыт работы оформлен" : "Добавьте периоды работы",
        suggestions: hasDates ? ["Добавьте достижения с цифрами"] : ["Укажите даты начала и окончания"],
      },
      {
        section: "skills",
        score: Math.min(100, 40 + skillCount * 20),
        feedback: skillCount > 0 ? `Навыки указаны (${skillCount})` : "Навыки не указаны",
        suggestions: skillCount > 0 ? [] : ["Добавьте навыки"],
      },
      {
        section: "achievements",
        score: hasAchievements ? 85 : 45,
        feedback: hasAchievements ? "Есть измеримые достижения" : "Достижения не заполнены",
        suggestions: hasAchievements ? [] : ["Добавьте результаты с цифрами"],
      },
    ];
    if (hasEducation) {
      sections.push({ section: "education", score: 80, feedback: "Образование указано", suggestions: [] });
    }

    const scored = sections.map((s) => s.score);
    const overallScore = Math.round(scored.reduce((a, b) => a + b, 0) / sections.length);

    return JSON.stringify({
      overallScore,
      sections,
      summary: "Резюме проанализировано mock-провайдером по содержимому",
      strengths: [
        ...(hasAchievements ? ["Есть конкретные достижения"] : []),
        ...(hasEducation ? ["Указано образование"] : []),
      ],
      weaknesses: [
        ...(hasAchievements ? [] : ["Нет измеримых достижений"]),
        ...(hasDates ? [] : ["Не указаны периоды работы"]),
      ],
      recommendations: ["Добавьте цифры и результаты в описания опыта"],
    });
  }
}

function createAIGateway(): AIGateway {
  return new MockAIGateway();
}

// ---------- Analysis result validation (P10.1) ----------

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Manual runtime guard for AI-produced analysis objects.
 * Returns a normalized ResumeAnalysis or null when the payload is unusable —
 * malformed results must never reach persistence.
 */
function normalizeAnalysis(raw: unknown): ResumeAnalysis | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const id = o.id;
  const resumeId = o.resumeId;
  const versionId = o.versionId;
  const provider = o.provider;
  const createdAt = o.createdAt;
  const summary = o.summary;
  if (
    typeof id !== "string" || !id ||
    typeof resumeId !== "string" || !resumeId ||
    typeof versionId !== "string" || !versionId ||
    typeof provider !== "string" || !provider ||
    typeof createdAt !== "string" || !createdAt ||
    typeof summary !== "string"
  ) return null;

  if (!isValidScore(o.overallScore)) return null;

  if (!Array.isArray(o.sections)) return null;
  const sections = [];
  for (const s of o.sections) {
    if (typeof s !== "object" || s === null) return null;
    const sec = s as Record<string, unknown>;
    if (
      typeof sec.section !== "string" ||
      !isValidScore(sec.score) ||
      typeof sec.feedback !== "string" ||
      !isStringArray(sec.suggestions)
    ) return null;
    sections.push({
      section: sec.section,
      score: sec.score,
      feedback: sec.feedback,
      suggestions: [...sec.suggestions],
    });
  }

  for (const key of ["strengths", "weaknesses"] as const) {
    if (!isStringArray(o[key])) return null;
  }
  let recommendations: string[] | undefined;
  if (o.recommendations !== undefined) {
    if (!isStringArray(o.recommendations)) return null;
    recommendations = [...o.recommendations];
  }

  return {
    id,
    resumeId,
    versionId,
    provider,
    createdAt,
    summary,
    overallScore: o.overallScore,
    sections,
    strengths: [...(o.strengths as string[])],
    weaknesses: [...(o.weaknesses as string[])],
    ...(recommendations ? { recommendations } : {}),
  };
}

export type { AIGateway, AIGatewayProvider, AICompletionRequest, AICompletionResponse };
export { MockAIGateway, MockProvider, createAIGateway, normalizeAnalysis, extractJson };
