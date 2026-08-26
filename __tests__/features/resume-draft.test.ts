import { describe, it, expect } from "vitest";
import {
  DRAFT_CONTEXT_NEW,
  createDefaultWizardData,
  createDraftState,
  draftKeyFor,
  normalizeDraft,
  type WizardData,
} from "../../features/resume-wizard";
import { createPersistenceStore, InMemoryStore } from "../../lib/persistence";

function makeWizardData(overrides: Partial<WizardData> = {}): WizardData {
  return {
    ...createDefaultWizardData(),
    firstName: "Иван",
    lastName: "Иванов",
    city: "Москва",
    phone: "+79001234567",
    email: "ivan@test.com",
    desiredPosition: "Frontend Developer",
    ...overrides,
  };
}

describe("draftKeyFor", () => {
  it("uses the dedicated new-resume context", () => {
    expect(draftKeyFor(DRAFT_CONTEXT_NEW)).toBe("resume-draft:new");
  });

  it("binds the edit context to a concrete resumeId", () => {
    expect(draftKeyFor("abc-123")).toBe("resume-draft:abc-123");
    expect(draftKeyFor("abc-123")).not.toBe(draftKeyFor("def-456"));
  });
});

describe("createDraftState + normalizeDraft roundtrip", () => {
  it("preserves data, step and confirmedFields", () => {
    const data = makeWizardData();
    const state = createDraftState(
      data,
      4,
      new Set(["firstName", "lastName", "city", "phone", "email", "desiredPosition"]),
    );
    const restored = normalizeDraft(JSON.parse(JSON.stringify(state)));

    expect(restored).not.toBeNull();
    expect(restored?.step).toBe(4);
    expect(restored?.confirmedFields).toEqual([
      "firstName",
      "lastName",
      "city",
      "phone",
      "email",
      "desiredPosition",
    ]);
    expect(restored?.data).toEqual(data);
  });

  it("clamps an out-of-range step to 1", () => {
    const state = createDraftState(makeWizardData(), 99, new Set());
    expect(normalizeDraft(state)?.step).toBe(1);
    expect(normalizeDraft({ data: makeWizardData(), step: -2 })?.step).toBe(1);
    expect(normalizeDraft({ data: makeWizardData(), step: "3" })?.step).toBe(1);
  });

  it("filters non-string entries from confirmedFields", () => {
    const state = { data: makeWizardData(), step: 2, confirmedFields: ["firstName", 42, null] };
    expect(normalizeDraft(state)?.confirmedFields).toEqual(["firstName"]);
  });
});

describe("normalizeDraft legacy compatibility", () => {
  it("accepts a bare WizardData (old format) with step 1 and no confirmations", () => {
    const legacy = makeWizardData();
    const restored = normalizeDraft(JSON.parse(JSON.stringify(legacy)));

    expect(restored).not.toBeNull();
    expect(restored?.data.desiredPosition).toBe("Frontend Developer");
    expect(restored?.step).toBe(1);
    expect(restored?.confirmedFields).toEqual([]);
  });

  it("backfills missing fields from defaults in a partial legacy draft", () => {
    const partial = {
      firstName: "Пётр",
      lastName: "Петров",
      desiredPosition: "",
      workExperience: [],
      education: [],
      skills: [],
      languages: [],
    };
    const restored = normalizeDraft(partial);

    expect(restored).not.toBeNull();
    expect(restored?.data.firstName).toBe("Пётр");
    expect(restored?.data.middleName).toBe("");
    expect(restored?.data.workExperience).toEqual([]);
  });

  it("returns null for garbage input", () => {
    expect(normalizeDraft(null)).toBeNull();
    expect(normalizeDraft(undefined)).toBeNull();
    expect(normalizeDraft("text")).toBeNull();
    expect(normalizeDraft(42)).toBeNull();
    expect(normalizeDraft({ foo: 1 })).toBeNull();
  });
});

