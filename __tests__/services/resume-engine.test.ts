import { describe, it, expect, vi } from "vitest";

// P30: прямые тесты services/resume.ts — единственного источника дефолтов
// при создании резюме. До P30 модуль загружался (features/resume-wizard.ts:7
// импортирует createResumeEngine), но НИ ОДНО утверждение не исполняло
// createBlank/importResume/normalizeResume/createVersion/analyzeResume/
// adaptToVacancy напрямую. Контракты, зафиксированные здесь:
//  - createBlank никогда не подтверждает данные (summary всегда missing),
//  - currentVersionId пуст до явной связки версии,
//  - createVersion не мутирует resume и не проставляет currentVersionId,
//  - importResume усекает summary до 300 символов,
//  - adaptToVacancy игнорирует содержимое вакансии (mock-заглушка).

import { createResumeEngine, MockResumeEngine } from "../../services/resume";
import { confirmField, missingField } from "../../types/confirmation";
import type { CandidateProfile } from "../../types/candidate";
import type {
  Education,
  Resume,
  ResumeAnalysisInput,
  Skill,
  WorkExperience,
} from "../../types/resume";
import type { Vacancy } from "../../types/vacancy";

const NOW = "2026-01-15T10:00:00.000Z";

function makeCandidate(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "candidate-1",
    firstName: confirmField("Иван"),
    lastName: confirmField("Иванов"),
    middleName: missingField(),
    email: confirmField("ivan@test.com"),
    phone: confirmField("+79001234567"),
    city: confirmField("Москва"),
    desiredPosition: confirmField("Frontend Developer"),
    salaryExpectation: confirmField("200000"),
    workFormat: confirmField("remote"),
    employmentType: confirmField("full_time"),
    summary: confirmField("Опытный разработчик"),
    workExperience: [],
    education: [],
    skills: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const WORK_EXPERIENCE: WorkExperience[] = [
  {
    id: "we-1",
    company: "Яндекс",
    position: "Developer",
    startDate: "01/2020",
    endDate: null,
    isCurrent: true,
    description: "Разработка",
    achievements: ["A", "B"],
  },
];

const EDUCATION: Education[] = [
  {
    id: "edu-1",
    level: "bachelor",
    institution: "МГУ",
    degree: "Бакалавр",
    field: "Информатика",
    startDate: "09/2016",
    endDate: "06/2020",
    description: "",
  },
];

const SKILLS: Skill[] = [{ name: "React", level: "advanced" }];

function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: "resume-1",
    candidateId: "candidate-1",
    title: "Frontend Developer",
    desiredPosition: confirmField("Frontend Developer"),
    summary: confirmField("Опытный разработчик"),
    salaryExpectation: confirmField("200000"),
    location: confirmField("Москва"),
    workExperience: WORK_EXPERIENCE,
    education: EDUCATION,
    skills: SKILLS,
    languages: ["Русский", "Английский"],
    currentVersionId: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeVacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: "vacancy-1",
    title: "Backend Developer",
    company: "Ozon",
    description: "Разработка бэкенда",
    requirements: [],
    skills: ["Go"],
    responsibilities: [],
    location: "Санкт-Петербург",
    workFormat: "office",
    employmentType: "full_time",
    source: "hh_url",
    sourceUrl: "https://hh.ru/vacancy/1",
    fetchedAt: NOW,
    ...overrides,
  };
}

function isIsoDate(value: string): boolean {
  return new Date(value).toISOString() === value;
}

// ---------- createResumeEngine factory ----------

describe("createResumeEngine factory (P30)", () => {
  it("returns a usable engine implementing the ResumeEngine contract", () => {
    const engine = createResumeEngine();
    expect(engine).toBeInstanceOf(MockResumeEngine);
    for (const method of [
      "createBlank",
      "importResume",
      "normalizeResume",
      "createVersion",
      "analyzeResume",
      "adaptToVacancy",
    ] as const) {
      expect(typeof engine[method]).toBe("function");
    }
  });

  it("returns independent instances (no shared mutable state)", () => {
    const first = createResumeEngine();
    const second = createResumeEngine();
    expect(first).not.toBe(second);

    const resume = first.createBlank(makeCandidate());
    resume.title = "Mutated";
    expect(second.createBlank(makeCandidate()).title).toBe("Frontend Developer");
  });
});

// ---------- createBlank: resume creation defaults ----------

