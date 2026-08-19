import { describe, it, expect } from "vitest";
import { validateVacancyForm } from "../../lib/vacancy-validation";

describe("validateVacancyForm", () => {
  const validData = {
    title: "Frontend Developer",
    company: "Test Corp",
    location: "Москва",
    description: "Разработка SPA",
    salaryFrom: "150000",
    salaryTo: "250000",
    sourceUrl: "",
    skills: ["React", "TypeScript"],
    requirements: ["Опыт 2+ года"],
    responsibilities: ["Разработка UI"],
  };

  it("passes with valid data", () => {
    const result = validateVacancyForm(validData);
    expect(result.valid).toBe(true);
  });

  it("requires title", () => {
    const result = validateVacancyForm({ ...validData, title: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it("requires company", () => {
    const result = validateVacancyForm({ ...validData, company: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.company).toBeDefined();
  });

  it("requires description", () => {
    const result = validateVacancyForm({ ...validData, description: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.description).toBeDefined();
  });

  it("validates URL format", () => {
    const result = validateVacancyForm({ ...validData, sourceUrl: "not-a-url" });
    expect(result.valid).toBe(false);
    expect(result.errors.sourceUrl).toBeDefined();
  });

  it("accepts valid URL", () => {
    const result = validateVacancyForm({ ...validData, sourceUrl: "https://hh.ru/vacancy/123" });
    expect(result.valid).toBe(true);
  });

  it("validates salary range", () => {
    const result = validateVacancyForm({ ...validData, salaryFrom: "300000", salaryTo: "100000" });
    expect(result.valid).toBe(false);
    expect(result.errors.salaryTo).toBeDefined();
  });
});
