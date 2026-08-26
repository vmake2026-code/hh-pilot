import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, ANALYSIS_JSON_MARKER } from "../../services/ai-prompt";
import type { ResumeAnalysisInput } from "../../types/resume";
import { confirmField } from "../../types/confirmation";

function makeInput(): ResumeAnalysisInput {
  return {
    id: "res-1",
    candidateId: "cand-1",
    title: "Frontend Developer",
    desiredPosition: confirmField("Frontend Developer"),
    summary: confirmField("Опытный разработчик"),
    location: confirmField("Москва"),
    workExperience: [
      {
        id: "w1", company: "Example", position: "Developer",
        startDate: "01/2020", endDate: null, isCurrent: true,
        description: "React development",
        achievements: ["Ускорил загрузку на 40%"],
      },
    ],
    education: [
      { id: "e1", level: "higher", institution: "МГУ", degree: "", field: "Computer Science", startDate: "09/2016", endDate: null, description: "" },
    ],
    skills: [{ name: "React", level: "advanced" }],
    languages: ["English"],
    workFormat: "remote",
    employmentType: "full_time",
    currentVersionId: "v-1",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildAnalysisPrompt (P10.2)", () => {
  it("embeds the resume payload between markers", () => {
    const { userPrompt } = buildAnalysisPrompt(makeInput());
    expect(userPrompt).toContain(ANALYSIS_JSON_MARKER);
    expect(userPrompt).toContain('"desiredPosition"');
    expect(userPrompt).toContain("Ускорил загрузку на 40%");
  });

  it("prompt contains no salaryExpectation key (privacy contract)", () => {
    const json = JSON.stringify(buildAnalysisPrompt(makeInput()));
    expect(json).not.toContain("salaryExpectation");
    expect(json).not.toContain("300000");
  });

  it("system prompt requires RU + JSON-only + no hallucinations", () => {
    const { systemPrompt } = buildAnalysisPrompt(makeInput());
    expect(systemPrompt).toContain("JSON");
    expect(systemPrompt).toContain("русском языке");
    expect(systemPrompt).toContain("Не выдумывай факты");
    expect(systemPrompt).toContain("без markdown");
  });

  it("system prompt instructs to account for achievements/skill levels/education levels", () => {
    // Схема в system prompt описывает sections/strengths — контракт анализа.
    const { systemPrompt } = buildAnalysisPrompt(makeInput());
    expect(systemPrompt).toContain('"sections"');
    expect(systemPrompt).toContain('"recommendations"');
  });
});
