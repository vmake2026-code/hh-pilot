import { describe, it, expect } from "vitest";
import {
  normalizeText,
  parseVacancyImport,
  draftToVacancy,
  isValidImportUrl,
  classifyRequirementCategory,
  parseSalaryValue,
  extractTitle,
  extractCompany,
  extractLocation,
  extractSalary,
  extractSkills,
  extractWorkFormat,
  extractEmploymentType,
  extractListFromSection,
  detectSections,
  normalizeSkill,
} from "../../services/vacancy-import";

// ---------- normalizeText ----------

describe("normalizeText", () => {
  it("strips HTML tags", () => {
    expect(normalizeText("<p>Работа с клиентами</p>")).toBe("Работа с клиентами");
  });

  it("converts <br> to newline", () => {
    expect(normalizeText("Строка 1<br>Строка 2")).toBe("Строка 1\nСтрока 2");
  });

  it("converts <li> items to newlines", () => {
    const input = "<ul><li>React</li><li>TypeScript</li></ul>";
    expect(normalizeText(input)).toBe("React\nTypeScript");
  });

  it("decodes HTML entities", () => {
    expect(normalizeText("A &amp; B &lt; C &gt; D")).toBe("A & B < C > D");
  });

  it("decodes &nbsp;", () => {
    expect(normalizeText("Hello&nbsp;World")).toBe("Hello World");
  });

  it("normalizes \\r\\n to \\n", () => {
    expect(normalizeText("line1\r\nline2")).toBe("line1\nline2");
  });

  it("normalizes \\r to \\n", () => {
    expect(normalizeText("line1\rline2")).toBe("line1\nline2");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("hello    world")).toBe("hello world");
  });

  it("normalizes tabs to spaces", () => {
    expect(normalizeText("hello\tworld")).toBe("hello world");
  });

  it("collapses multiple newlines", () => {
    expect(normalizeText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims result", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("returns empty for non-string input", () => {
    expect(normalizeText(null as unknown as string)).toBe("");
    expect(normalizeText(undefined as unknown as string)).toBe("");
    expect(normalizeText(123 as unknown as string)).toBe("");
  });

  it("handles h2 headings", () => {
    const input = "<h2>Требования</h2><p>React</p>";
    expect(normalizeText(input)).toBe("Требования\nReact");
  });

  it("handles complex HTML", () => {
    const input = `
      <h2>Обязанности</h2>
      <p>Разработка UI</p>
      <ul>
        <li>React компоненты</li>
        <li>Тестирование</li>
      </ul>
    `;
    const result = normalizeText(input);
    expect(result).toContain("Обязанности");
    expect(result).toContain("Разработка UI");
    expect(result).toContain("React компоненты");
    expect(result).toContain("Тестирование");
    expect(result).not.toContain("<");
  });

  it("handles numeric HTML entities", () => {
    expect(normalizeText("&#60;script&#62;")).toBe("<script>");
  });

  it("handles self-closing <br/>", () => {
    expect(normalizeText("A<br/>B")).toBe("A\nB");
  });

  it("handles <br /> with space", () => {
    expect(normalizeText("A<br />B")).toBe("A\nB");
  });

  it("handles numeric entity &#123;", () => {
    expect(normalizeText("Symbol: &#123;here&#125;")).toBe("Symbol: {here}");
  });

  it("handles unclosed tags gracefully", () => {
    // Malformed <b without > is not a valid tag, so it's preserved as text
    expect(normalizeText("Hello <b world")).toBe("Hello <b world");
  });

  it("handles nested HTML tags", () => {
    const input = "<div><p>Hello <strong>world</strong></p></div>";
    expect(normalizeText(input)).toBe("Hello world");
  });

  it("handles empty HTML tags", () => {
    expect(normalizeText("A<br><br>B")).toBe("A\n\nB");
  });

  it("handles mixed HTML and text", () => {
    const input = "Разработка <b>React</b> компонентов";
    expect(normalizeText(input)).toBe("Разработка React компонентов");
  });

  it("preserves line breaks in pre-formatted content", () => {
    const input = "Требования:\n- React\n- TypeScript";
    expect(normalizeText(input)).toBe("Требования:\n- React\n- TypeScript");
  });
});

