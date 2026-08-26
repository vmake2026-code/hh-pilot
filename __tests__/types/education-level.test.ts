import { describe, it, expect } from "vitest";
import {
  EDUCATION_LEVEL_LABELS,
  educationLevelLabel,
} from "../../types/resume";

// ---------- P9.1.1: Education level aligned with HH ----------

describe("EDUCATION_LEVEL_LABELS (P9.1.1)", () => {
  it("contains exactly the 8 HH canonical levels", () => {
    expect(Object.keys(EDUCATION_LEVEL_LABELS)).toEqual([
      "secondary",
      "secondary_special",
      "unfinished_higher",
      "higher",
      "bachelor",
      "master",
      "candidate",
      "doctor",
    ]);
  });

  it("maps every level to its Russian label", () => {
    expect(EDUCATION_LEVEL_LABELS.secondary).toBe("Среднее");
    expect(EDUCATION_LEVEL_LABELS.secondary_special).toBe("Среднее специальное");
    expect(EDUCATION_LEVEL_LABELS.unfinished_higher).toBe("Неоконченное высшее");
    expect(EDUCATION_LEVEL_LABELS.higher).toBe("Высшее");
    expect(EDUCATION_LEVEL_LABELS.bachelor).toBe("Бакалавр");
    expect(EDUCATION_LEVEL_LABELS.master).toBe("Магистр");
    expect(EDUCATION_LEVEL_LABELS.candidate).toBe("Кандидат наук");
    expect(EDUCATION_LEVEL_LABELS.doctor).toBe("Доктор наук");
  });

  it("educationLevelLabel renders Russian labels and hides legacy/undefined", () => {
    for (const level of Object.keys(EDUCATION_LEVEL_LABELS)) {
      expect(educationLevelLabel(level as never)).toBe(
        EDUCATION_LEVEL_LABELS[level as keyof typeof EDUCATION_LEVEL_LABELS],
      );
    }
    expect(educationLevelLabel(undefined)).toBe("");
  });
});
