import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ResumeRecord } from "../../types/resume";
import type { Vacancy } from "../../types/vacancy";
import type { MatchRecord } from "../../types/match";
import type { ResumeAnalysis } from "../../types/analysis";
import { confirmField, missingField } from "../../types/confirmation";

// P10.6 F2: malformed / wrong-shape / partially corrupted persisted data must
// not crash reads and must not poison lists. Valid records survive.
//
// Сервисы создают stores на module-level при первом import. Чтобы тестировать
// localStorage-ветку, window.localStorage стабится ДО динамического import
// сервисов (vi.resetModules + await import) — тогда createPersistenceStore()
// создаёт LocalStorageStore на нашем fake, как в реальном браузере.

const FAKE_PREFIX = "rp:";

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

function putRaw(storage: FakeStorage, key: string, value: unknown): void {
  if (value === undefined) return;
  storage.data.set(FAKE_PREFIX + key, typeof value === "string" ? value : JSON.stringify(value));
}

let storage: FakeStorage;

/** Динамически импортирует persistence-сервисы поверх текущего fake storage. */
async function importServices() {
  const resume = await import("../../services/resume-persistence");
  const vacancy = await import("../../services/vacancy-persistence");
  const match = await import("../../services/match-persistence");
  const analysis = await import("../../services/analysis-persistence");
  return { resume, vacancy, match, analysis };
}

