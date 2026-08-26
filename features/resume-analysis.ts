import type { Resume, ResumeAnalysisInput, ResumeRecord } from "../types/resume";
import type { ResumeAnalysis } from "../types/analysis";
import { missingField } from "../types/confirmation";
import { createAIGateway, normalizeAnalysis } from "../services/ai";
import type { AIGateway } from "../services/ai";
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

export type AnalysisOutcome =
  | { ok: true; analysis: ResumeAnalysis }
  | { ok: false; error: string };

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
  } catch {
    return { ok: false, error: "AI-сервис недоступен" };
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
