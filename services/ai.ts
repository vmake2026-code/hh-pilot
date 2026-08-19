import type { Resume } from "../types/resume";
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

  analyzeResume(resume: Resume, vacancy?: Vacancy): Promise<ResumeAnalysis>;
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

  async analyzeResume(resume: Resume, _vacancy?: Vacancy): Promise<ResumeAnalysis> {
    void this.provider;
    return {
      id: generateId(),
      resumeId: resume.id,
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
      ],
      summary: "Резюме содержит базовую информацию, готово к улучшению",
      strengths: ["Структурированная информация"],
      weaknesses: ["Недостаточно детализации"],
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

export type { AIGateway, AIGatewayProvider, AICompletionRequest, AICompletionResponse };
export { MockAIGateway, MockProvider, createAIGateway };
