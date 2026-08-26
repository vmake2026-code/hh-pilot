import { describe, it, expect } from "vitest";
import {
  normalizeSkill,
  matchSkills,
  matchRequirements,
  matchExperience,
  matchFormat,
  matchEmploymentType,
  calculateYearsExperience,
  calculateMatch,
  extractRequiredYears,
} from "../../services/matching";
import type { Vacancy } from "../../types/vacancy";
import type { ResumeVersion } from "../../types/resume";
import { confirmField, missingField } from "../../types/confirmation";

function makeVersion(overrides: Partial<ResumeVersion["data"]> = {}): ResumeVersion {
  return {
    id: "v1",
    resumeId: "res1",
    versionNumber: 1,
    data: {
      desiredPosition: confirmField("Frontend Developer"),
      summary: missingField(),
      salaryExpectation: missingField(),
      location: confirmField("Москва"),
      workExperience: [
        { id: "we1", company: "A", position: "Frontend Developer", startDate: "2020-01", endDate: null, isCurrent: true, description: "Разработка React приложений", achievements: [] },
      ],
      education: [],
      skills: [{ name: "React" }, { name: "TypeScript" }],
      languages: [],
      workFormat: "",
      employmentType: "",
      ...overrides,
    },
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeVacancy(overrides: Partial<Vacancy> = {}): Vacancy {
  return {
    id: "v1",
    title: "Frontend Developer",
    company: "Test Corp",
    description: "Разработка SPA",
    requirements: [
      { id: "r1", text: "React experience", isRequired: true, category: "skill" },
      { id: "r2", text: "TypeScript", isRequired: true, category: "skill" },
    ],
    skills: ["React", "TypeScript"],
    responsibilities: [],
    location: "Москва",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------- Skill normalization ----------

describe("normalizeSkill", () => {
  it("lowercases", () => { expect(normalizeSkill("React")).toBe("react"); });
  it("trims whitespace", () => { expect(normalizeSkill("  TypeScript  ")).toBe("typescript"); });
  it("React.js → react", () => { expect(normalizeSkill("React.js")).toBe("react"); });
  it("ReactJS → react", () => { expect(normalizeSkill("ReactJS")).toBe("react"); });
  it("Node.js → node", () => { expect(normalizeSkill("Node.js")).toBe("node"); });
  it("NodeJS → node", () => { expect(normalizeSkill("NodeJS")).toBe("node"); });
  it("PostgreSQL → postgresql", () => { expect(normalizeSkill("PostgreSQL")).toBe("postgresql"); });
  it("Postgres → postgresql", () => { expect(normalizeSkill("Postgres")).toBe("postgresql"); });
  it("JS → javascript", () => { expect(normalizeSkill("JS")).toBe("javascript"); });
  it("TS → typescript", () => { expect(normalizeSkill("TS")).toBe("typescript"); });
  it("k8s → kubernetes", () => { expect(normalizeSkill("k8s")).toBe("kubernetes"); });
  it("unknown passes through", () => { expect(normalizeSkill("CustomSkill")).toBe("customskill"); });
});

// ---------- Skills matching ----------

describe("matchSkills", () => {
  it("identical skills → all matched", () => {
    const r = matchSkills(["react", "typescript"], ["react", "typescript"]);
    expect(r.matched).toEqual(["react", "typescript"]);
    expect(r.missing).toEqual([]);
  });
  it("no matching → all missing", () => {
    const r = matchSkills(["react", "vue"], ["angular"]);
    expect(r.matched).toEqual([]);
    expect(r.missing.length).toBe(2);
  });
  it("partial skills", () => {
    const r = matchSkills(["react", "vue"], ["react"]);
    expect(r.matched).toEqual(["react"]);
    expect(r.missing).toEqual(["vue"]);
  });
  it("case normalization", () => {
    const r = matchSkills(["React", "TYPESCRIPT"], ["react", "typescript"]);
    expect(r.matched.length).toBe(2);
  });
  it("React.js === React", () => {
    expect(matchSkills(["React.js"], ["react"]).matched).toEqual(["React.js"]);
  });
  it("ReactJS === React", () => {
    expect(matchSkills(["ReactJS"], ["react"]).matched).toEqual(["ReactJS"]);
  });
  it("PostgreSQL === Postgres", () => {
    expect(matchSkills(["PostgreSQL"], ["Postgres"]).matched).toEqual(["PostgreSQL"]);
  });
});

// ---------- Requirements matching ----------

describe("matchRequirements", () => {
  it("matched skill requirement", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "React experience", isRequired: true, category: "skill" }],
      ["react"], [], [],
    );
    expect(r.matched.length).toBe(1);
  });
  it("missing requirement", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Docker experience", isRequired: true, category: "skill" }],
      ["react"], [], [],
    );
    expect(r.missing.length).toBe(1);
  });
  it("unknown category not treated as matched", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Some obscure requirement", isRequired: true, category: "other" }],
      ["react"], [], [],
    );
    expect(r.matched.length).toBe(0);
  });

  it("backward compatible: called without resumeLanguages argument", () => {
    const r = matchRequirements(
      [
        { id: "r1", text: "Английский B2", isRequired: true, category: "language" },
        { id: "r2", text: "React experience", isRequired: true, category: "skill" },
      ],
      ["react"], ["Frontend Developer"], ["Разработка React приложений"],
    );
    expect(r.matched.map((m) => m.requirementId)).toEqual(["r2"]);
    expect(r.missing.map((m) => m.requirementId)).toEqual(["r1"]);
  });

  it("language matched against resume languages", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Английский B2", isRequired: true, category: "language" }],
      [], [], [],
      ["Английский"],
    );
    expect(r.matched.length).toBe(1);
    expect(r.missing.length).toBe(0);
  });

  it("language missing when resume has no matching language", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Английский B2", isRequired: true, category: "language" }],
      [], [], [],
      [],
    );
    expect(r.missing.length).toBe(1);
  });

  it("language not auto-matched without actual correspondence", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Владение китайским языком", isRequired: true, category: "language" }],
      [], [], [],
      ["Английский"],
    );
    expect(r.matched.length).toBe(0);
  });

  it("soft_skill matched via description overlap", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Менторство и наставничество джунов", isRequired: true, category: "soft_skill" }],
      [], [], ["Менторство джунов и код-ревью"],
    );
    expect(r.matched.length).toBe(1);
  });

  it("soft_skill missing without overlap", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Менторство и наставничество джунов", isRequired: true, category: "soft_skill" }],
      [], [], ["Продажи и переговоры"],
    );
    expect(r.missing.length).toBe(1);
  });

  it("other matched via word overlap", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Работа в команде продукта", isRequired: true, category: "other" }],
      [], [], ["Работа в команде разработки"],
    );
    expect(r.matched.length).toBe(1);
  });

  it("other with empty haystack stays missing", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Работа в команде продукта", isRequired: true, category: "other" }],
      [], [], [],
    );
    expect(r.missing.length).toBe(1);
  });

  it("undefined category matched via word overlap", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Разработка API интерфейсов", isRequired: true }],
      [], [], ["Разработка внутренних интерфейсов"],
    );
    expect(r.matched.length).toBe(1);
  });

  it("undefined category missing without overlap", () => {
    const r = matchRequirements(
      [{ id: "r1", text: "Разработка API интерфейсов", isRequired: true }],
      [], [], ["Продажи и переговоры"],
    );
    expect(r.missing.length).toBe(1);
  });
});

