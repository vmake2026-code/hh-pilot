import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WizardData } from "../../features/resume-wizard";
import type { ResumeRecord } from "../../types/resume";
import { confirmField, missingField } from "../../types/confirmation";

// P10.6 F1: save failure paths не должны молча обрывать flow. Проверяем, что
// feature-функции (finalizeResume/createNewVersion) честно пробрасывают
// persistence-ошибки наверх (их ловит wizard handler и показывает error state),
// и что семантика save* не изменилась: write failure = throw, не success.
//
// Сервисы создают stores при import: динамический import после stub
// window.localStorage даёт LocalStorageStore на нашем fake — как в браузере.

function makeFakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string): string | null {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      data.set(key, value);
    },
    removeItem(key: string): void {
      data.delete(key);
    },
  };
}

type FakeStorage = ReturnType<typeof makeFakeStorage>;

let storage: FakeStorage;

beforeEach(() => {
  storage = makeFakeStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

function failWrites(): void {
  storage.setItem = () => {
    throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
  };
}

function confirmedAll(): Set<string> {
  return new Set(["phone", "email", "desiredPosition"]);
}

function makeWizardData(): WizardData {
  return {
    firstName: "Иван",
    lastName: "Иванов",
    middleName: "",
    city: "Москва",
    phone: "+79999999999",
    email: "test@example.com",
    desiredPosition: "Frontend Developer",
    desiredSalary: "300000",
    workFormat: "remote",
    employmentType: "full_time",
    workExperience: [
      { id: "w1", company: "Example", position: "Dev", startDate: "01/2020", endDate: null, isCurrent: true, description: "React", achievements: [] },
    ],
    education: [],
    skills: [{ name: "React" }],
    summary: "",
    languages: [],
  };
}

function makeRecord(): ResumeRecord {
  const now = "2026-01-01T00:00:00Z";
  return {
    id: "res-1",
    resume: {
      id: "res-1",
      candidateId: "cand-1",
      title: "Resume",
      desiredPosition: confirmField("Dev"),
      summary: missingField(),
      salaryExpectation: missingField(),
      location: confirmField("Moscow"),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId: "v1",
      createdAt: now,
      updatedAt: now,
    },
    versions: [
      {
        id: "v1",
        resumeId: "res-1",
        versionNumber: 1,
        data: {
          desiredPosition: confirmField("Dev"),
          summary: missingField(),
          salaryExpectation: missingField(),
          location: confirmField("Moscow"),
          workExperience: [],
          education: [],
          skills: [],
          languages: [],
          workFormat: "remote",
          employmentType: "full_time",
        },
        createdAt: now,
      },
    ],
    candidateInfo: {
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "",
      email: "test@example.com",
      phone: "+79999999999",
      city: "Москва",
    },
    workFormat: "remote",
    employmentType: "full_time",
    confirmedFields: ["phone", "email", "desiredPosition"],
    createdAt: now,
    updatedAt: now,
  };
}

describe("wizard save failure propagation (P10.6 F1)", () => {
  it("finalizeResume rethrows persistence write failure (handler must catch)", async () => {
    const { finalizeResume } = await import("../../features/resume-wizard");
    failWrites();

    expect(() => finalizeResume(makeWizardData(), confirmedAll())).toThrow(/quota exceeded/);
  });

  it("createNewVersion rethrows persistence write failure", async () => {
    const { createNewVersion } = await import("../../features/resume-wizard");
    const { saveResumeRecord } = await import("../../services/resume-persistence");
    const record = makeRecord();
    saveResumeRecord(record); // запись существует до injection

    failWrites();

    expect(() =>
      createNewVersion(makeWizardData(), record, confirmedAll()),
    ).toThrow(/quota exceeded/);
  });

  it("successful finalize still saves and returns a record (happy path intact)", async () => {
    const { finalizeResume } = await import("../../features/resume-wizard");
    const { getResumeRecord } = await import("../../services/resume-persistence");

    const { record } = finalizeResume(makeWizardData(), confirmedAll());
    expect(getResumeRecord(record.id)).not.toBeNull();
  });
});

describe("vacancy save failure propagation (P10.6 F1)", () => {
  it("saveVacancy throws on write failure (page handler must catch)", async () => {
    const { saveVacancy } = await import("../../services/vacancy-persistence");
    failWrites();
    expect(() =>
      saveVacancy({
        id: "v-1",
        title: "T",
        company: "C",
        description: "D",
        requirements: [],
        skills: [],
        responsibilities: [],
        location: "Москва",
        source: "text",
        fetchedAt: "2026-01-01T00:00:00Z",
      }),
    ).toThrow(/quota exceeded/);
  });
});

describe("match save failure propagation (P10.6 F1)", () => {
  it("saveMatchRecord throws on write failure (page handler must catch)", async () => {
    const { saveMatchRecord } = await import("../../services/match-persistence");
    failWrites();
    expect(() =>
      saveMatchRecord({
        id: "m-1",
        vacancyId: "v",
        resumeId: "r",
        resumeVersionId: "rv",
        overallScore: 50,
        level: "partial",
        matchedSkills: [],
        missingSkills: [],
        matchedRequirements: [],
        missingRequirements: [],
        risks: [],
        recommendations: [],
        vacancyTitle: "T",
        vacancyCompany: "C",
        resumeTitle: "R",
        resumeVersionNumber: 1,
        createdAt: "2026-01-01T00:00:00Z",
      }),
    ).toThrow(/quota exceeded/);
  });
});

describe("AI analysis save path stays protected (P10.6 F1 regression)", () => {
  it("analyzeCurrentVersion save failure -> controlled error, not a crash", async () => {
    const { analyzeCurrentVersion } = await import("../../features/resume-analysis");
    failWrites();

    const outcome = await analyzeCurrentVersion(makeRecord());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error).toBe("Не удалось сохранить результат анализа");
      expect(outcome.code).toBeUndefined();
    }
  });
});
