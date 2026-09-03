import { describe, it, expect } from "vitest";
import {
  createDefaultWizardData,
  createEmptyWorkExperience,
  createEmptyEducation,
  validateWizardStep,
  buildFactChecks,
  canFinalize,
  canGoBackFrom,
  canProceedFrom,
  persistDraft,
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
  it("builds checks only for confirmation-gated fields", () => {
    const data = createDefaultWizardData();
    const checks = buildFactChecks(data, new Set());
    expect(checks.length).toBe(3); // phone, email, desiredPosition
    expect(checks.map((c) => c.fieldPath)).toEqual([
      "phone",
      "email",
      "desiredPosition",
    ]);
    checks.forEach((c) => {
      expect(c.isRequired).toBe(true);
    });
  });

  it("excludes name and city from fact-check", () => {
    const checks = buildFactChecks(createDefaultWizardData(), new Set());
    const paths = checks.map((c) => c.fieldPath);
    expect(paths).not.toContain("firstName");
    expect(paths).not.toContain("lastName");
    expect(paths).not.toContain("city");
  });

  it("shows confirmed when field is in confirmed set", () => {
    const data = { ...createDefaultWizardData(), phone: "+79001234567" };
    const checks = buildFactChecks(data, new Set(["phone"]));
    const phone = checks.find((c) => c.fieldPath === "phone");
    expect(phone?.level).toBe("confirmed");
  });

  it("shows missing for empty fields", () => {
    const data = createDefaultWizardData();
    const checks = buildFactChecks(data, new Set());
    const phone = checks.find((c) => c.fieldPath === "phone");
    expect(phone?.level).toBe("missing");
  });
});

describe("canFinalize", () => {
  function filledData() {
    return {
      ...createDefaultWizardData(),
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.com",
      desiredPosition: "Dev",
    };
  }
  const contactConfirmed = new Set(["phone", "email", "desiredPosition"]);

  it("blocks when required fields are missing", () => {
    const result = canFinalize(createDefaultWizardData(), new Set());
    expect(result.allowed).toBe(false);
    expect(result.blockingFields.length).toBeGreaterThan(0);
  });

  it("allows when only phone/email/desiredPosition are confirmed (P6.3)", () => {
    // firstName/lastName/city заполнены, но НЕ подтверждены — не блокируют.
    const result = canFinalize(filledData(), contactConfirmed);
    expect(result.allowed).toBe(true);
    expect(result.blockingFields.length).toBe(0);
  });

  it("blocks when filled but not confirmed", () => {
    const result = canFinalize(filledData(), new Set());
    expect(result.allowed).toBe(false);
  });

  it("blocks when phone is not confirmed", () => {
    const confirmed = new Set(["email", "desiredPosition"]);
    const result = canFinalize(filledData(), confirmed);
    expect(result.allowed).toBe(false);
    expect(result.blockingFields).toContain("Телефон");
  });

  it("blocks when email is not confirmed", () => {
    const confirmed = new Set(["phone", "desiredPosition"]);
    const result = canFinalize(filledData(), confirmed);
    expect(result.allowed).toBe(false);
    expect(result.blockingFields).toContain("Email");
  });

  it("blocks when desiredPosition is not confirmed", () => {
    const confirmed = new Set(["phone", "email"]);
    const result = canFinalize(filledData(), confirmed);
    expect(result.allowed).toBe(false);
    expect(result.blockingFields).toContain("Желаемая должность");
  });
});

// ---------- P14-F1: wizard navigation contract ----------

describe("wizard navigation contract (P14-F1)", () => {
  it("step 1 -> no back (first step)", () => {
    expect(canGoBackFrom(1)).toBe(false);
  });

  it("steps 2..8 -> back available (no dead end on preview/fact-check)", () => {
    for (const step of [2, 3, 4, 5, 6, 7, 8] as const) {
      expect(canGoBackFrom(step)).toBe(true);
    }
  });

  it("finalize stays blocked on step 8 when confirmations incomplete", () => {
    const data = createDefaultWizardData(); // nothing confirmed
    const { allowed } = canFinalize(data, new Set());
    expect(allowed).toBe(false);
    expect(canProceedFrom(8, allowed)).toBe(false);
  });

  it("step 7 advance stays blocked when confirmations incomplete", () => {
    const { allowed } = canFinalize(createDefaultWizardData(), new Set());
    expect(canProceedFrom(7, allowed)).toBe(false);
  });

  it("having back does not bypass confirmations: allowed finalize stays allowed", () => {
    const confirmed = new Set(["phone", "email", "desiredPosition"]);
    const data = {
      ...createDefaultWizardData(),
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.com",
      desiredPosition: "Dev",
    };
    const { allowed } = canFinalize(data, confirmed);
    expect(allowed).toBe(true);
    expect(canProceedFrom(8, allowed)).toBe(true);
  });

  it("steps 1..6 advance regardless of confirmations (step gating unchanged)", () => {
    // Existing step validation (steps 1-5) governs advancement via goNext;
    // the navigation gate itself must stay permissive before step 7.
    expect(canProceedFrom(3, false)).toBe(true);
    expect(canProceedFrom(6, false)).toBe(true);
  });
});

// ---------- P14-F2: draft save failure is visible, not silent ----------

describe("persistDraft write-failure contract (P14-F2)", () => {
  function makeStore() {
    // Minimal PersistenceStore fake: set throws QuotaExceededError.
    return {
      get(): null { return null; },
      set(): void {
        throw Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
      },
      remove(): void {},
    };
  }

  function makeData() {
    return {
      ...createDefaultWizardData(),
      firstName: "Иван",
      phone: "+79001234567",
    };
  }

  it("write failure -> returns false (draft NOT reported as saved)", () => {
    const result = persistDraft(makeStore(), "new", makeData(), 3, new Set(["phone"]));
    expect(result).toBe(false);
  });

  it("successful write -> returns true", () => {
    const written: unknown[] = [];
    const store = {
      get(): null { return null; },
      set(_key: string, value: unknown): void { written.push(value); },
      remove(): void {},
    };
    const result = persistDraft(store, "new", makeData(), 3, new Set(["phone"]));
    expect(result).toBe(true);
    expect(written.length).toBe(1);
  });
});