// ---------- Experience matching ----------

describe("matchExperience", () => {
  it("matching position increases score", () => {
    const r = matchExperience("Frontend Developer", "SPA", ["Frontend Developer"], ["React"], 3);
    expect(r.score).toBeGreaterThan(0.5);
  });
  it("non-matching lowers score", () => {
    const r = matchExperience("Backend Developer", "Microservices", ["Designer"], ["UX"], 3);
    expect(r.score).toBeLessThan(0.5);
  });
  it("risk when insufficient years", () => {
    const r = matchExperience("Senior Dev", "5+ лет опыта", ["Developer"], ["Разработка"], 2);
    expect(r.risk).toBeDefined();
    expect(r.risk).toContain("5");
  });
  it("risk when zero experience but years required", () => {
    const r = matchExperience("Dev", "3+ лет опыта", [], [], 0);
    expect(r.risk).toBeDefined();
    expect(r.risk).toContain("3");
  });
});

// ---------- Work format matching ----------

describe("matchFormat", () => {
  it("matching format", () => { expect(matchFormat("remote", "remote").score).toBe(1); });
  it("incompatible", () => { expect(matchFormat("office", "remote").score).toBeLessThan(0.5); });
  it("any matches all", () => { expect(matchFormat("any", "remote").score).toBe(1); });
  it("missing data is neutral", () => { expect(matchFormat(undefined, "remote").score).toBe(0.5); });
  it("hybrid partial compat", () => { expect(matchFormat("hybrid", "remote").score).toBe(0.6); });
});

