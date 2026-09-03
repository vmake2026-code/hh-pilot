import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// P14-F3: resume delete cascade contract. deleteResumeRecord должен удалять
// связанные сущности ТОЛЬКО этого resumeId: analyses (records + list entries)
// и wizard draft. Analyses других resume остаются; matches/history остаются
// (P11.2C non-cascade semantics); остальные resume остаются.

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

function makeRecord(id: string) {
  const now = "2026-01-01T00:00:00Z";
  const confirmed = { value: "D", level: "confirmed" as const };
  const missing = { value: null, level: "missing" as const };
  return {
    id,
    resume: {
      id,
      candidateId: `c-${id}`,
      title: `T ${id}`,
      desiredPosition: confirmed,
      summary: missing,
      salaryExpectation: missing,
      location: missing,
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
          desiredPosition: confirmed,
          summary: missing,
          salaryExpectation: missing,
          location: missing,
          workExperience: [],
          education: [],
          skills: [],
          languages: [],
          workFormat: "",
          employmentType: "",
        },
        createdAt: now,
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
    createdAt: now,
    updatedAt: now,
  };
}

function makeAnalysis(id: string, resumeId: string, versionId: string) {
  return {
    id,
    resumeId,
    versionId,
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

function rawKeys(): string[] {
  return [...storage.data.keys()].sort();
}

describe("resume delete cascade (P14-F3)", () => {
  it("delete resume removes its analyses (records + list entries)", async () => {
    const { saveResumeRecord, deleteResumeRecord, getResumeRecord } =
      await import("../../services/resume-persistence");
    const { saveAnalysis, getAnalysis, listAnalysesForResume } =
      await import("../../services/analysis-persistence");

    saveResumeRecord(makeRecord("res-1"));
    saveAnalysis(makeAnalysis("an-1a", "res-1", "v1-res-1"));
    saveAnalysis(makeAnalysis("an-1b", "res-1", "v1-res-1"));

    expect(listAnalysesForResume("res-1").length).toBe(2);

    deleteResumeRecord("res-1");

    expect(getResumeRecord("res-1")).toBeNull();
    expect(listAnalysesForResume("res-1")).toEqual([]);
    expect(getAnalysis("an-1a")).toBeNull();
    expect(getAnalysis("an-1b")).toBeNull();
    // records physically removed from storage, not just filtered on read
    expect(rawKeys()).not.toContain("rp:analysis:an-1a");
    expect(rawKeys()).not.toContain("rp:analysis:an-1b");
  });

  it("delete resume does NOT remove another resume's analyses", async () => {
    const { saveResumeRecord, deleteResumeRecord } =
      await import("../../services/resume-persistence");
    const { saveAnalysis, getAnalysis, listAnalysesForResume, listAnalyses } =
      await import("../../services/analysis-persistence");

    saveResumeRecord(makeRecord("res-del"));
    saveResumeRecord(makeRecord("res-keep"));
    saveAnalysis(makeAnalysis("an-del", "res-del", "v1-res-del"));
    saveAnalysis(makeAnalysis("an-keep-1", "res-keep", "v1-res-keep"));
    saveAnalysis(makeAnalysis("an-keep-2", "res-keep", "v1-res-keep"));

    deleteResumeRecord("res-del");

    expect(getAnalysis("an-keep-1")).not.toBeNull();
    expect(getAnalysis("an-keep-2")).not.toBeNull();
    expect(listAnalysesForResume("res-keep").map((a) => a.id).sort()).toEqual(["an-keep-1", "an-keep-2"]);
    expect(listAnalyses().map((a) => a.id)).not.toContain("an-del");
  });

  it("delete resume removes the associated wizard draft (resume-draft:<id>)", async () => {
    const { saveResumeRecord, deleteResumeRecord } =
      await import("../../services/resume-persistence");

    saveResumeRecord(makeRecord("res-draft"));
    // Simulate a wizard draft for this resume (same key scheme as the wizard)
    storage.setItem("rp:resume-draft:res-draft", JSON.stringify({ step: 3 }));
    // The "new-resume" draft must survive
    storage.setItem("rp:resume-draft:new", JSON.stringify({ step: 2 }));

    deleteResumeRecord("res-draft");

    expect(rawKeys()).not.toContain("rp:resume-draft:res-draft");
    expect(rawKeys()).toContain("rp:resume-draft:new");
  });

  it("delete resume does NOT cascade into match history (P11.2C semantics)", async () => {
    const { saveResumeRecord, deleteResumeRecord } =
      await import("../../services/resume-persistence");
    const { saveMatchRecord, getMatchRecord } =
      await import("../../services/match-persistence");

    saveResumeRecord(makeRecord("res-m"));
    saveMatchRecord({
      id: "m-1",
      vacancyId: "v-1",
      resumeId: "res-m",
      resumeVersionId: "v1-res-m",
      overallScore: 75,
      level: "good",
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
    });

    deleteResumeRecord("res-m");

    // Match history is an independent snapshot entity — preserved by design.
    expect(getMatchRecord("m-1")).not.toBeNull();
  });

  it("delete integrity: remaining resumes and their list stay intact", async () => {
    const { saveResumeRecord, deleteResumeRecord, getResumeRecord, listResumeRecords } =
      await import("../../services/resume-persistence");
    const { saveAnalysis, listAnalyses } = await import("../../services/analysis-persistence");

    saveResumeRecord(makeRecord("res-a"));
    saveResumeRecord(makeRecord("res-b"));
    saveAnalysis(makeAnalysis("an-a", "res-a", "v1-res-a"));
    saveAnalysis(makeAnalysis("an-b", "res-b", "v1-res-b"));

    deleteResumeRecord("res-a");

    const remaining = listResumeRecords().map((r) => r.id).sort();
    expect(remaining).toEqual(["res-b"]);
    expect(getResumeRecord("res-b")).not.toBeNull();
    expect(listAnalyses().map((a) => a.id)).toEqual(["an-b"]);
  });

  it("cascade cleanup of a resume without analyses is a no-op (no list rewriting)", async () => {
    const { saveResumeRecord, deleteResumeRecord } =
      await import("../../services/resume-persistence");
    const { saveAnalysis, listAnalyses } = await import("../../services/analysis-persistence");

    saveResumeRecord(makeRecord("res-none"));
    saveAnalysis(makeAnalysis("an-x", "res-other", "v-x"));

    const listKeyBefore = storage.data.get("rp:analysis-list");

    deleteResumeRecord("res-none");

    expect(listAnalyses().map((a) => a.id)).toEqual(["an-x"]);
    // analysis-list untouched when nothing was removed
    expect(storage.data.get("rp:analysis-list")).toBe(listKeyBefore);
  });
});
