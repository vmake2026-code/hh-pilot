import { describe, it, expect } from "vitest";
import {
  MockAIGateway,
  MockProvider,
  createAIGateway,
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
