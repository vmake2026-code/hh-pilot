import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// P11.2B: delete-flow persistence contract. UI (app/vacancies/page.tsx) ловит
// ошибки deleteVacancy и показывает visible error — это работает только если
// delete-функция честно пробрасывает write failures (P10.6 semantics).
// Здесь фиксируем контракт: delete rethrows при storage failure, успешный
// delete удаляет record + list entry, и delete НЕ каскадно — связанные
// match snapshots остаются (существующее поведение, не redesign).

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

function makeVacancy(id: string) {
  return {
    id,
    title: `Vacancy ${id}`,
    company: `Company ${id}`,
    description: `Description ${id}`,
    requirements: [],
    skills: ["React"],
    responsibilities: [],
    location: "Москва",
    source: "text" as const,
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

describe("vacancy delete persistence contract (P11.2B)", () => {
  it("deleteVacancy rethrows write failure (UI must catch and show error)", async () => {
    const { saveVacancy } = await import("../../services/vacancy-persistence");
    const { deleteVacancy } = await import("../../services/vacancy-persistence");

    saveVacancy(makeVacancy("del-fail"));

    failWrites();

    // delete не должен превращать failure в success: ошибка уходит в UI-слой.
    expect(() => deleteVacancy("del-fail")).toThrow(/quota exceeded/);
  });

  it("successful delete removes record and list entry (existing behavior intact)", async () => {
    const { saveVacancy, deleteVacancy, getVacancy, listVacancies } = await import(
      "../../services/vacancy-persistence"
    );

    saveVacancy(makeVacancy("del-ok"));
    saveVacancy(makeVacancy("del-other"));
    expect(getVacancy("del-ok")).not.toBeNull();
    expect(listVacancies().map((v) => v.id)).toContain("del-ok");

    deleteVacancy("del-ok");

    expect(getVacancy("del-ok")).toBeNull();
    expect(listVacancies().map((v) => v.id)).not.toContain("del-ok");
    // Другие вакансии не затронуты.
    expect(listVacancies().map((v) => v.id)).toContain("del-other");
  });

  it("deleteVacancy does not cascade into related match records (non-cascade semantics)", async () => {
    const { saveVacancy, deleteVacancy } = await import("../../services/vacancy-persistence");
    const { saveMatchRecord, getMatchRecord, listMatchRecords } = await import(
      "../../services/match-persistence"
    );
    const { saveAnalysis, getAnalysis } = await import("../../services/analysis-persistence");

    saveVacancy(makeVacancy("v-cas"));
    saveMatchRecord({
      id: "m-cas",
      vacancyId: "v-cas",
      resumeId: "r-cas",
      resumeVersionId: "rv-cas",
      overallScore: 75,
      level: "good",
      matchedSkills: ["react"],
      missingSkills: [],
      matchedRequirements: [],
      missingRequirements: [],
      risks: [],
      recommendations: [],
      vacancyTitle: "Vacancy v-cas",
      vacancyCompany: "Company v-cas",
      resumeTitle: "R",
      resumeVersionNumber: 1,
      createdAt: "2026-01-01T00:00:00Z",
    });
    saveAnalysis({
      id: "an-cas",
      resumeId: "r-cas",
      versionId: "rv-cas",
      provider: "mock",
      overallScore: 75,
      sections: [],
      summary: "S",
      strengths: ["S"],
      weaknesses: ["W"],
      recommendations: ["R"],
      createdAt: "2026-01-01T00:00:00Z",
    });

    deleteVacancy("v-cas");

    // Match snapshot и analysis остаются: удаление вакансии не каскадно.
    expect(getMatchRecord("m-cas")).not.toBeNull();
    expect(listMatchRecords().map((m) => m.id)).toContain("m-cas");
    expect(getAnalysis("an-cas")).not.toBeNull();
  });
});
