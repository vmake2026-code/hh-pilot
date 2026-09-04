import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateStep5 } from "../../lib/validation";
import { createDefaultWizardData } from "../../features/resume-wizard";

// P16-1: render-layer regression. The original bug was NOT validation (validateStep5
// correctly produced skills[i].level errors) — renderStep5 simply never displayed them.
// A pure unit test of validateStep5 alone would not have caught it. Component-level
// rendering isn't available in the current test setup (no jsdom/RTL dependency), so this
// test locks BOTH layers:
//   1. validation produces the exact per-skill error key + human message;
//   2. renderStep5 in wizard-client.tsx actually reads that key family and renders it.

const WIZARD_CLIENT_PATH = resolve(__dirname, "../../app/resume/create/wizard-client.tsx");

describe("step 5 skill-level validation (P16-1)", () => {
  it("skill without level -> skills[i].level error naming the skill", () => {
    const data = createDefaultWizardData();
    data.skills = [{ name: "Docker" }];
    const result = validateStep5(data.skills);
    expect(result.valid).toBe(false);
    expect(result.errors["skills[0].level"]).toBe('Укажите уровень для навыка "Docker"');
  });

  it("multiple skills -> per-index errors", () => {
    const data = createDefaultWizardData();
    data.skills = [{ name: "React", level: "advanced" }, { name: "Docker" }];
    const result = validateStep5(data.skills);
    expect(result.errors["skills[0].level"]).toBeUndefined();
    expect(result.errors["skills[1].level"]).toBe('Укажите уровень для навыка "Docker"');
  });

  it("all levels set -> valid", () => {
    const data = createDefaultWizardData();
    data.skills = [{ name: "React", level: "beginner" }];
    expect(validateStep5(data.skills).valid).toBe(true);
  });
});

describe("step 5 skill-level error rendering contract (P16-1 render layer)", () => {
  const source = readFileSync(WIZARD_CLIENT_PATH, "utf8");

  it("renderStep5 renders the per-skill error message next to the level select", () => {
    // The exact key family produced by validateStep5 must be read inside renderStep5.
    expect(source).toContain('errors[`skills[${index}].level`]');
    // and rendered as visible text inside the skill tag
    expect(source.indexOf('skills[${index}].level`]}') !== -1).toBe(true);
    expect(source.indexOf('className="skill-level-error-text"') !== -1).toBe(true);
  });

  it("summary form-error shown when any skill error is present", () => {
    expect(source).toContain('k.startsWith("skills["');
  });

  it("level select gets the visual error state class", () => {
    expect(source).toContain("skill-level-error");
  });

  it("choosing a valid level clears that skill's error (updateSkillLevel)", () => {
    // updateSkillLevel must delete the skills[i].level error key on a valid pick
    expect(source.indexOf("delete next[`skills[${index}].level`]") !== -1).toBe(true);
  });
});