// ---------- Title extraction ----------

describe("extractTitle", () => {
  it("extracts title from first line", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("Frontend Developer\nКомпания: Тест", sections)).toBe("Frontend Developer");
  });

  it("skips company line", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("Компания: Тест\nFrontend Developer", sections)).toBe("Frontend Developer");
  });

  it("skips salary line", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("Зарплата: 200000\nBackend Developer", sections)).toBe("Backend Developer");
  });

  it("skips location line", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("Москва\nSenior Developer", sections)).toBe("Senior Developer");
  });

  it("returns empty for completely empty input", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("", sections)).toBe("");
  });

  it("returns first line when all lines are titles", () => {
    const sections: { start: number; key: string }[] = [];
    expect(extractTitle("Backend Developer", sections)).toBe("Backend Developer");
  });
});

// ---------- Company extraction ----------

describe("extractCompany", () => {
  it("extracts from 'Компания:' pattern", () => {
    expect(extractCompany("Компания: ООО Ромашка")).toBe("ООО Ромашка");
  });

  it("extracts from 'Company:' pattern", () => {
    expect(extractCompany("Company: TestCorp")).toBe("TestCorp");
  });

  it("extracts from 'Организация:' pattern", () => {
    expect(extractCompany("Организация: Газпром")).toBe("Газпром");
  });

  it("extracts from 'Employer:' pattern", () => {
    expect(extractCompany("Employer: Google")).toBe("Google");
  });

  it("returns empty for no match", () => {
    expect(extractCompany("Просто текст без компании")).toBe("");
  });

  it("returns empty for empty input", () => {
    expect(extractCompany("")).toBe("");
  });
});

// ---------- Location extraction ----------

describe("extractLocation", () => {
  it("extracts from 'Город:' pattern", () => {
    expect(extractLocation("Город: Москва")).toBe("Москва");
  });

  it("extracts known city name", () => {
    expect(extractLocation("Работа в Санкт-Петербурге")).toBe("Санкт-Петербург");
  });

  it("extracts format as location fallback", () => {
    expect(extractLocation("Удалённая работа")).toBe("Удалённ");
  });

  it("returns empty for no match", () => {
    expect(extractLocation("Обычный текст")).toBe("");
  });

  it("extracts Moscow from text with preposition", () => {
    expect(extractLocation("Город: Москва")).toBe("Москва");
  });

  it("extracts Novosibirsk", () => {
    expect(extractLocation("Работа в Новосибирске")).toBe("Новосибирск");
  });

  it("detects hybrid format", () => {
    expect(extractLocation("Гибридный формат работы")).toBe("Гибрид");
  });

  it("detects remote in English", () => {
    expect(extractLocation("Remote work")).toBe("Remote");
  });
});

// ---------- Salary extraction ----------

