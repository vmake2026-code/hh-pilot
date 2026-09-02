import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// P11.2C: delete-flow persistence contract. UI (app/matches/page.tsx) ловит
// ошибки deleteMatchRecord и показывает visible error — это работает только
// если delete-функция честно пробрасывает write failures (P10.6 semantics).
// Здесь фиксируем контракт: delete rethrows при storage failure, успешный
// delete удаляет record + list entry, и delete НЕ каскадно — resume/vacancy
// остаются нетронутыми (существующее поведение, не redesign).

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

function makeMatchRecord(id: string, vacancyId: string, resumeId: string) {
  return {
    id,
    vacancyId,
    resumeId,
    resumeVersionId: "rv-1",
    overallScore: 75,
    level: "good" as const,
    matchedSkills: ["react"],
    missingSkills: [],
    matchedRequirements: [],
    missingRequirements: [],
    risks: [],
    recommendations: [],
    vacancyTitle: `Vacancy ${vacancyId}`,
    vacancyCompany: "Test Corp",
    resumeTitle: "My Resume",
    resumeVersionNumber: 1,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("match delete persistence contract (P11.2C)", () => {
  it("deleteMatchRecord rethrows write failure (UI must catch and show error)", async () => {
    const { saveMatchRecord } = await import("../../services/match-persistence");
    const { deleteMatchRecord } = await import("../../services/match-persistence");

    saveMatchRecord(makeMatchRecord("del-fail", "v-1", "r-1"));

    failWrites();

    // delete не должен превращать failure в success: ошибка уходит в UI-слой.
    expect(() => deleteMatchRecord("del-fail")).toThrow(/quota exceeded/);
  });

  it("successful delete removes record and list entry (existing behavior intact)", async () => {
    const { saveMatchRecord, deleteMatchRecord, getMatchRecord, listMatchRecords } =
      await import("../../services/match-persistence");

    saveMatchRecord(makeMatchRecord("del-ok", "v-1", "r-1"));
    saveMatchRecord(makeMatchRecord("del-other", "v-2", "r-2"));
    expect(getMatchRecord("del-ok")).not.toBeNull();
    expect(listMatchRecords().map((m) => m.id)).toContain("del-ok");

    deleteMatchRecord("del-ok");

    expect(getMatchRecord("del-ok")).toBeNull();
    expect(listMatchRecords().map((m) => m.id)).not.toContain("del-ok");
    // Другие записи не затронуты.
    expect(listMatchRecords().map((m) => m.id)).toContain("del-other");
  });

  it("deleteMatchRecord does not cascade into related resume/vacancy/analysis (non-cascade semantics)", async () => {
    const { saveMatchRecord, deleteMatchRecord } = await import("../../services/match-persistence");
    const { saveVacancy, getVacancy } = await import("../../services/vacancy-persistence");
    const { saveResumeRecord, getResumeRecord } = await import("../../services/resume-persistence");

    saveVacancy({
      id: "v-cas",
      title: "Vacancy v-cas",
      company: "Company v-cas",
      description: "D",
      requirements: [],
      skills: ["React"],
      responsibilities: [],
      location: "Москва",
      source: "text" as const,
      fetchedAt: "2026-01-01T00:00:00Z",
    });
    saveResumeRecord({
      id: "r-cas",
      resume: {
        id: "r-cas",
        candidateId: "c",
        title: "T",
        desiredPosition: { value: "D", level: "confirmed" as const },
        summary: { value: null, level: "missing" as const },
        salaryExpectation: { value: null, level: "missing" as const },
        location: { value: null, level: "missing" as const },
        workExperience: [],
        education: [],
        skills: [],
        languages: [],
        currentVersionId: "v1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      versions: [
        {
          id: "v1",
          resumeId: "r-cas",
          versionNumber: 1,
          data: {
            desiredPosition: { value: "D", level: "confirmed" as const },
            summary: { value: null, level: "missing" as const },
            salaryExpectation: { value: null, level: "missing" as const },
            location: { value: null, level: "missing" as const },
            workExperience: [],
            education: [],
            skills: [],
            languages: [],
            workFormat: "",
            employmentType: "",
          },
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      candidateInfo: {
        firstName: "I",
        lastName: "I",
        middleName: "",
        email: "e@e.e",
        phone: "+70000000000",
        city: "C",
      },
      workFormat: "",
      employmentType: "",
      confirmedFields: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    saveMatchRecord(makeMatchRecord("m-cas", "v-cas", "r-cas"));

    deleteMatchRecord("m-cas");

    // Resume и vacancy остаются: удаление match не каскадно.
    expect(getVacancy("v-cas")).not.toBeNull();
    expect(getResumeRecord("r-cas")).not.toBeNull();
  });
});
