import { describe, it, expect } from "vitest";
import {
  HH_RESUME_FIELDS,
  createHHWizard,
  formatConfidentText,
  formatEmploymentTypeForHH,
  formatExperienceForHH,
  formatEducationForHH,
  formatSkillsForHH,
  saveHHWizardProgress,
  loadHHWizardProgress,
} from "../../features/hh-wizard";
import { confirmField, missingField, inferField } from "../../types/confirmation";
import { InMemoryStore } from "../../lib/persistence";
import type { ResumeVersion } from "../../types/resume";

// P24: HH wizard MVP contract — human-readable formatters (no
// undefined/null/[object Object]/"(N элементов)" artifacts), 7-field
// generation order, progress idempotency, per-resume persistence isolation,
// and shape-guarded loading of damaged localStorage data.

function versionData(overrides: Partial<ResumeVersion["data"]> = {}): ResumeVersion["data"] {
  return {
    desiredPosition: confirmField("Frontend Developer"),
    summary: confirmField("Опытный разработчик интерфейсов."),
    salaryExpectation: confirmField("250000 руб."),
    location: confirmField("Москва"),
    workExperience: [],
    education: [],
    skills: [],
    languages: [],
    workFormat: "remote",
    employmentType: "full_time",
    ...overrides,
  };
}

// ---------- Formatters ----------

describe("formatConfidentText", () => {
  it("confirmed string -> trimmed value", () => {
    expect(formatConfidentText(confirmField("  Backend Developer "))).toBe("Backend Developer");
  });

  it("missing field -> empty string (not null/undefined artifacts)", () => {
    expect(formatConfidentText(missingField())).toBe("");
  });

  it("inferred field -> its value", () => {
    expect(formatConfidentText(inferField("DevOps"))).toBe("DevOps");
  });
});

describe("formatEmploymentTypeForHH", () => {
  it("known value -> project label", () => {
    expect(formatEmploymentTypeForHH("full_time")).toBe("Полная занятость");
  });

  it("unknown/missing value -> empty string", () => {
    expect(formatEmploymentTypeForHH("some_future_value")).toBe("");
    expect(formatEmploymentTypeForHH(undefined)).toBe("");
  });
});

describe("formatExperienceForHH", () => {
  it("formats a full job block: position — company, period, description, achievements", () => {
    const text = formatExperienceForHH([
      {
        id: "w1",
        company: "ООО Ромашка",
        position: "Frontend Developer",
        startDate: "01/2023",
        endDate: null,
        isCurrent: true,
        description: "Разработка интерфейсов.",
        achievements: ["Сократил TTI на 40%"],
      },
    ]);
    expect(text).toContain("Frontend Developer — ООО Ромашка");
    expect(text).toContain("01/2023 — по настоящее время");
    expect(text).toContain("Разработка интерфейсов.");
    expect(text).toContain("Достижения:");
    expect(text).toContain("• Сократил TTI на 40%");
  });

  it("separates multiple jobs into blocks", () => {
    const text = formatExperienceForHH([
      {
        id: "w1",
        company: "А",
        position: "QA",
        startDate: "01/2020",
        endDate: "12/2021",
        isCurrent: false,
        description: "",
        achievements: [],
      },
      {
        id: "w2",
        company: "Б",
        position: "Dev",
        startDate: "01/2022",
        endDate: null,
        isCurrent: true,
        description: "",
        achievements: [],
      },
    ]);
    expect(text).toContain("QA — А");
    expect(text).toContain("Dev — Б");
    expect(text.indexOf("QA — А")).toBeLessThan(text.indexOf("Dev — Б"));
  });

  it("empty input -> empty string", () => {
    expect(formatExperienceForHH([])).toBe("");
  });

  it("no missing-data artifacts in the copy text", () => {
    const text = formatExperienceForHH([
      {
        id: "w1",
        company: "А",
        position: "Dev",
        startDate: "",
        endDate: null,
        isCurrent: false,
        description: "",
        achievements: [],
      },
    ]);
    expect(text).not.toContain("undefined");
    expect(text).not.toContain("null");
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("(0 элементов)");
  });
});