describe("extractSalary", () => {
  it("extracts range with dash", () => {
    const r = extractSalary("Зарплата: 150 000 – 250 000");
    expect(r.salaryFrom).toBe("150000");
    expect(r.salaryTo).toBe("250000");
  });

  it("extracts range with 'от' and 'до'", () => {
    const r = extractSalary("от 180000 до 300000 ₽");
    expect(r.salaryFrom).toBe("180000");
    expect(r.salaryTo).toBe("300000");
  });

  it("detects dollar currency", () => {
    const r = extractSalary("Salary: 5000 – 8000 $");
    expect(r.currency).toBe("$");
  });

  it("detects euro currency", () => {
    const r = extractSalary("Зарплата: 3000 €");
    expect(r.currency).toBe("€");
  });

  it("extracts single 'от' value", () => {
    const r = extractSalary("от 200 000");
    expect(r.salaryFrom).toBe("200000");
    expect(r.salaryTo).toBe("");
  });

  it("extracts single 'до' value", () => {
    const r = extractSalary("до 300000");
    expect(r.salaryTo).toBe("300000");
    expect(r.salaryFrom).toBe("");
  });

  it("returns empty for no salary", () => {
    const r = extractSalary("Нет зарплаты");
    expect(r.salaryFrom).toBe("");
    expect(r.salaryTo).toBe("");
  });

  it("returns empty for 'по договорённости'", () => {
    const r = extractSalary("Зарплата: по договорённости");
    expect(r.salaryFrom).toBe("");
    expect(r.salaryTo).toBe("");
  });

  it("returns empty for 'не указана'", () => {
    const r = extractSalary("Зарплата не указана");
    expect(r.salaryFrom).toBe("");
    expect(r.salaryTo).toBe("");
  });

  it("swaps from/to when from > to", () => {
    const r = extractSalary("Зарплата: 300000 – 200000");
    expect(r.salaryFrom).toBe("200000");
    expect(r.salaryTo).toBe("300000");
  });

  it("skips zero single values", () => {
    const r = extractSalary("от 0");
    expect(r.salaryFrom).toBe("");
  });

  it("handles em dash separator", () => {
    const r = extractSalary("100 000 — 150 000 ₽");
    expect(r.salaryFrom).toBe("100000");
    expect(r.salaryTo).toBe("150000");
  });

  it("handles regular dash separator", () => {
    const r = extractSalary("100000-150000");
    expect(r.salaryFrom).toBe("100000");
    expect(r.salaryTo).toBe("150000");
  });

  it("returns empty for empty input", () => {
    const r = extractSalary("");
    expect(r.salaryFrom).toBe("");
    expect(r.salaryTo).toBe("");
    expect(r.currency).toBe("₽");
  });
});

// ---------- Skills extraction ----------

describe("extractSkills", () => {
  it("finds known skills", () => {
    const skills = extractSkills("Требуется React и TypeScript");
    expect(skills).toContain("react");
    expect(skills).toContain("typescript");
  });

  it("finds multiple skills", () => {
    const skills = extractSkills("React, Docker, PostgreSQL, Node.js");
    expect(skills).toContain("react");
    expect(skills).toContain("docker");
    expect(skills).toContain("postgresql");
    expect(skills).toContain("node");
  });

  it("deduplicates skills", () => {
    const skills = extractSkills("React и React.js и react");
    const reactCount = skills.filter((s) => s === "react").length;
    expect(reactCount).toBe(1);
  });

  it("returns empty for no skills", () => {
    expect(extractSkills("Обычный текст без технологий")).toEqual([]);
  });

  it("handles case differences", () => {
    const skills = extractSkills("REACT typescript Angular");
    expect(skills).toContain("react");
    expect(skills).toContain("typescript");
    expect(skills).toContain("angular");
  });

  it("finds Excel skill", () => {
    const skills = extractSkills("Знание Microsoft Excel и PowerPoint");
    expect(skills).toContain("excel");
  });

  it("finds MS Excel as alias", () => {
    const skills = extractSkills("MS Excel");
    expect(skills).toContain("excel");
  });

  it("finds Vue.js skill", () => {
    const skills = extractSkills("Опыт с Vue.js и Vuex");
    expect(skills).toContain("vue");
  });

  it("finds GraphQL", () => {
    const skills = extractSkills("GraphQL API");
    expect(skills).toContain("graphql");
  });

  it("returns empty for empty input", () => {
    expect(extractSkills("")).toEqual([]);
  });

  it("returns empty for non-string input", () => {
    expect(extractSkills(null as unknown as string)).toEqual([]);
    expect(extractSkills(undefined as unknown as string)).toEqual([]);
  });

  it("finds CI/CD", () => {
    const skills = extractSkills("Опыт с CI/CD пайплайнами");
    expect(skills).toContain("cicd");
  });

  it("finds Kubernetes via k8s", () => {
    const skills = extractSkills("Деплой в k8s");
    expect(skills).toContain("kubernetes");
  });
});

// ---------- Work format / Employment type ----------

