import { describe, it, expect } from "vitest";
import { scoreToLevel, levelLabel, toMatchRecord } from "../../types/match";
import type { MatchResult } from "../../types/match";

describe("scoreToLevel", () => {
  it("≥80 → strong", () => {
    expect(scoreToLevel(80)).toBe("strong");
    expect(scoreToLevel(100)).toBe("strong");
  });
  it("60–79 → good", () => {
    expect(scoreToLevel(60)).toBe("good");
    expect(scoreToLevel(79)).toBe("good");
  });
  it("40–59 → partial", () => {
    expect(scoreToLevel(40)).toBe("partial");
    expect(scoreToLevel(59)).toBe("partial");
  });
  it("<40 → weak", () => {
    expect(scoreToLevel(0)).toBe("weak");
    expect(scoreToLevel(39)).toBe("weak");
  });
});

describe("levelLabel", () => {
  it("returns Russian label for each level", () => {
    expect(levelLabel("strong")).toContain("Сильное");
    expect(levelLabel("good")).toContain("Хорошее");
    expect(levelLabel("partial")).toContain("Частичное");
    expect(levelLabel("weak")).toContain("Слабое");
  });
});

describe("toMatchRecord", () => {
  it("creates MatchRecord from MatchResult + metadata", () => {
    const result: MatchResult = {
      id: "r-1",
      vacancyId: "v-1",
      resumeId: "res-1",
      resumeVersionId: "rv-1",
      overallScore: 82,
      level: "good",
      matchedSkills: ["react"],
      missingSkills: ["docker"],
      matchedRequirements: [],
      missingRequirements: [],
      risks: [],
      recommendations: [],
      createdAt: "2026-01-01T00:00:00Z",
    };

    const record = toMatchRecord(result, "Frontend Dev", "TestCorp", "My Resume", 2);

    expect(record.id).toBe("r-1");
    expect(record.vacancyId).toBe("v-1");
    expect(record.resumeId).toBe("res-1");
    expect(record.resumeVersionId).toBe("rv-1");
    expect(record.overallScore).toBe(82);
    expect(record.level).toBe("good");
    expect(record.matchedSkills).toEqual(["react"]);
    expect(record.missingSkills).toEqual(["docker"]);
    expect(record.vacancyTitle).toBe("Frontend Dev");
    expect(record.vacancyCompany).toBe("TestCorp");
    expect(record.resumeTitle).toBe("My Resume");
    expect(record.resumeVersionNumber).toBe(2);
    expect(record.createdAt).toBe("2026-01-01T00:00:00Z");
  });
});