// ---------- Employment type matching ----------

describe("matchEmploymentType", () => {
  it("matching type", () => { expect(matchEmploymentType("full_time", "full_time").score).toBe(1); });
  it("incompatible", () => { expect(matchEmploymentType("freelance", "full_time").score).toBe(0.2); });
  it("missing is neutral", () => { expect(matchEmploymentType(undefined, "full_time").score).toBe(0.5); });
  it("freelance ↔ part_time partial compat", () => { expect(matchEmploymentType("freelance", "part_time").score).toBe(0.6); });
  it("contract ↔ part_time partial compat", () => { expect(matchEmploymentType("contract", "part_time").score).toBe(0.6); });
});

// ---------- Experience duration ----------

describe("calculateYearsExperience", () => {
  it("calculates total years", () => {
    const y = calculateYearsExperience([
      { startDate: "2020-01", endDate: "2022-01", isCurrent: false },
      { startDate: "2022-01", endDate: null, isCurrent: true },
    ]);
    expect(y).toBeGreaterThanOrEqual(4);
  });
  it("returns 0 for empty", () => { expect(calculateYearsExperience([])).toBe(0); });
});

// ---------- Score 0-100 and level mapping ----------

describe("calculateMatch score", () => {
  it("score stays between 0 and 100", () => {
    const r = calculateMatch(makeVacancy(), makeVersion(), "res1");
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });

  it("identical inputs produce identical output", () => {
    const r1 = calculateMatch(makeVacancy(), makeVersion(), "res1");
    const r2 = calculateMatch(makeVacancy(), makeVersion(), "res1");
    expect(r1.overallScore).toBe(r2.overallScore);
    expect(r1.level).toBe(r2.level);
  });

  it("good skills match produces good score", () => {
    const r = calculateMatch(makeVacancy(), makeVersion(), "res1");
    expect(r.overallScore).toBeGreaterThanOrEqual(60);
    expect(["good", "strong"]).toContain(r.level);
    expect(r.matchedSkills.length).toBe(2);
  });

  it("no matching skills → low score", () => {
    const bad = makeVersion({ skills: [{ name: "COBOL" }, { name: "Fortran" }] });
    const r = calculateMatch(makeVacancy(), bad, "res1");
    expect(r.overallScore).toBeLessThan(50);
    expect(r.missingSkills.length).toBeGreaterThan(0);
  });

  it("no hallucinated skills", () => {
    const r = calculateMatch(makeVacancy(), makeVersion(), "res1");
    expect(r.missingSkills).toEqual([]);
    for (const s of r.matchedSkills) {
      expect(["react", "typescript"]).toContain(s);
    }
  });

  it("format score affects total", () => {
    const v1 = makeVersion({ workFormat: "remote" });
    const v2 = makeVersion({ workFormat: "" });
    const vac = makeVacancy({ workFormat: "remote" });
    const r1 = calculateMatch(vac, v1, "res1");
    const r2 = calculateMatch(vac, v2, "res1");
    expect(r1.overallScore).toBeGreaterThan(r2.overallScore);
  });

  it("employment type score affects total", () => {
    const v1 = makeVersion({ employmentType: "full_time" });
    const v2 = makeVersion({ employmentType: "" });
    const vac = makeVacancy({ employmentType: "full_time" });
    const r1 = calculateMatch(vac, v1, "res1");
    const r2 = calculateMatch(vac, v2, "res1");
    expect(r1.overallScore).toBeGreaterThan(r2.overallScore);
  });

  it("combined format+employment ≤ 10% of total", () => {
    // Both match perfectly
    const vGood = makeVersion({ workFormat: "remote", employmentType: "full_time" });
    const vac = makeVacancy({ workFormat: "remote", employmentType: "full_time" });
    const rGood = calculateMatch(vac, vGood, "res1");

    // Both incompatible
    const vBad = makeVersion({ workFormat: "remote", employmentType: "full_time" });
    const vacBad = makeVacancy({ workFormat: "office", employmentType: "freelance" });
    const rBad = calculateMatch(vacBad, vBad, "res1");

    const diff = rGood.overallScore - rBad.overallScore;
    // Max difference from format+employment is 10 points
    expect(diff).toBeLessThanOrEqual(10);
  });

  it("empty vacancy skills → neutral (0.5), not 1.0", () => {
    const vac = makeVacancy({ skills: [] });
    const r = calculateMatch(vac, makeVersion(), "res1");
    // skillsScore = 0.5, reqsScore based on 2 reqs, exp normal
    // Overall should not be inflated by empty skills
    expect(r.overallScore).toBeLessThan(95);
  });

  it("empty vacancy requirements → neutral (0.5), not 1.0", () => {
    const vac = makeVacancy({ requirements: [] });
    const r = calculateMatch(vac, makeVersion(), "res1");
    expect(r.overallScore).toBeLessThan(95);
  });

  it("language requirement raises score when resume lists the language", () => {
    const vac = makeVacancy({
      skills: [],
      requirements: [
        { id: "lang", text: "Английский B2", isRequired: true, category: "language" },
      ],
    });
    const withLang = makeVersion({ languages: ["Английский"] });
    const withoutLang = makeVersion({ languages: [] });

    const rWith = calculateMatch(vac, withLang, "res1");
    const rWithout = calculateMatch(vac, withoutLang, "res1");

    expect(rWith.matchedRequirements.length).toBe(1);
    expect(rWithout.missingRequirements.length).toBe(1);
    expect(rWith.overallScore).toBeGreaterThan(rWithout.overallScore);
  });

  it("no experience → risk when vacancy requires years", () => {
    const v = makeVersion({ workExperience: [] });
    const vac = makeVacancy({ description: "Требуется 3+ лет опыта" });
    const r = calculateMatch(vac, v, "res1");
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.risks[0]).toContain("3");
  });

  it("version with workFormat persists correctly", () => {
    const v = makeVersion({ workFormat: "remote", employmentType: "full_time" });
    expect(v.data.workFormat).toBe("remote");
    expect(v.data.employmentType).toBe("full_time");
  });

  it("missing format → no false mismatch penalty", () => {
    const v = makeVersion({ workFormat: "" });
    const vac = makeVacancy({ workFormat: "remote" });
    const r = calculateMatch(vac, v, "res1");
    // formatScore = 0.5 (neutral), not a penalty
    // Score should not drop below what it would be with matching format minus 10
    const vMatch = makeVersion({ workFormat: "remote" });
    const rMatch = calculateMatch(vac, vMatch, "res1");
    // Missing format (0.5) vs matching (1.0) → difference ≤ 10 points (weight is ≤10%)
    expect(rMatch.overallScore - r.overallScore).toBeLessThanOrEqual(10);
    expect(rMatch.overallScore - r.overallScore).toBeGreaterThanOrEqual(0);
  });
});

