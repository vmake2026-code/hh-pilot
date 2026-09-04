import type { Resume, WorkExperience, Education, Skill } from "../types/resume";
import { educationLevelLabel, skillLevelLabel } from "../types/resume";
import { EMPLOYMENT_TYPE_LABELS } from "../types/candidate";
import type { EmploymentType } from "../types/candidate";
import type { Confident } from "../types/confirmation";
import { getFieldValue } from "../types/confirmation";
import type { Vacancy } from "../types/vacancy";
import type { PersistenceStore } from "../lib/persistence";
import type { HHFieldInstruction } from "../types/hh-wizard";

// ---------- Field mapping (changeable without rewriting wizard) ----------

interface HHFieldMapping {
  hhFieldKey: string;
  hhFieldName: string;
  resumeFieldPath: string;
  extractionHint: string;
  isRequired: boolean;
}

const HH_RESUME_FIELDS: HHFieldMapping[] = [
  {
    hhFieldKey: "title",
    hhFieldName: "Желаемая должность",
    resumeFieldPath: "desiredPosition",
    extractionHint: "Раздел 'Желаемая должность' в резюме",
    isRequired: true,
  },
  {
    hhFieldKey: "salary",
    hhFieldName: "Ожидаемая зарплата",
    resumeFieldPath: "salaryExpectation",
    extractionHint: "Поле 'Ожидаемая зарплата'",
    isRequired: false,
  },
  {
    hhFieldKey: "employment_type",
    hhFieldName: "Тип занятости",
    resumeFieldPath: "employmentType",
    extractionHint: "Опционально — укажите если известно",
    isRequired: false,
  },
  {
    hhFieldKey: "experience",
    hhFieldName: "Опыт работы",
    resumeFieldPath: "workExperience",
    extractionHint: "Раздел 'Опыт работы' — каждая компания отдельным блоком",
    isRequired: true,
  },
  {
    hhFieldKey: "education",
    hhFieldName: "Образование",
    resumeFieldPath: "education",
    extractionHint: "Раздел 'Образование'",
    isRequired: true,
  },
  {
    hhFieldKey: "skills",
    hhFieldName: "Навыки",
    resumeFieldPath: "skills",
    extractionHint: "Раздел 'Навыки' — перечислите через запятую",
    isRequired: false,
  },
  {
    hhFieldKey: "about",
    hhFieldName: "О себе",
    resumeFieldPath: "summary",
    extractionHint: "Краткое описание опыта и целей",
    isRequired: false,
  },
];

// ---------- Wizard interface ----------

/**
 * P24: the wizard reads the CURRENT resume version. Both Resume and
 * ResumeVersion["data"] are structurally assignable to this shape, so the
 * previous call sites (Resume, vacancy?) keep working.
 */
type HHWizardSource = Pick<
  Resume,
  | "desiredPosition"
  | "summary"
  | "salaryExpectation"
  | "workExperience"
  | "education"
  | "skills"
  | "workFormat"
  | "employmentType"
>;

interface HHWizard {
  generateInstructions(
    source: HHWizardSource,
    vacancy?: Vacancy,
  ): HHFieldInstruction[];
  markCompleted(instruction: HHFieldInstruction): HHFieldInstruction;
  getProgress(instructions: HHFieldInstruction[]): {
    completed: number;
    total: number;
    percent: number;
  };
}

// ---------- Human-readable formatters (P24) ----------
// Copy → paste ready text for the hh.ru resume form. Never produce
// undefined / null / [object Object] / "(N элементов)" artifacts: missing
// data yields an empty string, and the UI renders an explicit empty state.

/** Confident<string> → plain trimmed text ("" when missing). */
function formatConfidentText(field: Confident<string>): string {
  const value = getFieldValue(field);
  return typeof value === "string" ? value.trim() : "";
}

/** Enum value → existing project label ("" for unknown/missing). */
function formatEmploymentTypeForHH(value: string | undefined): string {
  if (!value) return "";
  return EMPLOYMENT_TYPE_LABELS[value as EmploymentType] ?? "";
}

/** "MM/YYYY — MM/YYYY" period; open-ended experience appends "по настоящее время". */
function formatPeriod(
  start: string,
  end: string | null,
  isCurrent: boolean,
): string {
  const from = start?.trim() ?? "";
  if (!from) return "";
  if (end && end.trim()) return `${from} — ${end.trim()}`;
  if (isCurrent) return `${from} — по настоящее время`;
  return from;
}

/** Each company as a separate copy-paste block. */
function formatExperienceForHH(items: WorkExperience[]): string {
  const blocks = items
    .map((item) => {
      const lines: string[] = [];
      const company = item.company?.trim() ?? "";
      const position = item.position?.trim() ?? "";
      if (position && company) lines.push(`${position} — ${company}`);
      else if (company) lines.push(company);
      else if (position) lines.push(position);
      const period = formatPeriod(item.startDate, item.endDate, item.isCurrent);
      if (period) lines.push(period);
      const description = item.description?.trim() ?? "";
      if (description) lines.push("", description);
      const achievements = (item.achievements ?? [])
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter(Boolean);
      if (achievements.length > 0) {
        lines.push("", "Достижения:");
        for (const achievement of achievements) lines.push(`• ${achievement}`);
      }
      return lines.join("\n");
    })
    .filter(Boolean);
  return blocks.join("\n\n");
}

