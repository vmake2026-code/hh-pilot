import { describe, it, expect } from "vitest";
import {
  validateRequired,
  validateEmail,
  validatePhone,
  isValidMonthYear,
  validateDateRange,
  validateWorkExperience,
  validateEducation,
  validateSkills,
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
} from "../../lib/validation";
import { createDefaultWizardData, validateWizardStep } from "../../features/resume-wizard";

describe("validateRequired", () => {
  it("rejects empty strings", () => {
    expect(validateRequired("", "Name")).toBe('Поле "Name" обязательно для заполнения');
    expect(validateRequired("   ", "Name")).toBe('Поле "Name" обязательно для заполнения');
  });

  it("accepts non-empty strings", () => {
    expect(validateRequired("hello", "Name")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("rejects empty email", () => {
    expect(validateEmail("")).toBe("Email обязателен для заполнения");
  });

  it("rejects invalid format", () => {
    expect(validateEmail("not-an-email")).toBe("Введите корректный email");
    expect(validateEmail("@no-local.com")).toBe("Введите корректный email");
  });

  it("accepts valid email", () => {
    expect(validateEmail("user@example.com")).toBeNull();
  });
});

describe("validatePhone", () => {
  it("rejects empty phone", () => {
    expect(validatePhone("")).toBe("Телефон обязателен для заполнения");
  });

  it("rejects invalid format", () => {
    expect(validatePhone("123")).toBe("Введите корректный номер телефона");
  });

  it("accepts valid phone", () => {
    expect(validatePhone("+79001234567")).toBeNull();
    expect(validatePhone("8 (900) 123-45-67")).toBeNull();
  });
});

describe("validateDateRange", () => {
  it("requires start date", () => {
    expect(validateDateRange("", null, "Job")).toBe('Укажите дату начала для "Job"');
  });

  it("rejects end before start", () => {
    expect(validateDateRange("12/2023", "11/2022", "Job")).toBe(
      'Дата окончания не может быть раньше даты начала для "Job"',
    );
  });

  it("accepts valid range", () => {
    expect(validateDateRange("11/2022", "12/2023", "Job")).toBeNull();
  });

  it("accepts null end date", () => {
    expect(validateDateRange("11/2022", null, "Job")).toBeNull();
  });

  // ---------- Strict MM/YYYY format policy ----------

  it.each(["01/2020", "12/2025", "09/1999"])("accepts MM/YYYY %j", (date) => {
    expect(validateDateRange(date, null, "Job")).toBeNull();
  });

  it.each([
    "1/2020",
    "13/2020",
    "00/2020",
    "12/20",
    "2020/12",
    "abc",
    "13/x",
    "2022-01",
  ])("rejects non-MM/YYYY %j", (date) => {
    expect(validateDateRange(date, null, "Job")).toBe(
      'Дата начала должна быть в формате ММ/ГГГГ для "Job"',
    );
  });

  it("rejects malformed end date format", () => {
    expect(validateDateRange("01/2020", "13/2020", "Job")).toBe(
      'Дата окончания должна быть в формате ММ/ГГГГ для "Job"',
    );
  });
});

describe("isValidMonthYear", () => {
  it.each(["01/2020", "09/1999", "12/2025"])("accepts %j", (date) => {
    expect(isValidMonthYear(date)).toBe(true);
  });

  it.each([
    "1/2020",
    "13/2020",
    "00/2020",
    "12/20",
    "2020/12",
    "abc",
    "13/x",
    "",
    "01/2020/01",
  ])("rejects %j", (date) => {
    expect(isValidMonthYear(date)).toBe(false);
  });
});

describe("validateWorkExperience", () => {
  it("returns errors for empty work entries", () => {
    const items = [
      { id: "1", company: "", position: "", startDate: "", endDate: null, isCurrent: false, description: "", achievements: [] },
    ];
    const errors = validateWorkExperience(items);
    expect(errors["work[0].company"]).toBeDefined();
    expect(errors["work[0].position"]).toBeDefined();
  });

  it("returns no errors for valid entries", () => {
    const items = [
      { id: "1", company: "Google", position: "Dev", startDate: "01/2022", endDate: null, isCurrent: true, description: "", achievements: [] },
    ];
    expect(Object.keys(validateWorkExperience(items)).length).toBe(0);
  });
});

describe("validateEducation", () => {
  it("returns errors for empty education entries", () => {
    const items = [
      { id: "1", level: undefined, institution: "", degree: "", field: "", startDate: "", endDate: null, description: "" },
    ];
    const errors = validateEducation(items);
    expect(errors["edu[0].level"]).toBeDefined();
    expect(errors["edu[0].institution"]).toBeDefined();
    expect(errors["edu[0].degree"]).toBeDefined();
  });

  it("returns no errors for a fully valid entry (P9.1)", () => {
    const errors = validateEducation([
      { id: "1", level: "higher", institution: "МГУ", degree: "Бакалавр", field: "Информатика", startDate: "09/2016", endDate: "06/2020", description: "" },
    ]);
    expect(Object.keys(errors).length).toBe(0);
  });

  it.each(["xyz", "", "13/2020"])("rejects arbitrary level %j", (level) => {
    const errors = validateEducation([
      // @ts-expect-error — проверяем рантайм-отклонение произвольных строк
      { id: "1", level, institution: "МГУ", degree: "Бакалавр", field: "", startDate: "09/2016", endDate: null, description: "" },
    ]);
    expect(errors["edu[0].level"]).toBeDefined();
  });
});

describe("validateStep1", () => {
  it("requires firstName, lastName, city, phone, email", () => {
    const result = validateStep1({ firstName: "", lastName: "", city: "", phone: "", email: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBeDefined();
    expect(result.errors.lastName).toBeDefined();
    expect(result.errors.city).toBeDefined();
    expect(result.errors.phone).toBeDefined();
    expect(result.errors.email).toBeDefined();
  });

  it("passes with valid data", () => {
    const result = validateStep1({
      firstName: "Иван",
      lastName: "Иванов",
      city: "Москва",
      phone: "+79001234567",
      email: "ivan@test.com",
    });
    expect(result.valid).toBe(true);
  });
});

describe("validateStep2", () => {
  it("requires desiredPosition", () => {
    expect(validateStep2({ desiredPosition: "" }).valid).toBe(false);
  });

  it("passes with position", () => {
    expect(validateStep2({ desiredPosition: "Developer" }).valid).toBe(true);
  });
});

describe("validateStep3", () => {
  it("passes with empty work experience", () => {
    expect(validateStep3([]).valid).toBe(true);
  });

  it("validates work entries", () => {
    const result = validateStep3([
      { id: "1", company: "", position: "", startDate: "", endDate: null, isCurrent: false, description: "", achievements: [] },
    ]);
    expect(result.valid).toBe(false);
  });
});

describe("validateStep4", () => {
  it("passes with empty education", () => {
    expect(validateStep4([]).valid).toBe(true);
  });
});

// ---------- P9.2 Skill level validation ----------

describe("validateSkills", () => {
  it("flags skills without a valid level", () => {
    const errors = validateSkills([
      { name: "React" },
      { name: "Vue", level: "advanced" },
      // @ts-expect-error runtime guard against arbitrary strings
      { name: "SQL", level: "expert-legacy" },
    ]);
    expect(errors["skills[0].level"]).toBeDefined();
    expect(errors["skills[1].level"]).toBeUndefined();
    expect(errors["skills[2].level"]).toBeDefined();
  });

  it("passes when every skill has an HH-triad level", () => {
    const errors = validateSkills([
      { name: "React", level: "advanced" },
      { name: "Vue", level: "beginner" },
      { name: "SQL", level: "intermediate" },
    ]);
    expect(Object.keys(errors).length).toBe(0);
  });
});

describe("validateWizardStep step 5 (P9.2)", () => {
  it("blocks Next while any skill lacks a level", () => {
    const data = createDefaultWizardData();
    data.skills = [{ name: "React" }];
    const result = validateWizardStep(5, data);
    expect(result.valid).toBe(false);
  });

  it("allows Next when all levels are chosen", () => {
    const data = createDefaultWizardData();
    data.skills = [{ name: "React", level: "intermediate" }];
    expect(validateWizardStep(5, data).valid).toBe(true);
  });
});
