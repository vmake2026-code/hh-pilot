import type { Resume, ResumeAnalysisInput } from "../types/resume";
import type { Vacancy } from "../types/vacancy";
import type { ResumeAnalysis } from "../types/analysis";
import type { MatchResult, OptimizationSuggestion } from "../types/match";
import type { CoverLetter } from "../types/cover-letter";
import { generateId } from "../lib/ids";

interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
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
    void this.provider;
    return {
      id: generateId(),
      resumeId: resume.id,
      versionId: context?.versionId ?? "unknown",
      provider: this.provider.name,
      overallScore: 75,
      sections: [
        {
          section: "summary",
          score: 80,
          feedback: "Раздел 'О себе' можно усилить конкретными достижениями",
          suggestions: [
            "Добавьте цифры и результаты",
            "Сфокусируйтесь на релевантном опыте",
          ],
        },
        {
          section: "achievements",
          score: 60,
          feedback: "Добавьте измеримые достижения в описания мест работы",
          suggestions: [
            "Укажите результаты в цифрах",
            "Опишите влияние на бизнес",
          ],
        },
      ],
      summary: "Резюме содержит базовую информацию, готово к улучшению",
      strengths: ["Структурированная информация"],
      weaknesses: ["Недостаточно детализации", "Мало измеримых достижений"],
      recommendations: [
        "Добавьте конкретные достижения с цифрами в опыт работы",
        "Расширьте раздел 'О себе' под целевую должность",
      ],
      createdAt: new Date().toISOString(),
    };
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

class MockProvider implements AIGatewayProvider {
  readonly name = "mock";

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    return {
      content: `[mock] Response to: ${request.prompt.slice(0, 50)}...`,
      usage: {
        promptTokens: request.prompt.length,
        completionTokens: 50,
        totalTokens: request.prompt.length + 50,
      },
    };
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
export { MockAIGateway, MockProvider, createAIGateway, normalizeAnalysis };