beforeEach(() => {
  storage = makeFakeStorage();
  (globalThis as unknown as { window?: unknown }).window = { localStorage: storage };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

// ---------- fixtures ----------

function makeResumeRecord(id: string): ResumeRecord {
  const now = "2026-01-01T00:00:00Z";
  return {
    id,
    resume: {
      id,
      candidateId: `cand-${id}`,
      title: `Resume ${id}`,
      desiredPosition: confirmField("Dev"),
      summary: missingField(),
      salaryExpectation: missingField(),
      location: confirmField("Moscow"),
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
      currentVersionId: `v1-${id}`,
      createdAt: now,
      updatedAt: now,
    },
    versions: [
      {
        id: `v1-${id}`,
        resumeId: id,
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
      firstName: "Ivan",
      lastName: "Ivanov",
      middleName: "",
      email: "ivan@test.com",
      phone: "+79001234567",
      city: "Moscow",
    },
    workFormat: "remote",
    employmentType: "full_time",
    confirmedFields: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeVacancy(id: string): Vacancy {
  return {
    id,
    title: `Vacancy ${id}`,
    company: `Company ${id}`,
    description: "Description",
    requirements: [],
    skills: [],
    responsibilities: [],
    location: "Москва",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

function makeMatchRecord(id: string): MatchRecord {
  return {
    id,
    vacancyId: `vac-${id}`,
    resumeId: `res-${id}`,
    resumeVersionId: `rv-${id}`,
    overallScore: 75,
    level: "good",
    matchedSkills: ["react"],
    missingSkills: [],
    matchedRequirements: [],
    missingRequirements: [],
    risks: [],
    recommendations: [],
    vacancyTitle: "Frontend",
    vacancyCompany: "Corp",
    resumeTitle: "Resume",
    resumeVersionNumber: 1,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeAnalysis(id: string): ResumeAnalysis {
  return {
    id,
    resumeId: `res-${id}`,
    versionId: `ver-${id}`,
    provider: "mock",
    overallScore: 75,
    sections: [],
    summary: "S",
    strengths: ["S"],
    weaknesses: ["W"],
    recommendations: ["R"],
    createdAt: "2026-01-01T00:00:00Z",
  };
}

/** Добавляет id в листинг-ключ сервиса (эмулирует «зависший» damaged id). */
function appendToListKey(listKey: string, extraId: string): void {
  const ids = JSON.parse(storage.data.get(FAKE_PREFIX + listKey) ?? "[]") as string[];
  storage.data.set(FAKE_PREFIX + listKey, JSON.stringify([...ids, extraId]));
}

// ---------- resume ----------

describe("resume persistence hardening (P10.6 F2)", () => {
  it("malformed JSON in store -> getResumeRecord null, no crash", async () => {
    const { resume } = await importServices();
    putRaw(storage, "rr:broken", "{not json");
    expect(() => resume.getResumeRecord("broken")).not.toThrow();
    expect(resume.getResumeRecord("broken")).toBeNull();
  });

  it("wrong-shape record {foo:bar} -> null, not passed through", async () => {
    const { resume } = await importServices();
    putRaw(storage, "rr:shape", { foo: "bar" });
    expect(resume.getResumeRecord("shape")).toBeNull();
  });

  it("record without versions (legacy/corrupted) -> null", async () => {
    const { resume } = await importServices();
    const damaged = makeResumeRecord("nover") as unknown as Record<string, unknown>;
    delete damaged.versions;
    putRaw(storage, "rr:nover", damaged);
    expect(resume.getResumeRecord("nover")).toBeNull();
  });

  it("record without candidateInfo -> null", async () => {
    const { resume } = await importServices();
    const damaged = makeResumeRecord("nocand") as unknown as Record<string, unknown>;
    delete damaged.candidateInfo;
    putRaw(storage, "rr:nocand", damaged);
    expect(resume.getResumeRecord("nocand")).toBeNull();
  });

  it("corrupted list entry does not break listResumeRecords", async () => {
    const { resume } = await importServices();
    resume.saveResumeRecord(makeResumeRecord("ok-1"));
    putRaw(storage, "rr:bad", { garbage: true });
    resume.saveResumeRecord(makeResumeRecord("ok-2"));
    appendToListKey("resume-list", "bad");

    const ids = resume.listResumeRecords().map((r) => r.id);
    expect(ids).toContain("ok-1");
    expect(ids).toContain("ok-2");
    expect(ids).not.toContain("bad");
  });

  it("valid record roundtrip still works (no rewriting)", async () => {
    const { resume } = await importServices();
    resume.saveResumeRecord(makeResumeRecord("rt-1"));
    const loaded = resume.getResumeRecord("rt-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("rt-1");
    expect(loaded!.candidateInfo.firstName).toBe("Ivan");
    expect(loaded!.versions.length).toBe(1);
  });

  it("saveResumeRecord write failure still propagates (semantics unchanged)", async () => {
    const { resume } = await importServices();
    storage.setItem = () => {
      throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
    };
    expect(() => resume.saveResumeRecord(makeResumeRecord("quota-1"))).toThrow(/quota exceeded/);
  });
});

// ---------- vacancy ----------

describe("vacancy persistence hardening (P10.6 F2)", () => {
  it("malformed JSON -> getVacancy null, no crash", async () => {
    const { vacancy } = await importServices();
    putRaw(storage, "vac:broken", "{not json");
    expect(() => vacancy.getVacancy("broken")).not.toThrow();
    expect(vacancy.getVacancy("broken")).toBeNull();
  });

  it("wrong-shape vacancy -> null", async () => {
    const { vacancy } = await importServices();
    putRaw(storage, "vac:shape", { foo: "bar" });
    expect(vacancy.getVacancy("shape")).toBeNull();
  });

  it("vacancy without requirements array -> null (render-critical field)", async () => {
    const { vacancy } = await importServices();
    const damaged = makeVacancy("noreq") as unknown as Record<string, unknown>;
    delete damaged.requirements;
    putRaw(storage, "vac:noreq", damaged);
    expect(vacancy.getVacancy("noreq")).toBeNull();
  });

  it("corrupted list entry does not break listVacancies", async () => {
    const { vacancy } = await importServices();
    vacancy.saveVacancy(makeVacancy("vok-1"));
    putRaw(storage, "vac:vbad", { garbage: true });
    appendToListKey("vacancy-list", "vbad");

    const ids = vacancy.listVacancies().map((v) => v.id);
    expect(ids).toContain("vok-1");
    expect(ids).not.toContain("vbad");
  });

  it("valid vacancy roundtrip still works", async () => {
    const { vacancy } = await importServices();
    vacancy.saveVacancy(makeVacancy("vrt-1"));
    expect(vacancy.getVacancy("vrt-1")!.title).toBe("Vacancy vrt-1");
  });

  it("saveVacancy write failure still propagates", async () => {
    const { vacancy } = await importServices();
    storage.setItem = () => {
      throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
    };
    expect(() => vacancy.saveVacancy(makeVacancy("vquota-1"))).toThrow(/quota exceeded/);
  });
});

// ---------- match ----------

describe("match persistence hardening (P10.6 F2)", () => {
  it("malformed JSON -> getMatchRecord null, no crash", async () => {
    const { match } = await importServices();
    putRaw(storage, "mr:broken", "{not json");
    expect(() => match.getMatchRecord("broken")).not.toThrow();
    expect(match.getMatchRecord("broken")).toBeNull();
  });

  it("wrong-shape match record -> null", async () => {
    const { match } = await importServices();
    putRaw(storage, "mr:shape", { foo: "bar" });
    expect(match.getMatchRecord("shape")).toBeNull();
  });

  it("match record without display metadata -> null (history page renders it)", async () => {
    const { match } = await importServices();
    const damaged = makeMatchRecord("nometa") as unknown as Record<string, unknown>;
    delete damaged.vacancyTitle;
    putRaw(storage, "mr:nometa", damaged);
    expect(match.getMatchRecord("nometa")).toBeNull();
  });

  it("corrupted list entry does not break listMatchRecords", async () => {
    const { match } = await importServices();
    match.saveMatchRecord(makeMatchRecord("mok-1"));
    putRaw(storage, "mr:mbad", { garbage: true });
    appendToListKey("match-list", "mbad");

    const ids = match.listMatchRecords().map((r) => r.id);
    expect(ids).toContain("mok-1");
    expect(ids).not.toContain("mbad");
  });

  it("valid match record roundtrip still works", async () => {
    const { match } = await importServices();
    match.saveMatchRecord(makeMatchRecord("mrt-1"));
    expect(match.getMatchRecord("mrt-1")!.overallScore).toBe(75);
  });

  it("saveMatchRecord write failure still propagates", async () => {
    const { match } = await importServices();
    storage.setItem = () => {
      throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
    };
    expect(() => match.saveMatchRecord(makeMatchRecord("mquota-1"))).toThrow(/quota exceeded/);
  });
});

// ---------- analysis ----------

describe("analysis persistence hardening (P10.6 F2)", () => {
  it("malformed JSON -> getAnalysis null, no crash", async () => {
    const { analysis } = await importServices();
    putRaw(storage, "analysis:broken", "{not json");
    expect(() => analysis.getAnalysis("broken")).not.toThrow();
    expect(analysis.getAnalysis("broken")).toBeNull();
  });

  it("wrong-shape analysis -> null", async () => {
    const { analysis } = await importServices();
    putRaw(storage, "analysis:shape", { foo: "bar" });
    expect(analysis.getAnalysis("shape")).toBeNull();
  });

  it("analysis without overallScore -> null (preview renders score directly)", async () => {
    const { analysis } = await importServices();
    const damaged = makeAnalysis("noscore") as unknown as Record<string, unknown>;
    delete damaged.overallScore;
    putRaw(storage, "analysis:noscore", damaged);
    expect(analysis.getAnalysis("noscore")).toBeNull();
  });

  it("corrupted list entry does not break listAnalyses", async () => {
    const { analysis } = await importServices();
    analysis.saveAnalysis(makeAnalysis("aok-1"));
    putRaw(storage, "analysis:abad", { garbage: true });
    appendToListKey("analysis-list", "abad");

    const ids = analysis.listAnalyses().map((a) => a.id);
    expect(ids).toContain("aok-1");
    expect(ids).not.toContain("abad");
  });

  it("valid analysis roundtrip still works", async () => {
    const { analysis } = await importServices();
    analysis.saveAnalysis(makeAnalysis("art-1"));
    expect(analysis.getAnalysis("art-1")!.versionId).toBe("ver-art-1");
  });

  it("saveAnalysis write failure still propagates", async () => {
    const { analysis } = await importServices();
    storage.setItem = () => {
      throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
    };
    expect(() => analysis.saveAnalysis(makeAnalysis("aquota-1"))).toThrow(/quota exceeded/);
  });
});

// ---------- cross-domain real-world scenario ----------

describe("corrupted storage scenario: mixed valid and invalid records (P10.6 F2)", () => {
  it("all four list reads skip damaged entries and keep valid ones", async () => {
    const { resume, vacancy, match, analysis } = await importServices();

    resume.saveResumeRecord(makeResumeRecord("mix-r-ok"));
    vacancy.saveVacancy(makeVacancy("mix-v-ok"));
    match.saveMatchRecord(makeMatchRecord("mix-m-ok"));
    analysis.saveAnalysis(makeAnalysis("mix-a-ok"));

    putRaw(storage, "rr:mix-r-bad", "definitely not json");
    putRaw(storage, "vac:mix-v-bad", { legacy: "shape" });
    putRaw(storage, "mr:mix-m-bad", [1, 2, 3]);
    putRaw(storage, "analysis:mix-a-bad", "just a string");

    appendToListKey("resume-list", "mix-r-bad");
    appendToListKey("vacancy-list", "mix-v-bad");
    appendToListKey("match-list", "mix-m-bad");
    appendToListKey("analysis-list", "mix-a-bad");

    expect(resume.listResumeRecords().map((r) => r.id)).toEqual(["mix-r-ok"]);
    expect(vacancy.listVacancies().map((v) => v.id)).toEqual(["mix-v-ok"]);
    expect(match.listMatchRecords().map((m) => m.id)).toEqual(["mix-m-ok"]);
    expect(analysis.listAnalyses().map((a) => a.id)).toEqual(["mix-a-ok"]);
  });
});