/** Each institution as a separate copy-paste block. */
function formatEducationForHH(items: Education[]): string {
  const blocks = items
    .map((item) => {
      const lines: string[] = [];
      const institution = item.institution?.trim() ?? "";
      if (institution) lines.push(institution);
      const degree = item.degree?.trim() ?? "";
      const field = item.field?.trim() ?? "";
      if (degree && field) lines.push(`${degree}, ${field}`);
      else if (degree) lines.push(degree);
      else if (field) lines.push(field);
      const level = educationLevelLabel(item.level);
      if (level) lines.push(level);
      const period = formatPeriod(item.startDate, item.endDate, false);
      if (period) lines.push(period);
      return lines.join("\n");
    })
    .filter(Boolean);
  return blocks.join("\n\n");
}

/** "Название — Уровень" items joined with commas (hh.ru "Навыки" field grammar). */
function formatSkillsForHH(skills: Skill[]): string {
  return skills
    .map((skill) => {
      const name = skill?.name?.trim() ?? "";
      if (!name) return "";
      const level = skillLevelLabel(skill.level);
      return level ? `${name} — ${level}` : name;
    })
    .filter(Boolean)
    .join(", ");
}

// ---------- Scaffold helper (kept for API compatibility) ----------

function extractFieldValue(
  resume: Resume,
  fieldPath: string,
): string {
  const resumeRecord = resume as unknown as Record<string, unknown>;
  const value = resumeRecord[fieldPath];
  if (Array.isArray(value)) {
    return value.length > 0 ? `(${value.length} элементов)` : "(пусто)";
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("value" in obj) {
      return String(obj.value ?? "(не указано)");
    }
  }
  return String(value ?? "(не указано)");
}

// ---------- Wizard implementation (P24: production formatters) ----------

class MockHHWizard implements HHWizard {
  generateInstructions(
    source: HHWizardSource,
    vacancy?: Vacancy,
  ): HHFieldInstruction[] {
    // The vacancy parameter is part of the scaffold API and intentionally
    // unused by the MVP (same contract as the original implementation).
    void vacancy;
    const values: Record<string, string> = {
      title: formatConfidentText(source.desiredPosition),
      salary: formatConfidentText(source.salaryExpectation),
      employment_type: formatEmploymentTypeForHH(source.employmentType),
      experience: formatExperienceForHH(source.workExperience ?? []),
      education: formatEducationForHH(source.education ?? []),
      skills: formatSkillsForHH(source.skills ?? []),
      about: formatConfidentText(source.summary),
    };
    return HH_RESUME_FIELDS.map((mapping, index) => {
      const text = values[mapping.hhFieldKey] ?? "";
      return {
        hhFieldKey: mapping.hhFieldKey,
        hhFieldName: mapping.hhFieldName,
        resumeFieldPath: mapping.resumeFieldPath,
        resumeFieldValue: text,
        copyableText: text,
        isCompleted: false,
        stepNumber: index + 1,
        notes: mapping.extractionHint,
      };
    });
  }

  markCompleted(instruction: HHFieldInstruction): HHFieldInstruction {
    return { ...instruction, isCompleted: true };
  }

  getProgress(instructions: HHFieldInstruction[]) {
    const completed = instructions.filter((i) => i.isCompleted).length;
    const total = instructions.length;
    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}

function createHHWizard(): HHWizard {
  return new MockHHWizard();
}

// ---------- Progress persistence (P24) ----------
// Per-resume completion state in localStorage via the canonical
// PersistenceStore. The store instance is injected (persistDraft pattern),
// so unit tests run against the in-memory store without window mocks.

const PROGRESS_KEY_PREFIX = "hhwizard-progress:";

interface HHWizardProgressState {
  resumeId: string;
  completedFieldIds: string[];
}

const KNOWN_FIELD_KEYS = new Set(HH_RESUME_FIELDS.map((f) => f.hhFieldKey));

function progressKeyFor(resumeId: string): string {
  return PROGRESS_KEY_PREFIX + resumeId;
}

/** Shape guard: damaged/malformed localStorage data is ignored, never crashes. */
function isHHWizardProgress(value: unknown): value is HHWizardProgressState {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.resumeId === "string" &&
    o.resumeId !== "" &&
    Array.isArray(o.completedFieldIds) &&
    o.completedFieldIds.every((id) => typeof id === "string")
  );
}

/**
 * Persist write contract (P14-F2 semantics): returns true only when the
 * progress is actually persisted; the caller keeps unsaved state and
 * shows a visible error on false.
 */
function saveHHWizardProgress(
  store: PersistenceStore<unknown>,
  resumeId: string,
  completedFieldIds: Iterable<string>,
): boolean {
  if (!resumeId) return false;
  const unique = [...new Set(completedFieldIds)].filter((id) =>
    KNOWN_FIELD_KEYS.has(id),
  );
  try {
    store.set(progressKeyFor(resumeId), {
      resumeId,
      completedFieldIds: unique,
    });
    return true;
  } catch {
    return false;
  }
}

/** Persisted progress for a resume; null when absent/damaged/foreign. */
function loadHHWizardProgress(
  store: PersistenceStore<unknown>,
  resumeId: string,
): string[] | null {
  if (!resumeId) return null;
  const raw = store.get(progressKeyFor(resumeId));
  if (!isHHWizardProgress(raw)) return null;
  if (raw.resumeId !== resumeId) return null;
  const known = raw.completedFieldIds.filter((id) => KNOWN_FIELD_KEYS.has(id));
  return [...new Set(known)];
}

export type { HHFieldMapping, HHWizard, HHWizardSource, HHWizardProgressState };
export {
  HH_RESUME_FIELDS,
  MockHHWizard,
  createHHWizard,
  extractFieldValue,
  formatConfidentText,
  formatEmploymentTypeForHH,
  formatExperienceForHH,
  formatEducationForHH,
  formatSkillsForHH,
  saveHHWizardProgress,
  loadHHWizardProgress,
};
