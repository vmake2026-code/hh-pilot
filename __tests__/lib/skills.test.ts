import { describe, it, expect } from "vitest";
import { normalizeSkill, SKILL_ALIASES } from "../../lib/skills";
import { normalizeSkill as matchingNormalize } from "../../services/matching";
import { normalizeSkill as importNormalize } from "../../services/vacancy-import";

describe("lib/skills normalizeSkill", () => {
  it("lowercases and trims", () => {
    expect(normalizeSkill("  React  ")).toBe("react");
  });

  it("React.js → react", () => {
    expect(normalizeSkill("React.js")).toBe("react");
  });

  it("ReactJS → react", () => {
    expect(normalizeSkill("ReactJS")).toBe("react");
  });

  it("react passes through", () => {
    expect(normalizeSkill("react")).toBe("react");
  });

  it("k8s → kubernetes", () => {
    expect(normalizeSkill("k8s")).toBe("kubernetes");
  });

  it("Kubernetes → kubernetes (case-insensitive)", () => {
    expect(normalizeSkill("Kubernetes")).toBe("kubernetes");
  });

  it("MS Excel → excel", () => {
    expect(normalizeSkill("MS Excel")).toBe("excel");
  });

  it("Microsoft Excel → excel", () => {
    expect(normalizeSkill("Microsoft Excel")).toBe("excel");
  });

  it("C# → csharp", () => {
    expect(normalizeSkill("C#")).toBe("csharp");
  });

  it("unknown skill passes through unchanged (lowercased)", () => {
    expect(normalizeSkill("CustomSkill")).toBe("customskill");
  });

  it("empty string stays empty", () => {
    expect(normalizeSkill("")).toBe("");
  });
});

describe("CI/CD parity (Stage 6 regression)", () => {
  it('"CI/CD" → cicd', () => {
    expect(normalizeSkill("CI/CD")).toBe("cicd");
  });

  it('"cicd" → cicd', () => {
    expect(normalizeSkill("cicd")).toBe("cicd");
  });

  it('"ci/cd" (lowercase) → cicd', () => {
    expect(normalizeSkill("ci/cd")).toBe("cicd");
  });

  it('"CI CD" (space variant) → cicd', () => {
    expect(normalizeSkill("CI CD")).toBe("cicd");
  });

  it("CI/CD in resume matches cicd in vacancy", () => {
    const resumeSkill = normalizeSkill("CI/CD");
    const vacancySkill = normalizeSkill("cicd");
    expect(resumeSkill).toBe(vacancySkill);
  });
});

describe("single source of normalization across services", () => {
  const parityCases = [
    "CI/CD",
    "cicd",
    "ci/cd",
    "React.js",
    "ReactJS",
    "react",
    "k8s",
    "Kubernetes",
    "MS Excel",
    "C#",
    "Node.js",
    "PostgreSQL",
    "JS",
    "TS",
    "Vue.js",
    "Next.js",
    "SCSS",
    "Golang",
    "Неизвестный навык",
    "custom-skill",
  ];

  it.each(parityCases)("matching.normalizeSkill(%j) === import.normalizeSkill(%j)", (raw) => {
    expect(matchingNormalize(raw)).toBe(importNormalize(raw));
  });

  it.each(parityCases)("lib normalizeSkill(%j) === matching.normalizeSkill(%j)", (raw) => {
    expect(normalizeSkill(raw)).toBe(matchingNormalize(raw));
  });

  it("SKILL_ALIASES contains the shared canonical aliases", () => {
    expect(SKILL_ALIASES["ci/cd"]).toBe("cicd");
    expect(SKILL_ALIASES["github"]).toBe("git");
    expect(SKILL_ALIASES["ms excel"]).toBe("excel");
    expect(SKILL_ALIASES["google sheets"]).toBe("google_sheets");
  });
});
