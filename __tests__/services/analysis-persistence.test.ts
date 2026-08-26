import { describe, it, expect, beforeEach } from "vitest";
import {
  saveAnalysis,
  getAnalysis,
  listAnalyses,
  listAnalysesForResume,
} from "../../services/analysis-persistence";
import type { ResumeAnalysis } from "../../types/analysis";

function makeAnalysis(id: string, resumeId: string, versionId: string, createdAt = "2026-01-01T00:00:00Z"): ResumeAnalysis {
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
    createdAt,
  };
}

// P5 pattern: node environment -> InMemoryStore, isolated per test file.
beforeEach(() => {
  // listStore/store are module-level; emulate fresh storage by using unique ids per test.
});

describe("analysis persistence (P10.1)", () => {
  it("save + get roundtrip keeps versionId and full result", () => {
    const a = makeAnalysis("an-1", "res-1", "ver-1");
    saveAnalysis(a);
    const loaded = getAnalysis("an-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.resumeId).toBe("res-1");
    expect(loaded?.versionId).toBe("ver-1");
    expect(loaded?.recommendations).toEqual(["R"]);
  });

  it("lists analyses filtered by resumeId", () => {
    saveAnalysis(makeAnalysis("a-1", "res-A", "v1"));
    saveAnalysis(makeAnalysis("a-2", "res-B", "v2"));
    saveAnalysis(makeAnalysis("a-3", "res-A", "v3"));

    const forA = listAnalysesForResume("res-A").map((x) => x.id).sort();
    expect(forA).toEqual(["a-1", "a-3"]);
    expect(listAnalyses().length).toBeGreaterThanOrEqual(3);
  });

  it("get returns null for unknown id", () => {
    expect(getAnalysis("nope")).toBeNull();
  });
});
