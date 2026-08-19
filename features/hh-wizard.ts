import type { Resume } from "../types/resume";
import type { Vacancy } from "../types/vacancy";
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

interface HHWizard {
  generateInstructions(
    resume: Resume,
    vacancy?: Vacancy,
  ): HHFieldInstruction[];
  markCompleted(instruction: HHFieldInstruction): HHFieldInstruction;
  getProgress(instructions: HHFieldInstruction[]): {
    completed: number;
    total: number;
    percent: number;
  };
}

// ---------- Mock implementation ----------

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

class MockHHWizard implements HHWizard {
  generateInstructions(
    resume: Resume,
    _vacancy?: Vacancy,
  ): HHFieldInstruction[] {
    return HH_RESUME_FIELDS.map((mapping, index) => ({
      hhFieldKey: mapping.hhFieldKey,
      hhFieldName: mapping.hhFieldName,
      resumeFieldPath: mapping.resumeFieldPath,
      resumeFieldValue: extractFieldValue(resume, mapping.resumeFieldPath),
      copyableText: extractFieldValue(resume, mapping.resumeFieldPath),
      isCompleted: false,
      stepNumber: index + 1,
      notes: mapping.extractionHint,
    }));
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

export type { HHFieldMapping, HHWizard };
export {
  HH_RESUME_FIELDS,
  MockHHWizard,
  createHHWizard,
  extractFieldValue,
};