describe("extractWorkFormat", () => {
  it("detects remote", () => {
    expect(extractWorkFormat("Удалённая работа")).toBe("remote");
    expect(extractWorkFormat("remote work")).toBe("remote");
  });

  it("detects office", () => {
    expect(extractWorkFormat("Работа в офисе")).toBe("office");
    expect(extractWorkFormat("office work")).toBe("office");
  });

  it("detects hybrid", () => {
    expect(extractWorkFormat("Гибридный формат")).toBe("hybrid");
    expect(extractWorkFormat("hybrid work")).toBe("hybrid");
  });

  it("returns empty for unknown", () => {
    expect(extractWorkFormat("Обычный текст")).toBe("");
  });
});

describe("extractEmploymentType", () => {
  it("detects full_time", () => {
    expect(extractEmploymentType("Полная занятость")).toBe("full_time");
    expect(extractEmploymentType("full-time")).toBe("full_time");
  });

  it("detects part_time", () => {
    expect(extractEmploymentType("Частичная занятость")).toBe("part_time");
  });

  it("detects freelance", () => {
    expect(extractEmploymentType("Фриланс")).toBe("freelance");
  });

  it("detects contract", () => {
    expect(extractEmploymentType("Контракт на 6 месяцев")).toBe("contract");
  });

  it("returns empty for unknown", () => {
    expect(extractEmploymentType("Обычный текст")).toBe("");
  });
});

// ---------- Section detection ----------

describe("detectSections", () => {
  it("finds requirements section", () => {
    const sections = detectSections("Title\n\nТребования:\nReact\nTypeScript");
    expect(sections.length).toBe(1);
    expect(sections[0].key).toBe("requirements");
  });

  it("finds responsibilities section", () => {
    const sections = detectSections("Title\n\nОбязанности:\nРазработка");
    expect(sections.length).toBe(1);
    expect(sections[0].key).toBe("responsibilities");
  });

  it("finds multiple sections", () => {
    const sections = detectSections("Title\n\nТребования:\nReact\n\nОбязанности:\nКод");
    expect(sections.length).toBe(2);
  });

  it("finds 'нужно знать' as requirements", () => {
    const sections = detectSections("Title\n\nНужно знать:\nReact");
    expect(sections.length).toBe(1);
    expect(sections[0].key).toBe("requirements");
  });

  it("finds 'задачи' as responsibilities", () => {
    const sections = detectSections("Title\n\nЗадачи:\nКодить");
    expect(sections.length).toBe(1);
    expect(sections[0].key).toBe("responsibilities");
  });
});

describe("extractListFromSection", () => {
  it("extracts bullet items", () => {
    const items = extractListFromSection("Требования:\n- React\n- TypeScript\n- Docker");
    expect(items).toEqual(["React", "TypeScript", "Docker"]);
  });

  it("extracts numbered items", () => {
    const items = extractListFromSection("Требования:\n1. React\n2. TypeScript");
    expect(items).toEqual(["React", "TypeScript"]);
  });

  it("skips header line", () => {
    const items = extractListFromSection("Требования:\nReact\nTypeScript");
    expect(items).toEqual(["React", "TypeScript"]);
  });

  it("skips empty lines", () => {
    const items = extractListFromSection("Требования:\n- React\n\n- TypeScript");
    expect(items).toEqual(["React", "TypeScript"]);
  });

  it("skips very short lines", () => {
    const items = extractListFromSection("Требования:\n-\nReact\n.");
    expect(items).toEqual(["React"]);
  });
});

// ---------- Full parser ----------