// ---------- Education requirements haystack (P6 fix) ----------

describe("matchRequirements education category", () => {
  const eduReq = [{ id: "e1", text: "Высшее образование", isRequired: true, category: "education" as const }];

  function makeEdu(overrides: Partial<{ institution: string; degree: string; field: string }> = {}) {
    return {
      id: "edu-1",
      institution: "МГСУ",
      degree: "Высшее",
      field: "Строительство",
      startDate: "2016-09",
      endDate: "2020-06",
      description: "",
      ...overrides,
    };
  }

  it("matches education requirement against resume Education[]", () => {
    const r = matchRequirements(
      eduReq,
      [], [], [],
      [],
      [makeEdu()],
    );
    expect(r.matched.length).toBe(1);
    expect(r.missing.length).toBe(0);
  });

  it("matches when only the field of study is relevant", () => {
    const r = matchRequirements(
      [{ id: "e1", text: "Профильное строительство", isRequired: true, category: "education" as const }],
      [], [], [],
      [],
      [makeEdu({ degree: "" })],
    );
    expect(r.matched.length).toBe(1);
  });

  it("does not produce a false match without education data", () => {
    const r = matchRequirements(eduReq, [], [], [], [], []);
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBe(1);
  });

  it("keeps education text out of non-education categories", () => {
    const r = matchRequirements(
      [{ id: "s1", text: "Строительство объектов", isRequired: true }],
      [], [], [],
      [],
      [makeEdu()],
    );
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBe(1);
  });
});

