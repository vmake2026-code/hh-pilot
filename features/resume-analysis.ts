import type { Resume, ResumeAnalysisInput, ResumeRecord } from "../types/resume";
import type { ResumeAnalysis } from "../types/analysis";
import { missingField } from "../types/confirmation";
import { createAIGateway, normalizeAnalysis } from "../services/ai";
import type { AIGateway } from "../services/ai";
import type { Vacancy } from "../types/vacancy";
import type { MatchResult, OptimizationSuggestion } from "../types/match";
import type { CoverLetter } from "../types/cover-letter";
import {
  saveAnalysis,
  listAnalysesForResume,
} from "../services/analysis-persistence";

/**
 * P10.1 — AI Resume Analysis orchestration.
 *
 * Reads a ResumeVersion, builds an AI input WITHOUT contact PII
 * (Resume model contains no phone/email/names by design) and without
 * salaryExpectation, sends it through the AIGateway, validates the
 * result, binds it to resumeId+versionId and persists it.
 *
 * NEVER mutates the source ResumeVersion.
 */

/**
 * P10.3B: машинно-читаемые коды, которые возвращает server route
 * /api/ai/analyze. Контракт зафиксирован в P10.3A — здесь он только
 * распознаётся, новые коды не вводятся.
 */
export const AI_ERROR_CODES = [
  "invalid_body",
  "invalid_input",
  "input_too_large",
  "ai_not_configured",
  "provider_rate_limited",
  "provider_error",
  "provider_invalid_response",
  "provider_unavailable",
] as const;

export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export function isAIErrorCode(value: unknown): value is AIErrorCode {
  return typeof value === "string" && (AI_ERROR_CODES as readonly string[]).includes(value);
}

/** Безопасный текст, когда code отсутствует или неизвестен. */
const GENERIC_AI_ERROR = "AI-сервис временно недоступен";

/**
 * P10.3B: транспортная ошибка, сохраняющая машинно-читаемый code.
 * message — только санитизированный текст route boundary либо generic;
 * технические детали провайдера сюда не попадают.
 */
export class AIAnalysisError extends Error {
  readonly code?: AIErrorCode;

  constructor(message: string, code?: AIErrorCode) {
    super(message);
    this.name = "AIAnalysisError";
    this.code = code;
  }
}

export type AnalysisOutcome =
  | { ok: true; analysis: ResumeAnalysis }
  | { ok: false; error: string; code?: AIErrorCode };

/** AI input excludes salaryExpectation (privacy) — the key is fully absent. */
function buildAnalysisInput(record: ResumeRecord, versionData: ResumeRecord["versions"][number]["data"]): ResumeAnalysisInput {
  const now = new Date().toISOString();
  const full: Resume = {
    id: record.resume.id,
    candidateId: record.resume.candidateId,
    title: record.resume.title,
    desiredPosition: versionData.desiredPosition,
    summary: versionData.summary,
    salaryExpectation: missingField(),
    location: versionData.location,
    workExperience: versionData.workExperience,
    education: versionData.education,
    skills: versionData.skills,
    languages: versionData.languages,
    workFormat: versionData.workFormat,
    employmentType: versionData.employmentType,
    currentVersionId: record.resume.currentVersionId,
    createdAt: record.createdAt,
    updatedAt: now,
  };
  // Rest-destructuring removes the own property entirely
  // (hasOwnProperty("salaryExpectation") === false).
  const { salaryExpectation: _omitted, ...input } = full;
  void _omitted;
  return input;
}

function selectCurrentVersion(record: ResumeRecord) {
  return (
    record.versions.find((v) => v.id === record.resume.currentVersionId) ??
    record.versions[record.versions.length - 1]
  );
}

export function isAnalysisStale(analysis: ResumeAnalysis, record: ResumeRecord): boolean {
  return analysis.versionId !== record.resume.currentVersionId;
}

/**
 * P10.2: client-side transport gateway. Ходит через server API route,
 * поэтому API key остаётся на сервере. Контракт AIGateway сохранён.
 */
export class RemoteAIGateway implements AIGateway {
  readonly name = "remote";

  setProvider() {
    // transport gateway — provider живёт на сервере
  }
  getProvider() {
    return { name: this.name, async complete() { return { content: "" }; } };
  }

  async analyzeResume(
    resume: ResumeAnalysisInput,
    context?: { versionId?: string },
  ): Promise<ResumeAnalysis> {
    const response = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: resume, versionId: context?.versionId ?? "" }),
    });
    const payload = (await response.json()) as
      | { ok: true; analysis: ResumeAnalysis }
      | { ok: false; error?: string; code?: string };

    if (!response.ok || !payload.ok) {
      // P10.3B: code сохраняется, message остаётся санитизированным текстом route.
      const code = "code" in payload && isAIErrorCode(payload.code) ? payload.code : undefined;
      const message = ("error" in payload && payload.error) || GENERIC_AI_ERROR;
      throw new AIAnalysisError(message, code);
    }
    return payload.analysis;
  }

  async matchResumeToVacancy(
    _resume: Resume,
    _vacancy: Vacancy,
  ): Promise<MatchResult> {
    throw new Error("Не используется в P10.2");
  }

  async generateCoverLetter(
    _resume: Resume,
    _vacancy: Vacancy,
  ): Promise<CoverLetter> {
    throw new Error("Не используется в P10.2");
  }

  async optimizeResume(
    _resume: Resume,
    _vacancy: Vacancy,
  ): Promise<OptimizationSuggestion[]> {
    throw new Error("Не используется в P10.2");
  }
}

export function selectLatestAnalysis(
  analyses: ResumeAnalysis[],
  record: ResumeRecord,
): ResumeAnalysis | null {
  const forResume = analyses.filter((a) => a.resumeId === record.resume.id);
  if (forResume.length === 0) return null;
  return forResume.reduce((latest, a) => (a.createdAt > latest.createdAt ? a : latest));
}

export async function analyzeCurrentVersion(
  record: ResumeRecord,
  gateway: AIGateway = createAIGateway(),
): Promise<AnalysisOutcome> {
  const version = selectCurrentVersion(record);
  if (!version) {
    return { ok: false, error: "У резюме нет версии для анализа" };
  }

  const input = buildAnalysisInput(record, version.data);

  let raw: unknown;
  try {
    raw = await gateway.analyzeResume(input, { versionId: version.id });
  } catch (error) {
    // P10.3B: известный server code сохраняется вместе с его санитизированным
    // текстом. Всё остальное (включая произвольные Error провайдера)
    // сводится к generic-сообщению — технические детали наружу не идут.
    if (error instanceof AIAnalysisError && error.code) {
      return { ok: false, error: error.message || GENERIC_AI_ERROR, code: error.code };
    }
    return { ok: false, error: GENERIC_AI_ERROR };
  }

  const validated = normalizeAnalysis({
    ...(typeof raw === "object" && raw !== null ? raw : {}),
    resumeId: record.resume.id,
    versionId: version.id,
    provider: gateway.getProvider().name,
  });
  if (!validated) {
    return { ok: false, error: "Получен некорректный результат анализа" };
  }

  try {
    saveAnalysis(validated);
  } catch {
    return { ok: false, error: "Не удалось сохранить результат анализа" };
  }

  return { ok: true, analysis: validated };
}

export { listAnalysesForResume };