describe("parseVacancyImport", () => {
  const sampleText = `Frontend Developer

Компания: ООО Ромашка
Москва / удалённо
Зарплата: 180000–250000 ₽

Требования:
React
TypeScript
3+ года опыта

Обязанности:
Разработка интерфейсов
Code review`;

  it("parses text to draft", () => {
    const draft = parseVacancyImport({ source: "text", text: sampleText });

    expect(draft.source).toBe("text");
    expect(draft.extractedFields.title.value).toBe("Frontend Developer");
    expect(draft.extractedFields.company.value).toBe("ООО Ромашка");
    expect(draft.extractedFields.salaryFrom.value).toBe("180000");
    expect(draft.extractedFields.salaryTo.value).toBe("250000");
    expect(draft.extractedFields.skills).toContain("react");
    expect(draft.extractedFields.skills).toContain("typescript");
    expect(draft.extractedFields.requirements).toContain("React");
    expect(draft.extractedFields.requirements).toContain("TypeScript");
    expect(draft.extractedFields.responsibilities).toContain("Разработка интерфейсов");
  });

  it("returns warnings for empty input", () => {
    const draft = parseVacancyImport({ source: "text", text: "" });
    expect(draft.warnings.length).toBeGreaterThan(0);
    expect(draft.extractedFields.title.level).toBe("missing");
  });

  it("sets inferred level for detected fields", () => {
    const draft = parseVacancyImport({ source: "text", text: sampleText });
    expect(draft.extractedFields.title.level).toBe("inferred");
    expect(draft.extractedFields.company.level).toBe("inferred");
  });

  it("returns URL warning when no text", () => {
    const draft = parseVacancyImport({ source: "url", sourceUrl: "https://hh.ru/vacancy/123" });
    expect(draft.warnings.some((w) => w.includes("Автоматическая загрузка"))).toBe(true);
  });

  it("handles null text gracefully", () => {
    const draft = parseVacancyImport({ source: "text", text: null as unknown as string });
    expect(draft.warnings.length).toBeGreaterThan(0);
    expect(draft.extractedFields.title.level).toBe("missing");
  });

  it("handles undefined text gracefully", () => {
    const draft = parseVacancyImport({ source: "text", text: undefined as unknown as string });
    expect(draft.warnings.length).toBeGreaterThan(0);
  });

  it("handles HTML in text", () => {
    const htmlText = `<h2>Frontend Developer</h2>
<p>Компания: Тест</p>
<ul><li>React</li><li>TypeScript</li></ul>`;
    const draft = parseVacancyImport({ source: "text", text: htmlText });
    expect(draft.extractedFields.skills).toContain("react");
    expect(draft.extractedFields.skills).toContain("typescript");
  });

  it("handles \\r\\n line endings", () => {
    const text = "Frontend Developer\r\n\r\nКомпания: Тест";
    const draft = parseVacancyImport({ source: "text", text });
    expect(draft.extractedFields.title.value).toBe("Frontend Developer");
    expect(draft.extractedFields.company.value).toBe("Тест");
  });

  it("handles dirty salary strings", () => {
    const text = "Developer\nКомпания: Тест\nЗарплата: от 100 000 до 150 000 ₽";
    const draft = parseVacancyImport({ source: "text", text });
    expect(draft.extractedFields.salaryFrom.value).toBe("100000");
    expect(draft.extractedFields.salaryTo.value).toBe("150000");
  });

  it("handles 'по договорённости' salary", () => {
    const text = "Developer\nКомпания: Тест\nЗарплата: по договорённости";
    const draft = parseVacancyImport({ source: "text", text });
    expect(draft.extractedFields.salaryFrom.level).toBe("missing");
    expect(draft.extractedFields.salaryTo.level).toBe("missing");
  });

  it("extracts work format from text", () => {
    const text = "Developer\nКомпания: Тест\nУдалённая работа";
    const draft = parseVacancyImport({ source: "text", text });
    expect(draft.extractedFields.workFormat.value).toBe("remote");
    expect(draft.extractedFields.workFormat.level).toBe("inferred");
  });

  it("extracts employment type from text", () => {
    const text = "Developer\nКомпания: Тест\nПолная занятость";
    const draft = parseVacancyImport({ source: "text", text });
    expect(draft.extractedFields.employmentType.value).toBe("full_time");
  });

  it("deduplicates skills in full parse", () => {
    const text = "Developer\nКомпания: Тест\nReact, React.js, react, javascript, JS";
    const draft = parseVacancyImport({ source: "text", text });
    const reactCount = draft.extractedFields.skills.filter((s) => s === "react").length;
    const jsCount = draft.extractedFields.skills.filter((s) => s === "javascript").length;
    expect(reactCount).toBe(1);
    expect(jsCount).toBe(1);
  });

  it("handles whitespace-only input", () => {
    const draft = parseVacancyImport({ source: "text", text: "   \n\n  " });
    expect(draft.warnings.length).toBeGreaterThan(0);
  });
});

