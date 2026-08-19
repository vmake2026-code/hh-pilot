type MatchLevel = "strong" | "good" | "partial" | "weak";

interface MatchedRequirement {
  requirementId: string;
  requirementText: string;
  status: "matched" | "partial" | "missing";
  confidence: number;
  details?: string;
}

interface MatchResult {
  id: string;
  resumeId: string;
  resumeVersionId: string;
  vacancyId: string;
  overallScore: number;
  level: MatchLevel;
  matchedSkills: string[];
  missingSkills: string[];
  matchedRequirements: MatchedRequirement[];
  missingRequirements: MatchedRequirement[];
  risks: string[];
  recommendations: string[];
  createdAt: string;
}

interface OptimizationSuggestion {
  id: string;
  category:
    | "experience"
    | "education"
    | "skills"
    | "summary"
    | "format"
    | "other";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  affectedField?: string;
}

function scoreToLevel(score: number): MatchLevel {
  if (score >= 80) return "strong";
  if (score >= 60) return "good";
  if (score >= 40) return "partial";
  return "weak";
}

function levelLabel(level: MatchLevel): string {
  switch (level) {
    case "strong": return "Сильное соответствие";
    case "good": return "Хорошее соответствие";
    case "partial": return "Частичное соответствие";
    case "weak": return "Слабое соответствие";
  }
}

/**
 * MatchRecord — persisted snapshot of a match calculation.
 * Contains MatchResult data plus display metadata so history
 * never needs to re-lookup vacancy/resume for basic rendering.
 */
interface MatchRecord {
  /** Snapshot of the full MatchResult */
  id: string;
  vacancyId: string;
  resumeId: string;
  resumeVersionId: string;
  overallScore: number;
  level: MatchLevel;
  matchedSkills: string[];
  missingSkills: string[];
  matchedRequirements: MatchedRequirement[];
  missingRequirements: MatchedRequirement[];
  risks: string[];
  recommendations: string[];
  /** Display metadata — snapshot at creation time */
  vacancyTitle: string;
  vacancyCompany: string;
  resumeTitle: string;
  resumeVersionNumber: number;
  createdAt: string;
}

/** Create a MatchRecord snapshot from a runtime MatchResult. */
function toMatchRecord(
  result: MatchResult,
  vacancyTitle: string,
  vacancyCompany: string,
  resumeTitle: string,
  resumeVersionNumber: number,
): MatchRecord {
  return {
    id: result.id,
    vacancyId: result.vacancyId,
    resumeId: result.resumeId,
    resumeVersionId: result.resumeVersionId,
    overallScore: result.overallScore,
    level: result.level,
    matchedSkills: result.matchedSkills,
    missingSkills: result.missingSkills,
    matchedRequirements: result.matchedRequirements,
    missingRequirements: result.missingRequirements,
    risks: result.risks,
    recommendations: result.recommendations,
    vacancyTitle,
    vacancyCompany,
    resumeTitle,
    resumeVersionNumber,
    createdAt: result.createdAt,
  };
}

export type { MatchLevel, MatchedRequirement, MatchResult, MatchRecord, OptimizationSuggestion };
export { scoreToLevel, levelLabel, toMatchRecord };
