import type { ResumeVersion, Skill, Education } from "../types/resume";
import { educationLevelLabel } from "../types/resume";
import type { Vacancy } from "../types/vacancy";
import type { MatchResult, MatchedRequirement } from "../types/match";
import { scoreToLevel } from "../types/match";
import { generateId } from "../lib/ids";
import { normalizeSkill, SKILL_ALIASES } from "../lib/skills";

// ---------- Skill normalization (unified in lib/skills.ts) ----------

function extractNormalizedSkills(skills: Skill[] | string[]): string[] {
  const names = skills.map((s) => (typeof s === "string" ? s : s.name));
  return [...new Set(names.map(normalizeSkill))];
}

// ---------- Scoring weights ----------

const WEIGHTS = {
  skills: 0.40,
  requirements: 0.30,
  experience: 0.20,
  format: 0.10,
} as const;

// ---------- Skills matching ----------

function matchSkills(
  vacancySkills: string[],
  resumeSkills: string[],
): { matched: string[]; missing: string[] } {
  const resumeSet = new Set(resumeSkills.map(normalizeSkill));
  const matched: string[] = [];
  const missing: string[] = [];

  for (const raw of vacancySkills) {
    const normalized = normalizeSkill(raw);
    if (resumeSet.has(normalized)) {
      matched.push(raw);
    } else {
      missing.push(raw);
    }
  }

  return { matched, missing };
}

// ---------- Requirements matching ----------

/**
 * Word-boundary containment: the occurrence must not be glued to a
 * letter/digit on either side. Punctuation like . / - + # counts as a
 * boundary, so existing aliases (react.js, ci/cd, c#, c++) keep working,
 * while "reactive" no longer matches "react".
 */
function includesSkillToken(reqText: string, skill: string): boolean {
  if (!skill) return false;
  const isWordChar = (ch: string | undefined) =>
    ch !== undefined && /[a-zа-яё0-9_]/i.test(ch);
  let idx = reqText.indexOf(skill);
  while (idx !== -1) {
    const before = idx > 0 ? reqText[idx - 1] : undefined;
    const after = idx + skill.length < reqText.length ? reqText[idx + skill.length] : undefined;
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = reqText.indexOf(skill, idx + 1);
  }
  return false;
}

function matchRequirements(
  vacancyRequirements: Vacancy["requirements"],
  resumeSkills: string[],
  resumePositions: string[],
  resumeDescriptions: string[],
  resumeLanguages: string[] = [],
  resumeEducation: Education[] = [],
): { matched: MatchedRequirement[]; missing: MatchedRequirement[] } {
  const resumeSkillSet = new Set(resumeSkills.map(normalizeSkill));
  const allResumeText = [...resumePositions, ...resumeDescriptions]
    .join(" ")
    .toLowerCase();
  const educationText = resumeEducation.map((e) =>
    `${educationLevelLabel(e.level)} ${e.institution} ${e.degree} ${e.field}`
      .toLowerCase(),
  );

  const matched: MatchedRequirement[] = [];
  const missing: MatchedRequirement[] = [];

  for (const req of vacancyRequirements) {
    const reqText = req.text.toLowerCase();
    let isMatch = false;

    if (req.category === "skill") {
      for (const skill of resumeSkillSet) {
        if (includesSkillToken(reqText, skill)) {
          isMatch = true;
          break;
        }
      }
    }

    // Every non-skill category goes through the same word-overlap rule
    // (same normalization, same >3-char word filter, same >=50% threshold).
    // Language requirements additionally match against the resume's own
    // language list; education requirements against the Education[] fields.
    // All other categories use the existing haystack only.
    if (!isMatch && req.category !== "skill") {
      let haystack = allResumeText;
      if (req.category === "language") {
        haystack = [...resumeLanguages.map((l) => l.toLowerCase()), allResumeText]
          .filter(Boolean)
          .join(" ");
      } else if (req.category === "education") {
        haystack = [allResumeText, ...educationText].filter(Boolean).join(" ");
      }
      if (haystack.length > 0) {
        const reqWords = reqText.split(/\s+/).filter((w) => w.length > 3);
        const matches = reqWords.filter((w) => haystack.includes(w));
        if (matches.length >= Math.ceil(reqWords.length * 0.5)) {
          isMatch = true;
        }
      }
    }

    if (isMatch) {
      matched.push({
        requirementId: req.id,
        requirementText: req.text,
        status: "matched",
        confidence: 0.8,
      });
    } else {
      missing.push({
        requirementId: req.id,
        requirementText: req.text,
        status: "missing",
        confidence: 0,
      });
    }
  }

  return { matched, missing };
}

// ---------- Experience matching ----------

/**
 * Extract the MINIMUM required years from a vacancy description.
 * Ranges ("3–5 лет", "3 — 5 лет", "3-5 лет") resolve to their first number;
 * plain forms ("3 года", "3+ года", "от 3 лет", "не менее 3 лет",
 * "5 years", "5+ years") resolve to their single number.
 * Word forms without digits ("трёх лет") and glued suffixes ("3-х лет")
 * intentionally yield null (neutral score).
 */