describe("calculateMatch education requirement integration", () => {
  const vacWithEduReq = (): Vacancy => ({
    id: "v1",
    title: "Инженер",
    company: "Test",
    description: "Разработка",
    requirements: [
      { id: "edu", text: "Высшее образование", isRequired: true, category: "education" },
    ],
    skills: [],
    responsibilities: [],
    location: "Москва",
    source: "text",
    fetchedAt: "2026-01-01T00:00:00Z",
  });

  it("scores higher when resume has matching education", () => {
    const base = makeVersion({ workExperience: [] });
    const withEdu = makeVersion({
      workExperience: [],
      education: [
        { id: "edu-1", institution: "МГСУ", degree: "Высшее", field: "Строительство", startDate: "2016-09", endDate: "2020-06", description: "" },
      ],
    });
    const vac = vacWithEduReq();

    const rWith = calculateMatch(vac, withEdu, "res1");
    const rWithout = calculateMatch(vac, base, "res1");

    expect(rWith.matchedRequirements.length).toBe(1);
    expect(rWithout.missingRequirements.length).toBe(1);
    expect(rWith.overallScore).toBeGreaterThan(rWithout.overallScore);
  });
});

// ---------- P7.1 regression: years experience (MM/YYYY) ----------

describe("calculateYearsExperience MM/YYYY (P7.1)", () => {
  it("canonical MM/YYYY: 01/2020 -> 01/2024 = 4y", () => {
    expect(calculateYearsExperience([{ startDate: "01/2020", endDate: "01/2024", isCurrent: false }])).toBe(4);
  });

  it("canonical MM/YYYY: 01/2020 -> 01/2025 = 5y", () => {
    expect(calculateYearsExperience([{ startDate: "01/2020", endDate: "01/2025", isCurrent: false }])).toBe(5);
  });

  it("short period 09/2024 -> 02/2025 ~ 0.4y (diff-months model preserved)", () => {
    expect(calculateYearsExperience([{ startDate: "09/2024", endDate: "02/2025", isCurrent: false }])).toBe(0.4);
  });

  it("legacy YYYY-MM keeps working: 2020-01 -> 2024-01 = 4y", () => {
    expect(calculateYearsExperience([{ startDate: "2020-01", endDate: "2024-01", isCurrent: false }])).toBe(4);
  });

  it("current job counts up to the current month/year", () => {
    const now = new Date();
    const startYear = now.getFullYear() - 6;
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const years = calculateYearsExperience([
      { startDate: `${mm}/${startYear}`, endDate: null, isCurrent: true },
    ]);
    expect(years).toBeGreaterThan(5.5);
    expect(years).toBeLessThan(7);
  });

  it("overlapping periods are not double-counted (union)", () => {
    // 01/2020-01/2022 (24м) ∪ 06/2021-06/2023 (30м), перекрытие 7м:
    // непрерывное покрытие 01/2020-06/2023 = 41 месяц ≈ 3.4
    expect(calculateYearsExperience([
      { startDate: "01/2020", endDate: "01/2022", isCurrent: false },
      { startDate: "06/2021", endDate: "06/2023", isCurrent: false },
    ])).toBe(3.4);
  });

  it("malformed start date skips the entry", () => {
    expect(calculateYearsExperience([{ startDate: "abc", endDate: "01/2024", isCurrent: false }])).toBe(0);
  });

  it("unparseable end date with explicit endDate skips the entry", () => {
    expect(calculateYearsExperience([{ startDate: "01/2020", endDate: "soon", isCurrent: false }])).toBe(0);
  });
});