describe("formatEducationForHH", () => {
  it("formats institution, degree/field, level and period", () => {
    const text = formatEducationForHH([
      {
        id: "e1",
        level: "higher",
        institution: "МГУ",
        degree: "Бакалавр",
        field: "Информатика",
        startDate: "09/2016",
        endDate: "06/2020",
        description: "",
      },
    ]);
    expect(text).toContain("МГУ");
    expect(text).toContain("Бакалавр, Информатика");
    expect(text).toContain("Высшее");
    expect(text).toContain("09/2016 — 06/2020");
  });

  it("legacy education without level -> no empty line artifacts", () => {
    const text = formatEducationForHH([
      {
        id: "e1",
        institution: "Политех",
        degree: "Инженер",
        field: "",
        startDate: "",
        endDate: null,
        description: "",
      },
    ]);
    expect(text).toBe("Политех\nИнженер");
    expect(text).not.toContain("undefined");
  });

  it("empty input -> empty string", () => {
    expect(formatEducationForHH([])).toBe("");
  });
});

describe("formatSkillsForHH", () => {
  it("skill with level -> 'Название — Уровень'", () => {
    expect(formatSkillsForHH([{ name: "React", level: "advanced" }])).toBe(
      "React — Продвинутый",
    );
  });

  it("skill without level -> name only", () => {
    expect(formatSkillsForHH([{ name: "Docker" }])).toBe("Docker");
  });

  it("multiple skills joined with commas", () => {
    const text = formatSkillsForHH([
      { name: "React", level: "advanced" },
      { name: "TypeScript", level: "intermediate" },
    ]);
    expect(text).toBe("React — Продвинутый, TypeScript — Средний");
  });

  it("empty input -> empty string", () => {
    expect(formatSkillsForHH([])).toBe("");
  });
});

// ---------- Instruction generation ----------