function extractRequiredYears(description: string): number | null {
  const match = description.match(
    /(\d+)\s*(?:[-–—]\s*\d+\s*)?\+?\s*(?:лет|год|года|years)/i,
  );
  if (!match) return null;
  const years = parseInt(match[1], 10);
  return Number.isFinite(years) ? years : null;
}

function matchExperience(
  vacancyTitle: string,
  vacancyDesc: string,
  resumePositions: string[],
  resumeDescriptions: string[],
  totalYears: number,
): { score: number; risk?: string } {
  const vTitle = vacancyTitle.toLowerCase();
  const allResumeText = [...resumePositions, ...resumeDescriptions]
    .join(" ")
    .toLowerCase();

  const titleWords = vTitle.split(/\s+/).filter((w) => w.length > 2);
  const positionMatches = titleWords.filter((w) => allResumeText.includes(w));
  const positionRelevance = titleWords.length > 0
    ? positionMatches.length / titleWords.length
    : 0.5;

  let experienceRisk: string | undefined;
  let yearsScore = 1;

  const requiredYears = extractRequiredYears(vacancyDesc);
  if (requiredYears !== null) {
    if (totalYears > 0 && totalYears < requiredYears) {
      yearsScore = totalYears / requiredYears;
      experienceRisk = `В вакансии требуется ${requiredYears}+ лет опыта, подтверждено ${totalYears} года.`;
    } else if (totalYears === 0 && requiredYears > 0) {
      yearsScore = 0;
      experienceRisk = `В вакансии требуется ${requiredYears}+ лет опыта, опыт не указан.`;
    }
  }

  const score = Math.round((positionRelevance * 0.7 + yearsScore * 0.3) * 100) / 100;
  return { score: Math.min(1, score), risk: experienceRisk };
}

// ---------- Work format + Employment type matching (combined 10%) ----------

function matchFormat(
  vacancyFormat?: string,
  resumeFormat?: string,
): { score: number; risk?: string } {
  if (!vacancyFormat || !resumeFormat) {
    return { score: 0.5 };
  }
  if (vacancyFormat === "any" || resumeFormat === "any") {
    return { score: 1 };
  }
  if (vacancyFormat === resumeFormat) {
    return { score: 1 };
  }
  if (vacancyFormat === "hybrid" || resumeFormat === "hybrid") {
    return { score: 0.6, risk: "Формат работы может не полностью совпадать." };
  }
  return {
    score: 0.2,
    risk: `Вакансия предлагает ${vacancyFormat}, а вы ищете ${resumeFormat}.`,
  };
}

function matchEmploymentType(
  vacancyType?: string,
  resumeType?: string,
): { score: number; risk?: string } {
  if (!vacancyType || !resumeType) {
    return { score: 0.5 };
  }
  if (vacancyType === resumeType) {
    return { score: 1 };
  }
  // freelance ↔ part_time are somewhat compatible
  if (
    (vacancyType === "freelance" && resumeType === "part_time") ||
    (vacancyType === "part_time" && resumeType === "freelance")
  ) {
    return { score: 0.6, risk: "Тип занятости может не полностью совпадать." };
  }
  // contract ↔ part_time somewhat compatible
  if (
    (vacancyType === "contract" && resumeType === "part_time") ||
    (vacancyType === "part_time" && resumeType === "contract")
  ) {
    return { score: 0.6, risk: "Тип занятости может не полностью совпадать." };
  }
  return {
    score: 0.2,
    risk: `Вакансия предлагает ${vacancyType}, а вы ищете ${resumeType}.`,
  };
}

// ---------- Work experience duration ----------

interface MonthPoint {
  year: number;
  month: number;
}

/** Parse canonical MM/YYYY and legacy YYYY-MM into numeric parts (no Date parsing). */
function parseMonthYear(value: string): MonthPoint | null {
  const mmYyyy = /^(\d{2})\/(\d{4})$/.exec(value.trim());
  if (mmYyyy) {
    const month = parseInt(mmYyyy[1], 10);
    const year = parseInt(mmYyyy[2], 10);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }
  const yyyyMm = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (yyyyMm) {
    const year = parseInt(yyyyMm[1], 10);
    const month = parseInt(yyyyMm[2], 10);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }
  return null;
}

function monthIndexOf(point: MonthPoint): number {
  return point.year * 12 + (point.month - 1);
}

