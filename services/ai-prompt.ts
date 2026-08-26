import type { ResumeAnalysisInput } from "../types/resume";

/**
 * P10.2 prompt contract for AI resume analysis.
 * Isomorphic-safe: no secrets, no PII beyond the already-privacy-locked
 * ResumeAnalysisInput payload.
 */

export const ANALYSIS_JSON_MARKER = "<resume_json>";

const SYSTEM_PROMPT = [
  "Ты — эксперт по резюме на русском языке.",
  "Проанализируй предоставленное резюме и верни оценку качества.",
  "Отвечай строго на русском языке.",
  "Не выдумывай факты: используй только данные из резюме.",
  "Не изменяй резюме и не предлагай переписать его целиком — только оценки и рекомендации.",
  "Верни ТОЛЬКО один JSON-объект без markdown, без ```json и без какого-либо дополнительного текста.",
  "Схема JSON:",
  '{"overallScore": number(0..100), "sections": [{"section": string, "score": number(0..100), "feedback": string, "suggestions": string[]}], "summary": string, "strengths": string[], "weaknesses": string[], "recommendations": string[]}',
].join("\n");

function serializePayload(input: ResumeAnalysisInput): string {
  return `${ANALYSIS_JSON_MARKER}\n${JSON.stringify(input)}\n${ANALYSIS_JSON_MARKER}`;
}

export function buildAnalysisPrompt(input: ResumeAnalysisInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      "Проанализируй это резюме и верни JSON по схеме.",
      serializePayload(input),
    ].join("\n"),
  };
}