// ---------- URL validation ----------

describe("isValidImportUrl", () => {
  it("accepts valid https URL", () => {
    expect(isValidImportUrl("https://hh.ru/vacancy/123")).toBe(true);
  });

  it("accepts valid http URL", () => {
    expect(isValidImportUrl("http://hh.ru/vacancy/123")).toBe(true);
  });

  it("accepts hh.ru subdomain URL", () => {
    expect(isValidImportUrl("https://api.hh.ru/x")).toBe(true);
  });

  it("rejects invalid URL", () => {
    expect(isValidImportUrl("not-a-url")).toBe(false);
  });

  it("rejects ftp protocol", () => {
    expect(isValidImportUrl("ftp://hh.ru/file")).toBe(false);
  });

  // ---------- Unified URL policy (source of truth: lib/security.ts isAllowedUrl) ----------

  it.each([
    "https://evil.com/x",
    "https://hh.ru.evil.com/x",
    "https://hh.ru@evil.com/x",
    "http://127.0.0.1/x",
    "javascript:alert(1)",
  ])("rejects non-hh.ru URL %j", (url) => {
    expect(isValidImportUrl(url)).toBe(false);
  });

  it("accepts empty URL", () => {
    expect(isValidImportUrl("")).toBe(true);
  });

  it("accepts null/undefined", () => {
    expect(isValidImportUrl(null as unknown as string)).toBe(true);
    expect(isValidImportUrl(undefined as unknown as string)).toBe(true);
  });
});

// ---------- Draft to Vacancy ----------

describe("draftToVacancy", () => {
  it("converts draft to vacancy fields", () => {
    const draft = parseVacancyImport({
      source: "text",
      text: "Frontend Developer\nКомпания: Тест\nReact, TypeScript",
    });

    const vacancy = draftToVacancy(draft);

    expect(vacancy.title).toBe("Frontend Developer");
    expect(vacancy.company).toBe("Тест");
    expect(vacancy.source).toBe("text");
    expect(vacancy.skills).toContain("react");
    expect(vacancy.skills).toContain("typescript");
  });

  it("allows overrides", () => {
    const draft = parseVacancyImport({
      source: "text",
      text: "Old Title\nКомпания: Тест",
    });

    const vacancy = draftToVacancy(draft, { title: "New Title" });
    expect(vacancy.title).toBe("New Title");
    expect(vacancy.company).toBe("Тест");
  });

  it("preserves sourceUrl", () => {
    const draft = parseVacancyImport({
      source: "url",
      sourceUrl: "https://hh.ru/vacancy/123",
      text: "Frontend Developer",
    });

    const vacancy = draftToVacancy(draft);
    expect(vacancy.source).toBe("url");
    expect(vacancy.sourceUrl).toBe("https://hh.ru/vacancy/123");
  });

  it("defaults to empty strings for missing fields", () => {
    const draft = parseVacancyImport({ source: "text", text: "" });
    const vacancy = draftToVacancy(draft);
    expect(vacancy.title).toBe("");
    expect(vacancy.company).toBe("");
    expect(vacancy.skills).toEqual([]);
  });
});

// ---------- normalizeSkill ----------

describe("normalizeSkill", () => {
  it("lowercases and trims", () => {
    expect(normalizeSkill("  React  ")).toBe("react");
  });

  it("removes dots", () => {
    expect(normalizeSkill("Node.js")).toBe("node");
  });

  it("removes dashes", () => {
    expect(normalizeSkill("ci-cd")).toBe("cicd");
  });

  it("maps aliases", () => {
    expect(normalizeSkill("ReactJS")).toBe("react");
    expect(normalizeSkill("Postgres")).toBe("postgresql");
    expect(normalizeSkill("k8s")).toBe("kubernetes");
    expect(normalizeSkill("MS Excel")).toBe("excel");
    expect(normalizeSkill("Microsoft Excel")).toBe("excel");
  });

  it("preserves unknown skills", () => {
    expect(normalizeSkill("CustomFramework")).toBe("customframework");
  });
});

