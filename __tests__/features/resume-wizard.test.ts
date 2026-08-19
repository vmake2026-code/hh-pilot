import { describe, it, expect } from "vitest";
import {
  createDefaultWizardData,
  createEmptyWorkExperience,
  createEmptyEducation,
  validateWizardStep,
  buildFactChecks,
  canFinalize,
  WIZARD_STEPS,
} from "../../features/resume-wizard";

describe("createDefaultWizardData", () => {
  it("creates empty data", () => {
    const data = createDefaultWizardData();
    expect(data.firstName).toBe("");
    expect(data.lastName).toBe("");
    expect(data.workExperience).toEqual([]);
    expect(data.education).toEqual([]);
    expect(data.skills).toEqual([]);
  });
});

describe("WIZARD_STEPS", () => {
  it("has 8 steps", () => {
    expect(WIZARD_STEPS.length).toBe(8);
  });

  it("steps are numbered 1-8", () => {
    WIZARD_STEPS.forEach((step, i) => {
      expect(step.number).toBe(i + 1);
    });
  });
});

describe("createEmptyWorkExperience", () => {
  it("creates empty work with id", () => {
    const w = createEmptyWorkExperience();
    expect(w.id).toBeTruthy();
    expect(w.company).toBe("");
    expect(w.position).toBe("");
    expect(w.isCurrent).toBe(false);
  });
});

describe("createEmptyEducation", () => {
  it("creates empty education with id", () => {
    const e = createEmptyEducation();
    expect(e.id).toBeTruthy();
    expect(e.institution).toBe("");
    expect(e.degree).toBe("");
  });
});

describe("validateWizardStep", () => {
  it("step 1 requires fields", () => {
    const data = createDefaultWizardData();
    const result = validateWizardStep(1, data);
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBeDefined();
  });

  it("step 2 requires desiredPosition", () => {
    const data = createDefaultWizardData();
    expect(validateWizardStep(2, data).valid).toBe(false);
  });

  it("step 5+ always valid", () => {
    const data = createDefaultWizardData();
    expect(validateWizardStep(5, data).valid).toBe(true);
    expect(validateWizardStep(7, data).valid).toBe(true);
    expect(validateWizardStep(8, data).valid).toBe(true);
  });
});

describe("buildFactChecks", () => {
  it("builds checks for all required fields", () => {
    const data = createDefaultWizardData();
    const checks = buildFactChecks(data, new Set());
    expect(checks.length).toBe(6); // firstName, lastName, city, phone, email, desiredPosition
    checks.forEach((c) => {
      expect(c.isRequired).toBe(true);
    });
  });

  it("shows confirmed when field is in confirmed set", () => {
    const data = { ...createDefaultWizardData(), firstName: "Иван" };
    const checks = buildFactChecks(data, new Set(["firstName"]));
    const fn = checks.find((c) => c.fieldPath === "firstName");
    expect(fn?.level).toBe("confirmed");
  });

  it("shows missing for empty fields", () => {
    const data = createDefaultWizardData();
    const checks = buildFactChecks(data, new Set());
    const fn = checks.find((c) => c.fieldPath === "firstName");
    expect(fn?.level).toBe("missing");
  });
});

describe("canFinalize", () => {
  it("blocks when required fields are missing", () => {
    const data = createDefaultWizardData();
    const result = canFinalize(data, new Set());
    expect(result.allowed).toBe(false);
    expect(result.blockingFields.length).toBeGreaterThan(0);
  });

  it("blocks when filled but not confirmed", () => {
    const data = {
      ...createDefaultWizardData(),
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.com",
      desiredPosition: "Dev",
    };
    const result = canFinalize(data, new Set());
    expect(result.allowed).toBe(false);
  });

  it("allows when all required fields are filled and confirmed", () => {
    const data = {
      ...createDefaultWizardData(),
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.com",
      desiredPosition: "Dev",
    };
    const confirmed = new Set([
      "firstName",
      "lastName",
      "city",
      "phone",
      "email",
      "desiredPosition",
    ]);
    const result = canFinalize(data, confirmed);
    expect(result.allowed).toBe(true);
    expect(result.blockingFields.length).toBe(0);
  });
});
