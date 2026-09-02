import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// P11.2A: delete-flow persistence contract. UI (app/resume/page.tsx) ловит
// ошибки deleteResumeRecord и показывает visible error — это работает только
// если delete-функция честно пробрасывает write failures (P10.6 semantics).
// Здесь фиксируем контракт: delete rethrows при storage failure и не мутирует
// list-store, если сам record-write упал.

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

describe("resume delete persistence contract (P11.2A)", () => {
  it("deleteResumeRecord rethrows write failure (UI must catch and show error)", async () => {
    const { saveResumeRecord } = await import("../../services/resume-persistence");
    const { deleteResumeRecord } = await import("../../services/resume-persistence");

    // сохраняем запись успешно, затем ломаем writes
    saveResumeRecord({
      id: "del-fail",
      resume: {
        id: "del-fail",
        candidateId: "c",
        title: "T",
        desiredPosition: { value: "D", level: "confirmed" },
        summary: { value: null, level: "missing" },
        salaryExpectation: { value: null, level: "missing" },
        location: { value: null, level: "missing" },
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
          resumeId: "del-fail",
          versionNumber: 1,
          data: {
            desiredPosition: { value: "D", level: "confirmed" },
            summary: { value: null, level: "missing" },
            salaryExpectation: { value: null, level: "missing" },
            location: { value: null, level: "missing" },
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

    failWrites();

    // delete не должен превращать failure в success: ошибка уходит в UI-слой.
    expect(() => deleteResumeRecord("del-fail")).toThrow(/quota exceeded/);
  });

  it("successful delete removes record and list entry (existing behavior intact)", async () => {
    const { saveResumeRecord, deleteResumeRecord, getResumeRecord, listResumeRecords } =
      await import("../../services/resume-persistence");

    const record = {
      id: "del-ok",
      resume: {
        id: "del-ok",
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
          resumeId: "del-ok",
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
    };

    saveResumeRecord(record);
    expect(getResumeRecord("del-ok")).not.toBeNull();

    deleteResumeRecord("del-ok");

    expect(getResumeRecord("del-ok")).toBeNull();
    expect(listResumeRecords().map((r) => r.id)).not.toContain("del-ok");
  });
});