describe("generateInstructions (7 HH fields)", () => {
  const wizard = createHHWizard();

  it("produces exactly 7 fields in mapping order with stable keys", () => {
    const instructions = wizard.generateInstructions(versionData());
    expect(instructions).toHaveLength(7);
    expect(instructions.map((i) => i.hhFieldKey)).toEqual(
      HH_RESUME_FIELDS.map((f) => f.hhFieldKey),
    );
    expect(instructions.map((i) => i.stepNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("copyableText is human-readable resume data, not scaffold artifacts", () => {
    const instructions = wizard.generateInstructions(
      versionData({
        workExperience: [
          {
            id: "w1",
            company: "ООО Ромашка",
            position: "Dev",
            startDate: "01/2023",
            endDate: null,
            isCurrent: true,
            description: "Работа.",
            achievements: [],
          },
        ],
        skills: [{ name: "React", level: "advanced" }],
      }),
    );
    const byKey = Object.fromEntries(
      instructions.map((i) => [i.hhFieldKey, i.copyableText]),
    );
    expect(byKey.title).toBe("Frontend Developer");
    expect(byKey.salary).toBe("250000 руб.");
    expect(byKey.employment_type).toBe("Полная занятость");
    expect(byKey.experience).toContain("Dev — ООО Ромашка");
    expect(byKey.education).toBe("");
    expect(byKey.skills).toBe("React — Продвинутый");
    expect(byKey.about).toBe("Опытный разработчик интерфейсов.");
  });

  it("empty resume -> all copyableText empty, no undefined/null artifacts", () => {
    const instructions = wizard.generateInstructions(
      versionData({
        desiredPosition: missingField(),
        summary: missingField(),
        salaryExpectation: missingField(),
        employmentType: undefined,
      }),
    );
    for (const instruction of instructions) {
      expect(instruction.copyableText).toBe("");
      expect(instruction.resumeFieldValue).toBe("");
    }
  });
});

// ---------- Progress ----------

describe("progress (markCompleted / getProgress)", () => {
  const wizard = createHHWizard();

  it("0/7 for fresh instructions", () => {
    const progress = wizard.getProgress(wizard.generateInstructions(versionData()));
    expect(progress).toEqual({ completed: 0, total: 7, percent: 0 });
  });

  it("partial completion counts correctly", () => {
    const instructions = wizard.generateInstructions(versionData());
    const marked = instructions.map((i, idx) => (idx < 3 ? wizard.markCompleted(i) : i));
    expect(wizard.getProgress(marked)).toEqual({ completed: 3, total: 7, percent: 43 });
  });

  it("7/7 full completion", () => {
    const instructions = wizard
      .generateInstructions(versionData())
      .map((i) => wizard.markCompleted(i));
    expect(wizard.getProgress(instructions)).toEqual({ completed: 7, total: 7, percent: 100 });
  });
});

// ---------- Persistence ----------

describe("HH wizard progress persistence", () => {
  it("save + load round-trip", () => {
    const store = new InMemoryStore<unknown>();
    expect(saveHHWizardProgress(store, "resume-1", ["title", "skills"])).toBe(true);
    expect(loadHHWizardProgress(store, "resume-1")).toEqual(["title", "skills"]);
  });

  it("per-resume isolation: resume B does not see resume A progress", () => {
    const store = new InMemoryStore<unknown>();
    saveHHWizardProgress(store, "resume-1", ["title", "experience"]);
    expect(loadHHWizardProgress(store, "resume-2")).toBeNull();
    saveHHWizardProgress(store, "resume-2", ["about"]);
    expect(loadHHWizardProgress(store, "resume-1")).toEqual(["title", "experience"]);
    expect(loadHHWizardProgress(store, "resume-2")).toEqual(["about"]);
  });

  it("idempotent completion: no duplicates in stored ids", () => {
    const store = new InMemoryStore<unknown>();
    saveHHWizardProgress(store, "r", ["title", "title", "skills", "skills"]);
    expect(loadHHWizardProgress(store, "r")).toEqual(["title", "skills"]);
  });

  it("invalid shape / damaged data is ignored without crash", () => {
    const store = new InMemoryStore<unknown>();
    store.set("hhwizard-progress:broken", { resumeId: 42, completedFieldIds: ["title"] });
    expect(loadHHWizardProgress(store, "broken")).toBeNull();

    store.set("hhwizard-progress:broken2", "just a string");
    expect(loadHHWizardProgress(store, "broken2")).toBeNull();

    store.set("hhwizard-progress:broken3", null);
    expect(loadHHWizardProgress(store, "broken3")).toBeNull();

    store.set("hhwizard-progress:broken4", {
      resumeId: "broken4",
      completedFieldIds: ["title", "not-a-known-field"],
    });
    // Unknown-but-valid ids are filtered out; known ids survive.
    expect(loadHHWizardProgress(store, "broken4")).toEqual(["title"]);

    // Non-string entries make the whole record unusable -> safely ignored.
    store.set("hhwizard-progress:broken5", {
      resumeId: "broken5",
      completedFieldIds: ["title", 7],
    });
    expect(loadHHWizardProgress(store, "broken5")).toBeNull();
  });

  it("foreign resumeId in stored data is rejected", () => {
    const store = new InMemoryStore<unknown>();
    // Simulate a corrupted cross-write: progress of another resume id.
    store.set("hhwizard-progress:resume-1", {
      resumeId: "resume-OTHER",
      completedFieldIds: ["title"],
    });
    expect(loadHHWizardProgress(store, "resume-1")).toBeNull();
  });

  it("empty resumeId is never persisted", () => {
    const store = new InMemoryStore<unknown>();
    expect(saveHHWizardProgress(store, "", ["title"])).toBe(false);
  });

  it("store write failure reported as false (visible error contract)", () => {
    const failingStore = {
      get(): unknown {
        return null;
      },
      set(): void {
        throw new Error("QuotaExceededError");
      },
      remove(): void {
        // no-op
      },
    };
    expect(saveHHWizardProgress(failingStore, "r", ["title"])).toBe(false);
  });
});