// ---------- classifyRequirementCategory (Stage 6) ----------

describe("classifyRequirementCategory", () => {
  it("опыт работы → experience", () => {
    expect(classifyRequirementCategory("Опыт работы от 3 лет")).toBe("experience");
  });

  it("стаж → experience", () => {
    expect(classifyRequirementCategory("Стаж работы в тестировании")).toBe("experience");
  });

  it("years of experience → experience", () => {
    expect(classifyRequirementCategory("3+ years of experience")).toBe("experience");
  });

  it("высшее образование → education", () => {
    expect(classifyRequirementCategory("Высшее образование")).toBe("education");
  });

  it("диплом → education", () => {
    expect(classifyRequirementCategory("Диплом инженера")).toBe("education");
  });

  it("bachelor degree → education", () => {
    expect(classifyRequirementCategory("Bachelor degree in Computer Science")).toBe("education");
  });

  it("знание React → skill (default)", () => {
    expect(classifyRequirementCategory("Знание React")).toBe("skill");
  });

  it("знание Docker и Kubernetes → skill", () => {
    expect(classifyRequirementCategory("Знание Docker и Kubernetes")).toBe("skill");
  });

  it("знание английского языка → language", () => {
    expect(classifyRequirementCategory("Знание английского языка")).toBe("language");
  });

  it("английский B2 → language", () => {
    expect(classifyRequirementCategory("Английский язык на уровне B2")).toBe("language");
  });

  it("English (English only) → language", () => {
    expect(classifyRequirementCategory("Upper-intermediate English")).toBe("language");
  });

  it("владение немецким языком → language", () => {
    expect(classifyRequirementCategory("Владение немецким языком")).toBe("language");
  });

  it("языки программирования НЕ классифицируются как language", () => {
    expect(classifyRequirementCategory("Знание языков программирования")).toBe("skill");
  });

  it("опыт + образование: опыт побеждает (первое правило)", () => {
    expect(classifyRequirementCategory("Опыт работы от 2 лет, высшее образование")).toBe("experience");
  });

  it("пустая строка → skill (default)", () => {
    expect(classifyRequirementCategory("")).toBe("skill");
  });

  it("не-строка → skill (default, без throw)", () => {
    expect(classifyRequirementCategory(undefined as unknown as string)).toBe("skill");
    expect(classifyRequirementCategory(null as unknown as string)).toBe("skill");
  });
});

// ---------- parseSalaryValue (Stage 6, NaN regression) ----------

describe("parseSalaryValue", () => {
  it("undefined → undefined", () => {
    expect(parseSalaryValue(undefined)).toBeUndefined();
  });

  it("null → undefined", () => {
    expect(parseSalaryValue(null)).toBeUndefined();
  });

  it("empty string → undefined", () => {
    expect(parseSalaryValue("")).toBeUndefined();
    expect(parseSalaryValue("   ")).toBeUndefined();
  });

  it("invalid string → undefined (никогда не NaN)", () => {
    expect(parseSalaryValue("abc")).toBeUndefined();
    expect(Number.isNaN(parseSalaryValue("abc"))).toBe(false);
  });

  it("malformed input → undefined", () => {
    expect(parseSalaryValue("12abc")).toBeUndefined();
    expect(parseSalaryValue("150 000р")).toBeUndefined();
    expect(parseSalaryValue("от 150")).toBeUndefined();
    expect(parseSalaryValue("-100")).toBeUndefined();
    expect(parseSalaryValue("1e7")).toBeUndefined();
    expect(parseSalaryValue("Infinity")).toBeUndefined();
  });

  it("valid number → number", () => {
    expect(parseSalaryValue("150000")).toBe(150000);
    expect(parseSalaryValue("150 000")).toBe(150000); // пробелы как разделитель разрядов
  });

  it("zero → 0 (валидное число)", () => {
    expect(parseSalaryValue("0")).toBe(0);
  });

  it("decimal с запятой и точкой", () => {
    expect(parseSalaryValue("150000,50")).toBe(150000.5);
    expect(parseSalaryValue("150000.50")).toBe(150000.5);
  });
});
