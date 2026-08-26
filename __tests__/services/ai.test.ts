import { describe, it, expect } from "vitest";
import {
  MockAIGateway,
  MockProvider,
  createAIGateway,
  normalizeAnalysis,
} from "../../services/ai";
import type { Resume } from "../../types/resume";
import type { Vacancy } from "../../types/vacancy";
import { confirmField } from "../../types/confirmation";

function makeResume(): Resume {
  return {
    id: "res-test",
    candidateId: "cand-test",
    title: "Test Resume",
    desiredPosition: confirmField("Developer"),
    summary: confirmField("Experienced dev"),
    salaryExpectation: confirmField("200k"),
    location: confirmField("Moscow"),
    workExperience: [],
    education: [],
    skills: [{ name: "TypeScript" }, { name: "React" }],
    languages: ["English"],
    currentVersionId: "v1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function makeVacancy(): Vacancy {
  return {
    id: "vac-test",
    title: "Senior Developer",
    company: "Test Corp",
    description: "We need a developer",
    requirements: [
      {
        id: "req-1",
        text: "TypeScript experience",
        isRequired: true,
        category: "skill",
      },
      {
        id: "req-2",
        text: "5 years experience",
        isRequired: true,
        category: "experience",
      },
    ],
    skills: ["TypeScript"],
    responsibilities: ["Develop features"],
    location: "Moscow",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

describe("MockAIGateway", () => {
  it("creates via factory", () => {
    const gateway = createAIGateway();
    expect(gateway).toBeInstanceOf(MockAIGateway);
  });

  it("has a mock provider", () => {
    const gateway = new MockAIGateway();
    expect(gateway.getProvider().name).toBe("mock");
  });

  it("replaces provider", () => {
    const gateway = new MockAIGateway();
    const custom = new MockProvider();
    gateway.setProvider(custom);
    expect(gateway.getProvider()).toBe(custom);
  });

  it("analyzeResume returns a valid analysis", async () => {
    const gateway = createAIGateway();
    const result = await gateway.analyzeResume(makeResume());
    expect(result.resumeId).toBe("res-test");
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it("matchResumeToVacancy returns match result", async () => {
    const gateway = createAIGateway();
    const result = await gateway.matchResumeToVacancy(
      makeResume(),
      makeVacancy(),
    );
    expect(result.resumeId).toBe("res-test");
    expect(result.vacancyId).toBe("vac-test");
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("generateCoverLetter returns a cover letter", async () => {
    const gateway = createAIGateway();
    const result = await gateway.generateCoverLetter(
      makeResume(),
      makeVacancy(),
    );
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.resumeId).toBe("res-test");
  });
});

describe("MockProvider", () => {
  it("completes a request", async () => {
    const provider = new MockProvider();
    const result = await provider.complete({ prompt: "Hello world" });
    expect(result.content).toContain("mock");
    expect(result.usage).toBeDefined();
    expect(result.usage!.totalTokens).toBeGreaterThan(0);
  });
});

// ---------- P10.1: normalizeAnalysis guard ----------

function validAnalysisPayload() {
  return {
    id: "an-1",
    resumeId: "res-test",
    versionId: "v-1",
    provider: "mock",
    overallScore: 75,
    sections: [{ section: "summary", score: 80, feedback: "ok", suggestions: ["s1"] }],
    summary: "Summary",
    strengths: ["S"],
    weaknesses: ["W"],
    recommendations: ["R"],
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("normalizeAnalysis (P10.1)", () => {
  it("passes a fully valid payload", () => {
    expect(normalizeAnalysis(validAnalysisPayload())).not.toBeNull();
  });

  it("rejects missing versionId (version binding is required)", () => {
    const p = validAnalysisPayload() as Record<string, unknown>;
    delete p.versionId;
    expect(normalizeAnalysis(p)).toBeNull();
  });

  it("rejects out-of-bounds score", () => {
    const p = validAnalysisPayload();
    p.overallScore = 120;
    expect(normalizeAnalysis(p)).toBeNull();
    p.overallScore = -1;
    expect(normalizeAnalysis(p)).toBeNull();
  });

  it("rejects non-string arrays", () => {
    const p = validAnalysisPayload() as Record<string, unknown>;
    p.strengths = [1, 2];
    expect(normalizeAnalysis(p)).toBeNull();
  });

  it("rejects malformed sections", () => {
    const p = validAnalysisPayload() as Record<string, unknown>;
    p.sections = [{ section: "summary" }];
    expect(normalizeAnalysis(p)).toBeNull();
    p.sections = "not-an-array";
    expect(normalizeAnalysis(p)).toBeNull();
  });

  it("rejects non-object and missing provider", () => {
    expect(normalizeAnalysis(null)).toBeNull();
    expect(normalizeAnalysis("text")).toBeNull();
    const p = validAnalysisPayload() as Record<string, unknown>;
    delete p.provider;
    expect(normalizeAnalysis(p)).toBeNull();
  });

  it("analyzeResume does not mutate the input resume (P10.1)", async () => {
    const gateway = createAIGateway();
    const resume = makeResume();
    resume.skills = [{ name: "React", level: "advanced" }];
    resume.workExperience = [
      { id: "w1", company: "A", position: "Dev", startDate: "01/2020", endDate: null, isCurrent: true, description: "D", achievements: ["A1"] },
    ];
    resume.education = [
      { id: "e1", level: "higher", institution: "МГУ", degree: "", field: "", startDate: "", endDate: null, description: "" },
    ];
    const before = JSON.stringify(resume);

    await gateway.analyzeResume(resume, { versionId: "v-9" });

    expect(JSON.stringify(resume)).toBe(before);
    expect(resume.skills[0].level).toBe("advanced");
    expect(resume.workExperience[0].achievements).toEqual(["A1"]);
    expect(resume.education[0].level).toBe("higher");
  });
});