// ---------- P7.1 regression: required years extraction ----------

describe("extractRequiredYears (P7.1)", () => {
  it.each([
    ["3 года", 3],
    ["3+ года", 3],
    ["от 3 лет", 3],
    ["не менее 3 лет", 3],
    ["5 years", 5],
    ["5+ years", 5],
    ["Требуется 3–5 лет опыта", 3],
    ["Опыт 3-5 лет", 3],
    ["Стаж 3 — 5 лет", 3],
  ])("'%s' => %i", (desc, expected) => {
    expect(extractRequiredYears(desc)).toBe(expected);
  });

  it.each(["трёх лет", "3-х лет", "без цифр вообще"])("keeps neutral for '%s'", (desc) => {
    expect(extractRequiredYears(desc)).toBeNull();
  });
});

// ---------- P7.1 regression: skill requirement boundaries ----------

describe("matchRequirements skill token boundaries (P7.1)", () => {
  const req = (text: string) => [{ id: "r1", text, isRequired: true, category: "skill" as const }];

  it("'Reactive UI' does NOT match skill 'react' (no substring FP)", () => {
    const r = matchRequirements(req("Reactive UI"), ["react"], [], []);
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBe(1);
  });

  it("'React' matches 'react'", () => {
    expect(matchRequirements(req("React"), ["react"], [], []).matched.length).toBe(1);
  });

  it("alias 'React.js разработка' still matches 'react' (dot is a boundary)", () => {
    expect(matchRequirements(req("React.js разработка"), ["react"], [], []).matched.length).toBe(1);
  });

  it("alias 'Vue.js' still matches 'vue'", () => {
    expect(matchRequirements(req("Vue.js"), ["vue"], [], []).matched.length).toBe(1);
  });

  it("existing behavior preserved: 'CI/CD' text vs normalized 'cicd' stays unmatched", () => {
    const r = matchRequirements(req("Опыт CI/CD"), ["cicd"], [], []);
    expect(r.matched.length).toBe(0);
  });

  it("Russian exact match still works", () => {
    expect(matchRequirements(req("Знание Реакт"), ["Реакт"], [], []).matched.length).toBe(1);
  });
});

// ---------- P7.3 Regression Lock: MM/YYYY through calculateMatch ----------