describe("clearing one draft context does not affect another", () => {
  it("removes only the current context key", () => {
    const store = createPersistenceStore<unknown>();
    expect(store).toBeInstanceOf(InMemoryStore);

    const newData = makeWizardData({ firstName: "New" });
    const editData = makeWizardData({ firstName: "Edit" });

    store.set(draftKeyFor(DRAFT_CONTEXT_NEW), createDraftState(newData, 1, new Set()));
    store.set(draftKeyFor("resume-1"), createDraftState(editData, 3, new Set(["firstName"])));

    // Finalize in the NEW context clears only its own key.
    store.remove(draftKeyFor(DRAFT_CONTEXT_NEW));

    expect(store.get(draftKeyFor(DRAFT_CONTEXT_NEW))).toBeNull();
    const kept = normalizeDraft(store.get(draftKeyFor("resume-1")));
    expect(kept?.data.firstName).toBe("Edit");
    expect(kept?.step).toBe(3);
  });
});

describe("draft independence from confirmations (P6.3)", () => {
  it("keeps firstName/lastName/city in draft regardless of confirmedFields", () => {
    const data = makeWizardData({ firstName: "Пётр", lastName: "Петров", city: "Сочи" });
    // Подтверждён только телефон — ФИО/город не в наборе.
    const state = createDraftState(data, 2, new Set(["phone"]));
    const restored = normalizeDraft(JSON.parse(JSON.stringify(state)));

    expect(restored?.data.firstName).toBe("Пётр");
    expect(restored?.data.lastName).toBe("Петров");
    expect(restored?.data.city).toBe("Сочи");
    expect(restored?.confirmedFields).toEqual(["phone"]);
  });
});

// ---------- P9.1 Education level in draft ----------

describe("education level draft roundtrip (P9.1)", () => {
  it("preserves Skill-like extra fields: education level survives JSON envelope", () => {
    const data = makeWizardData();
    data.education = [
      { id: "e1", institution: "МГУ", degree: "Бакалавр", field: "Информатика", startDate: "09/2016", endDate: "06/2020", description: "", level: "higher" },
      { id: "e2", institution: "Колледж", degree: "Техник", field: "Сети", startDate: "09/2012", endDate: "06/2016", description: "", level: "secondary_special" },
    ];
    const restored = normalizeDraft(JSON.parse(JSON.stringify(createDraftState(data, 4, new Set()))));

    expect(restored?.data.education[0].level).toBe("higher");
    expect(restored?.data.education[1].level).toBe("secondary_special");
  });

  it("legacy education without level stays restorable (undefined, no crash)", () => {
    const legacy = makeWizardData();
    legacy.education = [
      { id: "e1", institution: "Старый вуз", degree: "Специалист", field: "Физика", startDate: "2005-09", endDate: null, description: "" } as WizardData["education"][number],
    ];
    const restored = normalizeDraft(JSON.parse(JSON.stringify(legacy)));
    expect(restored?.data.education[0].institution).toBe("Старый вуз");
    expect(restored?.data.education[0].level).toBeUndefined();
  });
});

// ---------- P9.2 Skill levels: draft & finalize lifecycle ----------

describe("skill level draft roundtrip (P9.2)", () => {
  it("different levels survive JSON envelope", () => {
    const data = makeWizardData();
    data.skills = [
      { name: "React", level: "advanced" },
      { name: "Vue", level: "beginner" },
      { name: "TypeScript", level: "intermediate" },
    ];
    const restored = normalizeDraft(JSON.parse(JSON.stringify(createDraftState(data, 5, new Set()))));
    expect(restored?.data.skills.map((s) => s.level)).toEqual(["advanced", "beginner", "intermediate"]);
  });

  it("legacy skill without level restores without crash", () => {
    const legacy = makeWizardData();
    legacy.skills = [{ name: "Старый навык" }];
    const restored = normalizeDraft(JSON.parse(JSON.stringify(legacy)));
    expect(restored?.data.skills[0].name).toBe("Старый навык");
    expect(restored?.data.skills[0].level).toBeUndefined();
  });
});

// ---------- P9.1.1: all 8 HH levels through draft ----------

describe("education level draft roundtrip all 8 (P9.1.1)", () => {
  it("preserves every canonical level after JSON envelope", () => {
    const levels = ["secondary", "secondary_special", "unfinished_higher", "higher", "bachelor", "master", "candidate", "doctor"] as const;
    const data = makeWizardData();
    data.education = levels.map((level, i) => ({
      id: `e${i}`, institution: `Вуз ${i}`, degree: "", field: "",
      startDate: "09/2016", endDate: null, description: "", level,
    }));
    const restored = normalizeDraft(JSON.parse(JSON.stringify(createDraftState(data, 4, new Set()))));
    expect(restored?.data.education.map((e) => e.level)).toEqual([...levels]);
  });
});
