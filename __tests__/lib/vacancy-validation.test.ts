import { describe, it, expect } from "vitest";
import { validateVacancyForm } from "../../lib/vacancy-validation";
import { parseSalaryValue } from "../../services/vacancy-import";

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

  // ---------- Salary validation regression (unified with parseSalaryValue) ----------

  it("accepts valid integer salary", () => {
    const result = validateVacancyForm({ ...validData, salaryFrom: "150000" });
    expect(result.valid).toBe(true);
  });

  it("accepts salary with thousand separators", () => {
    const result = validateVacancyForm({ ...validData, salaryFrom: "150 000", salaryTo: "250 000" });
    expect(result.valid).toBe(true);
  });

  it("accepts empty salary (optional field)", () => {
    const result = validateVacancyForm({ ...validData, salaryFrom: "", salaryTo: "" });
    expect(result.valid).toBe(true);
  });

  it.each(["150000abc", "abc", "-100", "1e7", "Infinity"])("rejects malformed salary %j", (salary) => {
    const result = validateVacancyForm({ ...validData, salaryFrom: salary });
    expect(result.valid).toBe(false);
    expect(result.errors.salaryFrom).toBeDefined();
  });

  it("accepts zero salary (parseSalaryValue contract: 0 stays 0)", () => {
    const result = validateVacancyForm({ ...validData, salaryFrom: "0" });
    expect(result.valid).toBe(true);
  });

  it("parseSalaryValue stays unified between lib and services", () => {
    // The service must re-export the same implementation used by validation
    expect(parseSalaryValue("150000")).toBe(150000);
    expect(parseSalaryValue("150000abc")).toBeUndefined();
  });
});