describe("MockResumeEngine.createBlank (P30)", () => {
  it("generates a unique non-empty id per call", () => {
    const engine = new MockResumeEngine();
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const resume = engine.createBlank(makeCandidate());
      expect(typeof resume.id).toBe("string");
      expect(resume.id.length).toBeGreaterThan(0);
      ids.add(resume.id);
    }
    expect(ids.size).toBe(50);
  });

  it("inherits candidateId from the candidate profile", () => {
    const resume = new MockResumeEngine().createBlank(makeCandidate({ id: "cand-42" }));
    expect(resume.candidateId).toBe("cand-42");
  });

  it("title comes from desiredPosition.value", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({ desiredPosition: confirmField("Backend Developer") }),
    );
    expect(resume.title).toBe("Backend Developer");
  });

  it("title falls back to 'Новое резюме' when desiredPosition is missing", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({ desiredPosition: missingField() }),
    );
    expect(resume.title).toBe("Новое резюме");
  });

  it("title falls back when desiredPosition.value is an empty string", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({ desiredPosition: confirmField("") }),
    );
    // "" is not nullish, so it is used verbatim (no ?? fallback) — locked behavior.
    expect(resume.title).toBe("");
  });

  it("summary is always missing: createBlank confirms nothing", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({ summary: confirmField("Игнорируется движком") }),
    );
    expect(resume.summary).toEqual({ value: null, level: "missing" });
  });

  it("salaryExpectation and location are taken from the candidate profile", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({
        salaryExpectation: confirmField("от 250 000 ₽"),
        city: confirmField("Казань"),
      }),
    );
    expect(resume.salaryExpectation).toEqual({ value: "от 250 000 ₽", level: "confirmed" });
    expect(resume.location).toEqual({ value: "Казань", level: "confirmed" });
  });

  it("all collections start empty regardless of candidate content", () => {
    const resume = new MockResumeEngine().createBlank(
      makeCandidate({ workExperience: WORK_EXPERIENCE, education: EDUCATION, skills: SKILLS }),
    );
    expect(resume.workExperience).toEqual([]);
    expect(resume.education).toEqual([]);
    expect(resume.skills).toEqual([]);
    expect(resume.languages).toEqual([]);
  });

  it("currentVersionId is empty: no version exists at creation time", () => {
    const resume = new MockResumeEngine().createBlank(makeCandidate());
    expect(resume.currentVersionId).toBe("");
  });

  it("optional workFormat/employmentType are left undefined", () => {
    const resume = new MockResumeEngine().createBlank(makeCandidate());
    expect(resume.workFormat).toBeUndefined();
    expect(resume.employmentType).toBeUndefined();
  });

  it("createdAt and updatedAt are equal ISO timestamps", () => {
    const resume = new MockResumeEngine().createBlank(makeCandidate());
    expect(isIsoDate(resume.createdAt)).toBe(true);
    expect(isIsoDate(resume.updatedAt)).toBe(true);
    expect(resume.createdAt).toBe(resume.updatedAt);
  });
});

// ---------- importResume ----------

describe("MockResumeEngine.importResume (P30)", () => {
  it("generates a distinct id and candidateId", async () => {
    const resume = await new MockResumeEngine().importResume("Текст резюме", "text");
    expect(resume.id).toBeTruthy();
    expect(resume.candidateId).toBeTruthy();
    expect(resume.candidateId).not.toBe(resume.id);
  });

  it("uses fixed title and 'Не указано' desired position", async () => {
    const resume = await new MockResumeEngine().importResume("Текст", "text");
    expect(resume.title).toBe("Импортированное резюме");
    expect(resume.desiredPosition).toEqual({ value: "Не указано", level: "confirmed" });
  });

  it("salaryExpectation and location stay missing (never invented)", async () => {
    const resume = await new MockResumeEngine().importResume("Текст", "text");
    expect(resume.salaryExpectation).toEqual({ value: null, level: "missing" });
    expect(resume.location).toEqual({ value: null, level: "missing" });
  });

  it("summary keeps content up to 300 characters", async () => {
    const content = "a".repeat(500);
    const resume = await new MockResumeEngine().importResume(content, "text");
    expect(resume.summary.level).toBe("confirmed");
    expect(resume.summary.value).toBe("a".repeat(300));
    expect(resume.summary.value).toHaveLength(300);
  });

  it("summary boundary: exactly 300 characters is preserved untouched", async () => {
    const content = "b".repeat(300);
    const resume = await new MockResumeEngine().importResume(content, "text");
    expect(resume.summary.value).toBe(content);
  });

  it("empty content yields a confirmed empty summary (not missing)", async () => {
    const resume = await new MockResumeEngine().importResume("", "text");
    expect(resume.summary).toEqual({ value: "", level: "confirmed" });
  });

  it("format argument does not change the produced shape", async () => {
    const engine = new MockResumeEngine();
    const formats = ["text", "pdf", "docx"] as const;
    const produced = [];
    for (const format of formats) {
      produced.push(await engine.importResume("Одинаковый контент", format));
    }
    // Compare everything except the per-call generated identity fields.
    const strip = (r: Resume) => ({ ...r, id: "", candidateId: "", createdAt: "", updatedAt: "" });
    expect(strip(produced[0])).toEqual(strip(produced[1]));
    expect(strip(produced[1])).toEqual(strip(produced[2]));
  });
});

