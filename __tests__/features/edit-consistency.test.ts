import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WizardData } from "../../features/resume-wizard";
import {
  finalizeResume,
  createNewVersion,
} from "../../features/resume-wizard";
import { getResumeRecord } from "../../services/resume-persistence";

// P16-2/P16-3 regression: edit-mode (createNewVersion) must persist candidateInfo
// edits and keep resume.title in sync with the new version's desiredPosition,
// while preserving the existing versioning contract (v1 retained, currentVersionId
// -> v2, same resumeId, old version data untouched).

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

beforeEach(() => {
  const storage = makeFakeStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

function v1Data(overrides: Partial<WizardData> = {}): WizardData {
  return {
    firstName: "Анна",
    lastName: "Иванова",
    middleName: "",
    city: "Москва",
    phone: "+79990000000",
    email: "old@example.com",
    desiredPosition: "Backend Developer",
    desiredSalary: "",
    workFormat: "remote",
    employmentType: "full_time",
    workExperience: [],
    education: [],
    skills: [],
    summary: "",
    languages: [],
    ...overrides,
  };
}

const confirmed = () => new Set(["phone", "email", "desiredPosition"]);

describe("createNewVersion candidateInfo sync (P16-2)", () => {
  it("v2 persists the edited contact data through the production path", () => {
    const { record } = finalizeResume(v1Data(), confirmed());
    const oldInfo = { ...record.candidateInfo };
    const oldInfoJson = JSON.stringify(oldInfo);

    createNewVersion(
      v1Data({
        firstName: "Мария",
        lastName: "Петрова",
        middleName: "Сергеевна",
        email: "new@example.com",
        phone: "+78881112233",
        city: "Казань",
      }),
      record,
      confirmed(),
    );

    const persisted = getResumeRecord(record.id)!;
    // v2 candidateInfo === new data
    expect(persisted.candidateInfo.firstName).toBe("Мария");
    expect(persisted.candidateInfo.lastName).toBe("Петрова");
    expect(persisted.candidateInfo.middleName).toBe("Сергеевна");
    expect(persisted.candidateInfo.email).toBe("new@example.com");
    expect(persisted.candidateInfo.phone).toBe("+78881112233");
    expect(persisted.candidateInfo.city).toBe("Казань");
    // sanity: the ORIGINAL finalize mapping is the source of the old shape
    expect(oldInfoJson).toContain('"firstName":"Анна"');
  });

  it("candidateInfo of an unrelated record is not touched by another resume's edit", () => {
    const a = finalizeResume(v1Data(), confirmed());
    const b = finalizeResume(v1Data({ firstName: "Борис" }), confirmed());

    createNewVersion(v1Data({ firstName: "Мария" }), a.record, confirmed());

    const persistedB = getResumeRecord(b.record.id)!;
    expect(persistedB.candidateInfo.firstName).toBe("Борис");
  });

  it("versioning contract preserved: same id, v1 retained, currentVersionId = v2", () => {
    const { record } = finalizeResume(v1Data(), confirmed());

    createNewVersion(
      v1Data({ desiredPosition: "DevOps Engineer", firstName: "Мария" }),
      record,
      confirmed(),
    );

    const persisted = getResumeRecord(record.id)!;
    expect(persisted.id).toBe(record.id);
    expect(persisted.versions.length).toBe(2);
    const v1 = persisted.versions[0];
    const v2 = persisted.versions[1];
    expect(persisted.resume.currentVersionId).toBe(v2.id);
    // v1 untouched by the edit
    expect(v1.data.desiredPosition.value).toBe("Backend Developer");
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
  });
});

describe("createNewVersion title sync (P16-3)", () => {
  it("resume.title follows the new version's desiredPosition", () => {
    const { record } = finalizeResume(v1Data(), confirmed());

    createNewVersion(v1Data({ desiredPosition: "DevOps Engineer" }), record, confirmed());

    const persisted = getResumeRecord(record.id)!;
    expect(persisted.versions[1].data.desiredPosition.value).toBe("DevOps Engineer");
    expect(persisted.resume.title).toBe("DevOps Engineer");
    // old version keeps its own data
    expect(persisted.versions[0].data.desiredPosition.value).toBe("Backend Developer");
  });

  it("title fallback: empty desiredPosition keeps the previous title", () => {
    const { record } = finalizeResume(v1Data(), confirmed());
    const titleBefore = record.resume.title;

    // Empty position cannot happen via UI (canFinalize blocks it), but the
    // helper must not blank the title if called directly.
    createNewVersion(v1Data({ desiredPosition: "" }), record, new Set());

    const persisted = getResumeRecord(record.id)!;
    expect(persisted.resume.title).toBe(titleBefore);
  });

  it("finalizeResume (create) title semantics unchanged", () => {
    const { record } = finalizeResume(v1Data({ desiredPosition: "QA Lead" }), confirmed());
    expect(record.resume.title).toBe("QA Lead");
    // and the original fallback for create mode
    const { record: empty } = finalizeResume(v1Data({ desiredPosition: "" }), confirmed());
    expect(empty.resume.title).toBe("Новое резюме");
  });
});
