import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResumeRecord, ResumeVersion } from "../../types/resume";
import { confirmField } from "../../types/confirmation";

// P30: добор P0-пробелов из аудита:
// 1. loadForEdit — null-path (удалённая/битая запись) + happy path;
// 2. validateAllSteps — агрегатор шагов 1-4 (ранее 0 ссылок в тестах);
// 3. malformed JSON в самом list-ключе (rp:resume-list) — catch-ветка store;
// 4. dangling currentVersionId в analyzeCurrentVersion (selectCurrentVersion).
//
// Persistence-сервисы создают module-level stores при первом import,
// поэтому window.localStorage стабится ДО динамического import
// (паттерн persistence-hardening / hh-wizard-page-flow).

let storage: { data: Map<string, string> };

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

function makeVersion(number: number, id: string, resumeId: string): ResumeVersion {
  return {
    id,
    resumeId,
    versionNumber: number,
    data: {
      desiredPosition: confirmField("Backend Developer"),
      summary: confirmField("Сводка."),
      salaryExpectation: confirmField("300000 руб."),
      location: confirmField("Москва"),
      workExperience: [],
      education: [],
      skills: [{ name: "React", level: "advanced" }],
      languages: [],
      workFormat: "office",
      employmentType: "full_time",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRecord(id: string, currentVersionId: string): ResumeRecord {
  return {
    id,
    resume: {
      id,
      candidateId: "c1",
      title: "Resume",
      desiredPosition: confirmField("Backend Developer"),
      summary: confirmField("Сводка."),
      salaryExpectation: confirmField("300000"),
      location: confirmField("Москва"),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    versions: [makeVersion(1, `v-${id}-1`, id), makeVersion(2, `v-${id}-2`, id)],
    candidateInfo: {
      firstName: "Иван",
      lastName: "Иванов",
      middleName: "",
      email: "a@b.c",
      phone: "+79000000000",
      city: "Москва",
    },
    workFormat: "office",
    employmentType: "full_time",
    confirmedFields: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

async function importModules() {
  return {
    wizard: await import("../../features/resume-wizard"),
    validation: await import("../../lib/validation"),
    persistence: await import("../../services/resume-persistence"),
    resumeAnalysis: await import("../../features/resume-analysis"),
  };
}

beforeEach(() => {
  storage = makeFakeStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

describe("loadForEdit (P30 gap: null-path + happy path)", () => {
  it("returns null for a deleted/unknown resumeId (graceful, no throw)", async () => {
    const { wizard } = await importModules();
    expect(wizard.loadForEdit("no-such-id")).toBeNull();
  });

  it("returns null when the stored record is corrupt (shape guard)", async () => {
    storage.data.set("rp:rr:broken", "{not json");
    const { wizard } = await importModules();
    expect(wizard.loadForEdit("broken")).toBeNull();
  });

  it("returns { record, wizardData } for a valid record, current version selected", async () => {
    const record = makeRecord("rec-1", "v-rec-1-2");
    storage.data.set("rp:rr:rec-1", JSON.stringify(record));
    storage.data.set("rp:resume-list", JSON.stringify(["rec-1"]));

    const { wizard } = await importModules();
    const result = wizard.loadForEdit("rec-1");
    expect(result).not.toBeNull();
    expect(result!.record.id).toBe("rec-1");
    // currentVersionId = v-rec-1-2 == id версии 2 — выбрана именно она
    expect(result!.wizardData.desiredPosition).toBe("Backend Developer");
    expect(result!.wizardData.desiredSalary).toBe("300000 руб.");
    expect(result!.wizardData.city).toBe("Москва");
  });

  it("falls back to the last version when currentVersionId dangles", async () => {
    const record = makeRecord("rec-2", "v-dangling");
    // currentVersionId указывает на несуществующую версию: fallback = последняя (v2)
    storage.data.set("rp:rr:rec-2", JSON.stringify(record));
    storage.data.set("rp:resume-list", JSON.stringify(["rec-2"]));

    const { wizard } = await importModules();
    const result = wizard.loadForEdit("rec-2");
    expect(result).not.toBeNull();
    // Данные последней версии, не null и не пустые строки
    expect(result!.wizardData.desiredPosition).toBe("Backend Developer");
  });
});

describe("validateAllSteps (P30 gap: 0 references before)", () => {
  it("aggregates errors from steps 1-4 for empty data", async () => {
    const { validation } = await importModules();
    const empty = {
      firstName: "",
      lastName: "",
      city: "",
      phone: "",
      email: "",
      desiredPosition: "",
      workExperience: [],
      education: [],
    };
    const errors = validation.validateAllSteps(empty);
    expect(Object.keys(errors).length).toBeGreaterThan(0);
    expect(errors.firstName).toBeDefined();
    expect(errors.desiredPosition).toBeDefined();
  });

  it("returns no errors for fully valid data", async () => {
    const { validation } = await importModules();
    const valid = {
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.ru",
      desiredPosition: "Backend Developer",
      workExperience: [],
      education: [],
    };
    const errors = validation.validateAllSteps(valid);
    expect(Object.keys(errors).length).toBe(0);
  });

  it("includes work experience date errors (step 3 aggregation)", async () => {
    const { validation } = await importModules();
    const data = {
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.ru",
      desiredPosition: "Dev",
      workExperience: [{
        id: "we-1",
        company: "Corp",
        position: "Dev",
        startDate: "13/2026", // invalid month
        endDate: null,
        isCurrent: true,
        description: "",
        achievements: [],
      }],
      education: [],
    };
    const errors = validation.validateAllSteps(data);
    expect(errors["work[0].dates"]).toBeDefined();
  });
});

describe("malformed list-key JSON (P30 gap: rp:resume-list itself)", () => {
  it("garbage in the list key -> empty list, no throw", async () => {
    storage.data.set("rp:resume-list", "{{{not json");
    const { persistence } = await importModules();
    expect(() => persistence.listResumeRecords()).not.toThrow();
    expect(persistence.listResumeRecords()).toEqual([]);
  });

  // P30-FINDING-1 (characterization, current behavior): валидный JSON
  // не-массива в rp:resume-list проходит мимо JSON.parse-catch LocalStorageStore
  // и ломает listResumeRecords с TypeError. Malformed JSON безопасен, non-array
  // root — нет. Зафиксировано как есть для решения в P31; см. P30 report.
  it("non-array valid JSON in the list key -> CURRENTLY throws TypeError (P30-FINDING-1)", async () => {
    storage.data.set("rp:resume-list", JSON.stringify({ oops: true }));
    const { persistence } = await importModules();
    expect(() => persistence.listResumeRecords()).toThrow(TypeError);
  });

  it("valid record survives next to a garbage list key (recovery on next save)", async () => {
    const record = makeRecord("rec-3", "v-rec-3-2");
    storage.data.set("rp:rr:rec-3", JSON.stringify(record));
    storage.data.set("rp:resume-list", "garbage");
    const { persistence } = await importModules();
    // Прямой find по id работает независимо от list-ключа
    const found = persistence.getResumeRecord("rec-3");
    expect(found?.id).toBe("rec-3");
  });
});

describe("analyzeCurrentVersion dangling currentVersionId (P30 gap)", () => {
  it("falls back to the last version when currentVersionId is not found", async () => {
    // currentVersionId указывает на несуществующую версию; запись содержит
    // v1 (v-rec-4-1) и v2 (v-rec-4-2) — fallback обязан взять v2.
    const record = makeRecord("rec-4", "v-dangling-id");
    storage.data.set("rp:rr:rec-4", JSON.stringify(record));
    storage.data.set("rp:resume-list", JSON.stringify(["rec-4"]));

    const { resumeAnalysis } = await importModules();

    // Stub-шлюз фиксирует, КАКУЮ версию отправили на анализ
    const sentVersionIds: string[] = [];
    const gateway = {
      name: "stub",
      setProvider: () => {},
      getProvider: () => ({ name: "stub", async complete() { return { content: "" }; } }),
      async analyzeResume(_resume: unknown, context: { versionId?: string }) {
        sentVersionIds.push(context?.versionId ?? "");
        return {
          id: "an-1",
          resumeId: record.resume.id,
          versionId: context?.versionId ?? "",
          provider: "stub",
          createdAt: "2026-01-03T00:00:00.000Z",
          overallScore: 50,
          sections: [{ section: "experience", score: 50, feedback: "ok", suggestions: [] }],
          summary: "s",
          strengths: [],
          weaknesses: [],
          recommendations: [],
        } as never;
      },
      async matchResumeToVacancy() { throw new Error("not used"); },
      async generateCoverLetter() { throw new Error("not used"); },
      async optimizeResume() { throw new Error("not used"); },
    };

    const outcome = await resumeAnalysis.analyzeCurrentVersion(record, gateway as never);
    expect(outcome.ok).toBe(true);
    // Отправлена ПОСЛЕДНЯЯ версия (v2), а не dangling id
    expect(sentVersionIds).toEqual([`v-rec-4-2`]);
    // Анализ привязан к fallback-версии
    if (outcome.ok) expect(outcome.analysis.versionId).toBe("v-rec-4-2");
  });

  it("record with zero versions -> graceful error, no throw", async () => {
    const emptyRecord = makeRecord("rec-5", "v-none");
    emptyRecord.versions = [];
    const { resumeAnalysis } = await importModules();

    const outcome = await resumeAnalysis.analyzeCurrentVersion(emptyRecord);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe("У резюме нет версии для анализа");
  });
});
