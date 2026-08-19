import type { ResumeVersion } from "../types/resume";
import type { Vacancy } from "../types/vacancy";
import type { MatchResult, OptimizationSuggestion } from "../types/match";
import { calculateMatch } from "../services/matching";
import { generateId } from "../lib/ids";

/**
 * High-level match interface.
 * Production flow uses calculateMatch() directly with a ResumeVersion.
 * This wrapper is a convenience for code that only has a ResumeVersion.
 */
function matchResumeToVacancy(
  vacancy: Vacancy,
  resumeVersion: ResumeVersion,
  resumeId: string,
): MatchResult {
  return calculateMatch(vacancy, resumeVersion, resumeId);
}

function generateRecommendations(match: MatchResult): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const skill of match.missingSkills) {
    suggestions.push({
      id: generateId(),
      category: "skills",
      title: `Навык: ${skill}`,
      description: `Если у вас есть опыт с ${skill} — добавьте его в резюме`,
      priority: "high",
      affectedField: "skills",
    });
  }

  for (const req of match.missingRequirements) {
    suggestions.push({
      id: generateId(),
      category: "other",
      title: `Требование: ${req.requirementText}`,
      description: `Требование не найдено в резюме`,
      priority: "medium",
    });
  }

  for (const risk of match.risks) {
    suggestions.push({
      id: generateId(),
      category: "experience",
      title: "Риск",
      description: risk,
      priority: "low",
    });
  }

  return suggestions;
}

export { matchResumeToVacancy, generateRecommendations };