function calculateYearsExperience(
  positions: { startDate: string; endDate: string | null; isCurrent: boolean }[],
): number {
  const now = new Date();
  const nowPoint: MonthPoint = { year: now.getFullYear(), month: now.getMonth() + 1 };

  const intervals: [number, number][] = [];
  for (const pos of positions) {
    const start = parseMonthYear(pos.startDate);
    if (!start) continue;
    let end: MonthPoint | null;
    if (pos.isCurrent || !pos.endDate) {
      end = nowPoint;
    } else {
      end = parseMonthYear(pos.endDate);
      if (!end) continue;
    }
    const startIdx = monthIndexOf(start);
    const endIdx = monthIndexOf(end);
    if (endIdx <= startIdx) continue;
    intervals.push([startIdx, endIdx]);
  }

  // Union of intervals: overlapping periods are not double-counted.
  intervals.sort((a, b) => a[0] - b[0]);
  let totalMonths = 0;
  let cursor = -Infinity;
  for (const [start, end] of intervals) {
    const from = Math.max(start, cursor);
    if (end > from) {
      totalMonths += end - from;
      cursor = end;
    }
  }

  return Math.round((totalMonths / 12) * 10) / 10;
}

// ---------- Main calculate function ----------

function calculateMatch(
  vacancy: Vacancy,
  resumeVersion: ResumeVersion,
  resumeId: string,
): MatchResult {
  const vd = resumeVersion.data;
  const resumeSkills = extractNormalizedSkills(vd.skills);
  const vacancySkills = extractNormalizedSkills(vacancy.skills);

  // 1. Skills matching (40%)
  const { matched: matchedSkills, missing: missingSkills } = matchSkills(
    vacancySkills,
    resumeSkills,
  );
  // Edge case: empty vacancy skills → neutral (no penalty, no bonus)
  const skillsScore = vacancySkills.length > 0
    ? matchedSkills.length / vacancySkills.length
    : 0.5;

  // 2. Requirements matching (30%)
  const resumePositions = vd.workExperience.map((w) => w.position);
  const resumeDescriptions = vd.workExperience.map((w) => w.description);
  const { matched: matchedReqs, missing: missingReqs } = matchRequirements(
    vacancy.requirements,
    resumeSkills,
    resumePositions,
    resumeDescriptions,
    vd.languages,
    vd.education,
  );
  // Edge case: empty vacancy requirements → neutral
  const reqsScore = vacancy.requirements.length > 0
    ? matchedReqs.length / vacancy.requirements.length
    : 0.5;

  // 3. Experience matching (20%)
  const totalYears = calculateYearsExperience(vd.workExperience);
  const { score: expScore, risk: expRisk } = matchExperience(
    vacancy.title,
    vacancy.description,
    resumePositions,
    resumeDescriptions,
    totalYears,
  );

  // 4. Work format + Employment type (combined 10%)
  //    Split the 10% weight: format gets 6%, employment type gets 4%
  //    If one is missing, the other gets the full 10%
  const formatResult = matchFormat(vacancy.workFormat, vd.workFormat);
  const empResult = matchEmploymentType(vacancy.employmentType, vd.employmentType);

  const formatAvailable = vacancy.workFormat && vd.workFormat;
  const empAvailable = vacancy.employmentType && vd.employmentType;

  let formatWeight: number;
  let empWeight: number;

  if (formatAvailable && empAvailable) {
    formatWeight = 0.06;
    empWeight = 0.04;
  } else if (formatAvailable) {
    formatWeight = 0.10;
    empWeight = 0;
  } else if (empAvailable) {
    formatWeight = 0;
    empWeight = 0.10;
  } else {
    // Both missing → neutral contribution
    formatWeight = 0;
    empWeight = 0;
  }

  const formatScore = formatResult.score;
  const empScore = empResult.score;

  // Weighted score
  const raw = (
    skillsScore * WEIGHTS.skills +
    reqsScore * WEIGHTS.requirements +
    expScore * WEIGHTS.experience +
    formatScore * formatWeight +
    empScore * empWeight
  );

  const overallScore = Math.round(raw * 100);
  const level = scoreToLevel(overallScore);

  // Build risks
  const risks: string[] = [];
  if (expRisk) risks.push(expRisk);
  if (formatResult.risk) risks.push(formatResult.risk);
  if (empResult.risk) risks.push(empResult.risk);

  // Build recommendations (only if user might have the skill)
  const recommendations: string[] = [];
  for (const skill of missingSkills) {
    recommendations.push(
      `Если у вас есть опыт с ${skill} — добавьте его в резюме.`,
    );
  }

  return {
    id: generateId(),
    resumeId,
    resumeVersionId: resumeVersion.id,
    vacancyId: vacancy.id,
    overallScore,
    level,
    matchedSkills: matchedSkills.map(normalizeSkill),
    missingSkills: missingSkills.map(normalizeSkill),
    matchedRequirements: matchedReqs,
    missingRequirements: missingReqs,
    risks,
    recommendations,
    createdAt: new Date().toISOString(),
  };
}

export {
  normalizeSkill,
  extractNormalizedSkills,
  matchSkills,
  matchRequirements,
  matchExperience,
  matchFormat,
  matchEmploymentType,
  calculateYearsExperience,
  calculateMatch,
  extractRequiredYears,
  SKILL_ALIASES,
};