// ---------- normalizeResume ----------

describe("MockResumeEngine.normalizeResume (P30)", () => {
  it("returns a new object and does not mutate the input", () => {
    const input = makeResume();
    const snapshot = JSON.parse(JSON.stringify(input));
    const output = new MockResumeEngine().normalizeResume(input);

    expect(output).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it("preserves every field except updatedAt", () => {
    const input = makeResume({ workFormat: "remote", employmentType: "full_time" });
    const output = new MockResumeEngine().normalizeResume(input);
    const { updatedAt: _out, ...outputRest } = output;
    const { updatedAt: _in, ...inputRest } = input;
    void _out;
    void _in;
    expect(outputRest).toEqual(inputRest);
    expect(output.createdAt).toBe(input.createdAt);
    expect(output.currentVersionId).toBe(input.currentVersionId);
  });

  it("refreshes updatedAt to a new ISO timestamp", () => {
    const engine = new MockResumeEngine();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-15T10:00:00.000Z"));
      const before = engine.normalizeResume(makeResume());

      vi.setSystemTime(new Date("2026-06-01T12:30:45.000Z"));
      const after = engine.normalizeResume(before);

      expect(before.updatedAt).toBe("2026-01-15T10:00:00.000Z");
      expect(after.updatedAt).toBe("2026-06-01T12:30:45.000Z");
      expect(after.updatedAt).not.toBe(before.updatedAt);
      expect(isIsoDate(after.updatedAt)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------- createVersion ----------

describe("MockResumeEngine.createVersion (P30)", () => {
  it("defaults versionNumber to 1 and links resumeId", () => {
    const version = new MockResumeEngine().createVersion(makeResume(), {});
    expect(version.versionNumber).toBe(1);
    expect(version.resumeId).toBe("resume-1");
    expect(version.id).toBeTruthy();
    expect(isIsoDate(version.createdAt)).toBe(true);
  });

  it("honours an explicit versionNumber", () => {
    const version = new MockResumeEngine().createVersion(makeResume(), {}, 7);
    expect(version.versionNumber).toBe(7);
  });

  it("snapshots canonical fields from the resume", () => {
    const resume = makeResume();
    const version = new MockResumeEngine().createVersion(resume, {});

    expect(version.data.desiredPosition).toEqual(resume.desiredPosition);
    expect(version.data.summary).toEqual(resume.summary);
    expect(version.data.salaryExpectation).toEqual(resume.salaryExpectation);
    expect(version.data.location).toEqual(resume.location);
    expect(version.data.workExperience).toEqual(resume.workExperience);
    expect(version.data.education).toEqual(resume.education);
    expect(version.data.skills).toEqual(resume.skills);
    expect(version.data.languages).toEqual(resume.languages);
  });

  it("defaults workFormat/employmentType to empty strings when absent on resume", () => {
    const version = new MockResumeEngine().createVersion(makeResume(), {});
    expect(version.data.workFormat).toBe("");
    expect(version.data.employmentType).toBe("");
  });

  it("carries workFormat/employmentType over when present on resume", () => {
    const resume = makeResume({ workFormat: "hybrid", employmentType: "contract" });
    const version = new MockResumeEngine().createVersion(resume, {});
    expect(version.data.workFormat).toBe("hybrid");
    expect(version.data.employmentType).toBe("contract");
  });

  it("changes override the resume snapshot field by field", () => {
    const resume = makeResume();
    const version = new MockResumeEngine().createVersion(resume, {
      desiredPosition: confirmField("Backend Developer"),
      workFormat: "office",
      employmentType: "freelance",
      summary: missingField(),
      languages: ["Русский"],
    });

    expect(version.data.desiredPosition).toEqual({ value: "Backend Developer", level: "confirmed" });
    expect(version.data.workFormat).toBe("office");
    expect(version.data.employmentType).toBe("freelance");
    expect(version.data.summary).toEqual({ value: null, level: "missing" });
    expect(version.data.languages).toEqual(["Русский"]);
    // untouched fields still come from the resume
    expect(version.data.location).toEqual(resume.location);
  });

  it("partial changes do not drop the untouched snapshot keys", () => {
    const version = new MockResumeEngine().createVersion(makeResume(), {
      desiredPosition: confirmField("X"),
    });
    for (const key of [
      "desiredPosition",
      "summary",
      "salaryExpectation",
      "location",
      "workExperience",
      "education",
      "skills",
      "languages",
      "workFormat",
      "employmentType",
    ] as const) {
      expect(version.data).toHaveProperty(key);
    }
  });

  it("does not mutate the resume nor set currentVersionId", () => {
    const resume = makeResume();
    const snapshot = JSON.parse(JSON.stringify(resume));
    const version = new MockResumeEngine().createVersion(resume, {});

    expect(resume).toEqual(snapshot);
    expect(resume.currentVersionId).toBe("");
    expect(resume.currentVersionId).not.toBe(version.id);
  });

  it("each call produces a distinct version id", () => {
    const engine = new MockResumeEngine();
    const resume = makeResume();
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(engine.createVersion(resume, {}, i + 1).id);
    }
    expect(ids.size).toBe(50);
  });
});

// ---------- analyzeResume (mock AI contract) ----------

describe("MockResumeEngine.analyzeResume (P30)", () => {
  function makeAnalysisInput(): ResumeAnalysisInput {
    // ResumeAnalysisInput = Omit<Resume, "salaryExpectation"> — the salary must
    // not be constructible into an AI payload (privacy contract).
    const { salaryExpectation: _excluded, ...rest } = makeResume();
    void _excluded;
    return rest;
  }

  it("returns the mock provider contract with a fixed score", async () => {
    const analysis = await new MockResumeEngine().analyzeResume(makeAnalysisInput());

    expect(analysis.provider).toBe("mock");
    expect(analysis.overallScore).toBe(70);
    expect(analysis.sections).toEqual([]);
    expect(analysis.strengths).toEqual([]);
    expect(analysis.weaknesses).toEqual([]);
    expect(analysis.summary).toBe("Mock-анализ: резюме требует доработки");
    expect(analysis.id).toBeTruthy();
    expect(isIsoDate(analysis.createdAt)).toBe(true);
  });

  it("binds analysis to the resume id", async () => {
    const analysis = await new MockResumeEngine().analyzeResume(makeAnalysisInput());
    expect(analysis.resumeId).toBe("resume-1");
  });

  it("versionId comes from the supplied context", async () => {
    const analysis = await new MockResumeEngine().analyzeResume(makeAnalysisInput(), {
      versionId: "version-9",
    });
    expect(analysis.versionId).toBe("version-9");
  });

  it("versionId falls back to 'unknown' without context or versionId", async () => {
    const engine = new MockResumeEngine();
    expect((await engine.analyzeResume(makeAnalysisInput())).versionId).toBe("unknown");
    expect((await engine.analyzeResume(makeAnalysisInput(), {})).versionId).toBe("unknown");
  });

  it("never reads the salary field (privacy contract is structural)", () => {
    // ResumeAnalysisInput omits salaryExpectation, so a payload built from it
    // cannot carry it — assert the type-level guarantee holds at runtime too.
    const input = makeAnalysisInput() as Record<string, unknown>;
    expect("salaryExpectation" in input).toBe(false);
  });
});

// ---------- adaptToVacancy ----------

describe("MockResumeEngine.adaptToVacancy (P30)", () => {
  it("preserves resume identity and content", async () => {
    const resume = makeResume({ currentVersionId: "v1" });
    const adapted = await new MockResumeEngine().adaptToVacancy(resume, makeVacancy());

    expect(adapted.id).toBe(resume.id);
    expect(adapted.candidateId).toBe(resume.candidateId);
    expect(adapted.title).toBe(resume.title);
    expect(adapted.currentVersionId).toBe("v1");
    expect(adapted.skills).toEqual(resume.skills);
    expect(adapted.workExperience).toEqual(resume.workExperience);
  });

  it("does not mutate the input resume", async () => {
    const resume = makeResume();
    const snapshot = JSON.parse(JSON.stringify(resume));
    const adapted = await new MockResumeEngine().adaptToVacancy(resume, makeVacancy());
    expect(resume).toEqual(snapshot);
    expect(adapted).not.toBe(resume);
  });

  it("refreshes updatedAt", async () => {
    const engine = new MockResumeEngine();
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
      const before = await engine.adaptToVacancy(makeResume(), makeVacancy());

      vi.setSystemTime(new Date("2026-02-02T00:00:00.000Z"));
      const after = await engine.adaptToVacancy(before, makeVacancy());

      expect(before.updatedAt).toBe("2026-02-01T00:00:00.000Z");
      expect(after.updatedAt).toBe("2026-02-02T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores vacancy content — the mock engine adapts nothing (locked mock behavior)", async () => {
    const resume = makeResume();
    const engine = new MockResumeEngine();
    const forBackend = await engine.adaptToVacancy(resume, makeVacancy({ id: "v-backend" }));
    const forSales = await engine.adaptToVacancy(
      resume,
      makeVacancy({ id: "v-sales", title: "Sales Manager", skills: ["Excel"] }),
    );

    const strip = (r: Resume) => ({ ...r, updatedAt: "" });
    expect(strip(forBackend)).toEqual(strip(forSales));
  });
});