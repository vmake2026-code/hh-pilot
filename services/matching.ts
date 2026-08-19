import type { ResumeVersion, Skill } from "../types/resume";
import type { Vacancy } from "../types/vacancy";
import type { MatchResult, MatchedRequirement } from "../types/match";
import { scoreToLevel } from "../types/match";
import { generateId } from "../lib/ids";

// ---------- Skill normalization ----------

const SKILL_ALIASES: Record<string, string> = {
  "react.js": "react",
  "reactjs": "react",
  "react": "react",
  "node.js": "node",
  "nodejs": "node",
  "node": "node",
  "javascript": "javascript",
  "js": "javascript",
  "typescript": "typescript",
  "ts": "typescript",
  "postgresql": "postgresql",
  "postgres": "postgresql",
  "psql": "postgresql",
  "vue.js": "vue",
  "vuejs": "vue",
  "vue": "vue",
  "angular.js": "angular",
  "angularjs": "angular",
  "next.js": "nextjs",
  "nextjs": "nextjs",
  "next": "nextjs",
  "nuxt.js": "nuxtjs",
  "nuxtjs": "nuxtjs",
  "nuxt": "nuxtjs",
  "graphql": "graphql",
  "graph ql": "graphql",
  "docker": "docker",
  "kubernetes": "kubernetes",
  "k8s": "kubernetes",
  "redis": "redis",
  "mongodb": "mongodb",
  "mongo": "mongodb",
  "git": "git",
  "github": "git",
  "gitlab": "git",
  "css": "css",
  "html": "html",
  "sass": "sass",
  "scss": "sass",
  "tailwind": "tailwind",
  "tailwindcss": "tailwind",
  "python": "python",
  "py": "python",
  "java": "java",
  "c#": "csharp",
  "csharp": "csharp",
  "golang": "go",
  "go": "go",
  "rust": "rust",
  "php": "php",
  "ruby": "ruby",
  "rails": "rails",
  "ruby on rails": "rails",
  "mysql": "mysql",
  "sql": "sql",
  "nosql": "nosql",
  "aws": "aws",
  "amazon web services": "aws",
  "gcp": "gcp",
  "google cloud": "gcp",
  "azure": "azure",
  "linux": "linux",
  "figma": "figma",
  "sketch": "sketch",
  "adobe xd": "xd",
  "xd": "xd",
  "rest": "rest",
  "rest api": "rest",
  "restful": "rest",
  "rest apis": "rest",
  "grpc": "grpc",
  "websockets": "websockets",
  "ci/cd": "cicd",
  "cicd": "cicd",
  "jenkins": "jenkins",
  "terraform": "terraform",
  "ansible": "ansible",
  "webpack": "webpack",
  "vite": "vite",
  "babel": "babel",
  "eslint": "eslint",
  "prettier": "prettier",
  "jira": "jira",
  "confluence": "confluence",
  "agile": "agile",
  "scrum": "scrum",
};

function normalizeSkill(raw: string): string {
  let s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  s = s.replace(/[\.\-\/]/g, (m) => (m === "." ? "" : m === "-" ? "" : " "));
  s = s.replace(/\s+/g, " ").trim();
  return SKILL_ALIASES[s] ?? s;
}

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

function matchRequirements(
  vacancyRequirements: Vacancy["requirements"],
  resumeSkills: string[],
  resumePositions: string[],
  resumeDescriptions: string[],
): { matched: MatchedRequirement[]; missing: MatchedRequirement[] } {
  const resumeSkillSet = new Set(resumeSkills.map(normalizeSkill));
  const allResumeText = [...resumePositions, ...resumeDescriptions]
    .join(" ")
    .toLowerCase();

  const matched: MatchedRequirement[] = [];
  const missing: MatchedRequirement[] = [];

  for (const req of vacancyRequirements) {
    const reqText = req.text.toLowerCase();
    let isMatch = false;

    if (req.category === "skill") {
      for (const skill of resumeSkillSet) {
        if (reqText.includes(skill)) {
          isMatch = true;
          break;
        }
      }
    }

    if (!isMatch && (req.category === "experience" || req.category === "education")) {
      if (allResumeText.length > 0) {
        const reqWords = reqText.split(/\s+/).filter((w) => w.length > 3);
        const matches = reqWords.filter((w) => allResumeText.includes(w));
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

  const yearsMatch = vacancyDesc.match(/(\d+)\+?\s*(?:лет|год|года|years)/i);
  if (yearsMatch) {
    const requiredYears = parseInt(yearsMatch[1], 10);
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

function calculateYearsExperience(
  positions: { startDate: string; endDate: string | null; isCurrent: boolean }[],
): number {
  let totalMonths = 0;
  const now = new Date();

  for (const pos of positions) {
    if (!pos.startDate) continue;
    const start = new Date(pos.startDate);
    if (isNaN(start.getTime())) continue;
    const end = pos.isCurrent ? now : pos.endDate ? new Date(pos.endDate) : now;
    if (isNaN(end.getTime())) continue;
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months > 0) totalMonths += months;
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
  SKILL_ALIASES,
};