describe("calculateMatch MM/YYYY experience integration (P7.3 lock)", () => {
  const vacancyWithYears = (desc: string): Vacancy =>
    makeVacancy({ description: desc });

  const exp = (start: string, end: string | null) => [
    { id: "w1", company: "A", position: "Frontend Developer", startDate: start, endDate: end, isCurrent: end === null, description: "Разработка React приложений", achievements: [] },
  ];

  it("MM/YYYY WorkExperience flows into experienceScore: 4y vs '3 года' -> no risk, score 90", () => {
    const r = calculateMatch(vacancyWithYears("Требуется опыт 3 года"), makeVersion({ workExperience: exp("01/2020", "01/2024") }), "res1");
    expect(r.overallScore).toBe(90);
    expect(r.level).toBe("strong");
    expect(r.risks).toEqual([]);
  });

  it("same vacancy with NO experience drops to 84 + insufficient-experience risk", () => {
    const r = calculateMatch(vacancyWithYears("Требуется опыт 3 года"), makeVersion({ workExperience: exp("", null) }), "res1");
    expect(r.overallScore).toBe(84);
    expect(r.risks.length).toBe(1);
    expect(r.risks[0]).toContain("опыт не указан");
  });

  it("4y vs range '3–5 лет': requiredYears=3, no false insufficient-risk, score 90", () => {
    expect(extractRequiredYears("Требуемый опыт работы: 3–5 лет")).toBe(3);
    const r = calculateMatch(vacancyWithYears("Требуемый опыт работы: 3–5 лет"), makeVersion({ workExperience: exp("01/2020", "01/2024") }), "res1");
    expect(r.overallScore).toBe(90);
    expect(r.risks).toEqual([]);
  });

  it("insufficient: 3y vs '5 лет' -> risk present and lower score than sufficient candidate", () => {
    const sufficient = calculateMatch(vacancyWithYears("Требуется опыт 5 лет"), makeVersion({ workExperience: exp("01/2020", "01/2025") }), "res1");
    const insufficient = calculateMatch(vacancyWithYears("Требуется опыт 5 лет"), makeVersion({ workExperience: exp("01/2020", "01/2023") }), "res1");

    expect(insufficient.overallScore).toBeLessThan(sufficient.overallScore);
    expect(insufficient.risks.length).toBe(1);
    expect(insufficient.risks[0]).toContain("подтверждено 3 года");
    expect(sufficient.risks).toEqual([]);
  });
});

// ---------- P9.1: education level in education haystack ----------

describe("matchRequirements education level (P9.1)", () => {
  const edu = (level: "higher" | "secondary_special" | "secondary" | undefined, over: Partial<{ institution: string; degree: string; field: string }> = {}) => ({
    id: "e1",
    level,
    institution: "",
    degree: "",
    field: "",
    startDate: "09/2016",
    endDate: "06/2020",
    description: "",
    ...over,
  });
  const req = (text: string) => [{ id: "r1", text, isRequired: true, category: "education" as const }];

  it("'Высшее образование' matches via level=higher alone", () => {
    const r = matchRequirements(req("Высшее образование"), [], [], [], [], [edu("higher")]);
    expect(r.matched.length).toBe(1);
  });

  it("'Среднее специальное' requirement matches secondary_special level", () => {
    const r = matchRequirements(req("Среднее специальное образование"), [], [], [], [], [edu("secondary_special")]);
    // «среднее»+«специальное» из лейбла, «образование» отсутствует → 2/3 >= ceil(1.5)
    expect(r.matched.length).toBe(1);
  });

  it("'Высшее образование' does NOT match level=secondary (no false positive)", () => {
    const r = matchRequirements(req("Высшее образование"), [], [], [], [], [edu("secondary")]);
    expect(r.matched.length).toBe(0);
    expect(r.missing.length).toBe(1);
  });

  it("legacy education without level keeps institution/degree/field matching", () => {
    // NOTE: слова короче 4 символов отсекаются порогом (>3) — «МГУ» не участвует.
    const r = matchRequirements(
      [{ id: "r1", text: "Университет технический профиль", isRequired: true, category: "education" }],
      [], [], [],
      [],
      [edu(undefined, { institution: "Технический университет", field: "Профильный" })],
    );
    expect(r.matched.length).toBe(1);
  });

  it("scope guard: level text invisible to non-education categories", () => {
    const withLevelOnly = [edu("secondary_special")];
    const skillReq = [{ id: "s1", text: "Среднее специальное оборудование", isRequired: true }];
    const langReq = [{ id: "l1", text: "Среднее специальное знание языка", isRequired: true, category: "language" as const }];
    expect(matchRequirements(skillReq, [], [], [], [], withLevelOnly).matched.length).toBe(0);
    expect(matchRequirements(langReq, [], [], [], [], withLevelOnly).matched.length).toBe(0);
  });
});
