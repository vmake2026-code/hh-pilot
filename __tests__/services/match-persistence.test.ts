import { describe, it, expect } from "vitest";
import {
  saveMatchRecord,
  getMatchRecord,
  listMatchRecords,
  deleteMatchRecord,
} from "../../services/match-persistence";
import type { MatchRecord } from "../../types/match";

function makeMatchRecord(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id: "m-1",
    vacancyId: "v-1",
    resumeId: "r-1",
    resumeVersionId: "rv-1",
    overallScore: 75,
    level: "good",
    matchedSkills: ["react"],
    missingSkills: ["docker"],
    matchedRequirements: [
      { requirementId: "req-1", requirementText: "React", status: "matched", confidence: 0.8 },
    ],
    missingRequirements: [
      { requirementId: "req-2", requirementText: "Docker", status: "missing", confidence: 0 },
    ],
    risks: [],
    recommendations: ["Если у вас есть опыт с docker — добавьте его в резюме."],
    vacancyTitle: "Frontend Developer",
    vacancyCompany: "Test Corp",
    resumeTitle: "Frontend Developer",
    resumeVersionNumber: 1,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("match persistence", () => {
  it("saveMatchRecord + getMatchRecord", () => {
    const record = makeMatchRecord();
    saveMatchRecord(record);
    const found = getMatchRecord("m-1");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("m-1");
    expect(found!.overallScore).toBe(75);
  });

  it("getMatchRecord returns null for unknown id", () => {
    expect(getMatchRecord("nonexistent")).toBeNull();
  });

  it("listMatchRecords returns all saved records", () => {
    const r1 = makeMatchRecord({ id: "m-10", vacancyTitle: "A" });
    const r2 = makeMatchRecord({ id: "m-11", vacancyTitle: "B" });
    saveMatchRecord(r1);
    saveMatchRecord(r2);
    const list = listMatchRecords();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.map((r) => r.id)).toContain("m-10");
    expect(list.map((r) => r.id)).toContain("m-11");
  });

  it("deleteMatchRecord removes record", () => {
    const record = makeMatchRecord({ id: "m-del" });
    saveMatchRecord(record);
    expect(getMatchRecord("m-del")).not.toBeNull();
    deleteMatchRecord("m-del");
    expect(getMatchRecord("m-del")).toBeNull();
  });

  it("deleteMatchRecord does not affect other records", () => {
    const r1 = makeMatchRecord({ id: "m-a" });
    const r2 = makeMatchRecord({ id: "m-b" });
    saveMatchRecord(r1);
    saveMatchRecord(r2);
    deleteMatchRecord("m-a");
    expect(getMatchRecord("m-b")).not.toBeNull();
  });
});

describe("MatchRecord snapshot integrity", () => {
  it("preserves score", () => {
    const record = makeMatchRecord({ overallScore: 42 });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.overallScore).toBe(42);
  });

  it("preserves level", () => {
    const record = makeMatchRecord({ level: "weak" });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.level).toBe("weak");
  });

  it("preserves matchedSkills", () => {
    const record = makeMatchRecord({ matchedSkills: ["react", "typescript"] });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.matchedSkills).toEqual(["react", "typescript"]);
  });

  it("preserves missingSkills", () => {
    const record = makeMatchRecord({ missingSkills: ["docker", "k8s"] });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.missingSkills).toEqual(["docker", "k8s"]);
  });

  it("preserves risks", () => {
    const record = makeMatchRecord({ risks: ["Недостаточно опыта"] });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.risks).toEqual(["Недостаточно опыта"]);
  });

  it("preserves recommendations", () => {
    const recs = ["Добавьте docker", "Уточните опыт"];
    const record = makeMatchRecord({ recommendations: recs });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.recommendations).toEqual(recs);
  });
});

describe("MatchRecord version integrity", () => {
  it("stores resumeVersionId", () => {
    const record = makeMatchRecord({ resumeVersionId: "rv-42" });
    saveMatchRecord(record);
    expect(getMatchRecord("m-1")!.resumeVersionId).toBe("rv-42");
  });

  it("old MatchRecord does not change after saving a new one", () => {
    const old = makeMatchRecord({ id: "m-old", overallScore: 72, resumeVersionId: "rv-1" });
    saveMatchRecord(old);

    const newRecord = makeMatchRecord({ id: "m-new", overallScore: 84, resumeVersionId: "rv-2" });
    saveMatchRecord(newRecord);

    expect(getMatchRecord("m-old")!.overallScore).toBe(72);
    expect(getMatchRecord("m-old")!.resumeVersionId).toBe("rv-1");
    expect(getMatchRecord("m-new")!.overallScore).toBe(84);
  });

  it("stores vacancyId and resumeId", () => {
    const record = makeMatchRecord({ vacancyId: "vac-99", resumeId: "res-88" });
    saveMatchRecord(record);
    const found = getMatchRecord("m-1")!;
    expect(found.vacancyId).toBe("vac-99");
    expect(found.resumeId).toBe("res-88");
  });

  it("stores display metadata", () => {
    const record = makeMatchRecord({
      vacancyTitle: "Senior Dev",
      vacancyCompany: "BigTech",
      resumeTitle: "My Resume",
      resumeVersionNumber: 3,
    });
    saveMatchRecord(record);
    const found = getMatchRecord("m-1")!;
    expect(found.vacancyTitle).toBe("Senior Dev");
    expect(found.vacancyCompany).toBe("BigTech");
    expect(found.resumeTitle).toBe("My Resume");
    expect(found.resumeVersionNumber).toBe(3);
  });
});

describe("MatchRecord history", () => {
  it("multiple records display independently", () => {
    const records = [
      makeMatchRecord({ id: "h-1", vacancyTitle: "A", overallScore: 60 }),
      makeMatchRecord({ id: "h-2", vacancyTitle: "B", overallScore: 80 }),
      makeMatchRecord({ id: "h-3", vacancyTitle: "C", overallScore: 40 }),
    ];
    records.forEach(saveMatchRecord);

    const list = listMatchRecords();
    const ids = list.map((r) => r.id);
    expect(ids).toContain("h-1");
    expect(ids).toContain("h-2");
    expect(ids).toContain("h-3");
  });

  it("deleting one does not affect others", () => {
    const r1 = makeMatchRecord({ id: "d-1" });
    const r2 = makeMatchRecord({ id: "d-2" });
    const r3 = makeMatchRecord({ id: "d-3" });
    [r1, r2, r3].forEach(saveMatchRecord);

    deleteMatchRecord("d-2");
    expect(getMatchRecord("d-1")).not.toBeNull();
    expect(getMatchRecord("d-2")).toBeNull();
    expect(getMatchRecord("d-3")).not.toBeNull();
  });
});
