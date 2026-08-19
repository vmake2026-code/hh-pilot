import type { VacancyImportDraft, VacancyImportSource } from "../types/vacancy";
import { inferField, missingField } from "../types/confirmation";


// ---------- Text normalization ----------

/**
 * Normalize raw text for parsing:
 * - strip HTML tags (keep text content)
 * - decode common HTML entities
 * - normalize \r\n → \n
 * - collapse tabs → spaces
 * - collapse multiple spaces
 * - trim
 */
function normalizeText(input: string): string {
  if (typeof input !== "string") return "";
  let text = input;

  // Normalize line endings
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip HTML tags (but keep their text content)
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)));

  // Normalize whitespace
  text = text.replace(/\t/g, " ");
  text = text.replace(/[ ]{2,}/g, " ");

  // Collapse 3+ newlines to 2
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}


// ---------- Section detection ----------

const SECTION_KEYWORDS: Record<string, string[]> = {
  requirements: ["требования", "ожидания", "нужно знать", "навыки", "what you need", "requirements", "квалификация"],
  responsibilities: ["обязанности", "задачи", "чем будете заниматься", "responsibilities", "что нужно делать", "описание работы"],
  benefits: ["преимущества", "плюсы", "мы предлагаем", "benefits", "что предлагаем"],
};

function detectSections(text: string): { start: number; key: string }[] {
  const lines = text.split("\n");
  const sections: { start: number; key: string }[] = [];
  let charOffset = 0;

  for (const line of lines) {
    const lower = line.toLowerCase().trim();
    for (const [key, keywords] of Object.entries(SECTION_KEYWORDS)) {
      if (keywords.some((kw) => lower === kw || lower.startsWith(kw + ":"))) {
        sections.push({ start: charOffset, key });
        break;
      }
    }
    charOffset += line.length + 1;
  }

  return sections;
}

function extractSection(text: string, startOffset: number, sections: { start: number; key: string }[]): string {
  const sectionIndex = sections.findIndex((s) => s.start === startOffset);
  if (sectionIndex === -1) return "";
  const endOffset = sectionIndex < sections.length - 1
    ? sections[sectionIndex + 1].start
    : text.length;
  return text.slice(startOffset, endOffset).trim();
}

function extractListFromSection(sectionText: string): string[] {
  const lines = sectionText.split("\n");
  const items: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip the section header itself
    const lower = line.toLowerCase();
    const isHeader = Object.values(SECTION_KEYWORDS).some((kws) =>
      kws.some((kw) => lower === kw || lower.startsWith(kw + ":")),
    );
    if (isHeader) continue;

    // Match bullet points or numbered items
    const cleaned = line.replace(/^[\s]*[-–•*]\s*/, "").replace(/^[\s]*\d+[.)]\s*/, "").trim();
    if (cleaned.length > 1) {
      items.push(cleaned);
    }
  }
  return items;
}

// ---------- Title / Company / Location / Salary ----------

function extractTitle(text: string, sections: { start: number; key: string }[]): string {
  // Title is typically the first non-empty line before any section
  const firstSectionStart = sections.length > 0 ? sections[0].start : text.length;
  const header = text.slice(0, firstSectionStart).trim();
  const lines = header.split("\n").map((l) => l.trim()).filter(Boolean);

  // First line that looks like a title (not "Компания:", not a city name)
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("компания:") || lower.startsWith("company:")) continue;
    if (lower.startsWith("зарплат") || lower.startsWith("salary")) continue;
    if (lower.startsWith("город") || lower.startsWith("location")) continue;
    if (/^(москва|петербург|санкт|нижний|краснодар|екатеринбург|новосибирск)/i.test(lower)) continue;
    return line;
  }
  return lines[0] ?? "";
}

function extractCompany(text: string): string {
  const patterns = [
    /компания\s*[:]\s*(.+)/i,
    /company\s*[:]\s*(.+)/i,
    /организация\s*[:]\s*(.+)/i,
    /employer\s*[:]\s*(.+)/i,
    /в\s+([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*)\s*[,.]/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return "";
}

function extractLocation(text: string): string {
  const patterns = [
    /город\s*[:]\s*(.+)/i,
    /location\s*[:]\s*(.+)/i,
    /локация\s*[:]\s*(.+)/i,
    /(москва|санкт-петербург|петербург|нижний новгород|краснодар|екатеринбург|новосибирск|казань|самара)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Look for format indicators in location context
  const formatPattern = /(?:удалённ|удаленн|remote|офис|office|гибрид|hybrid)/i;
  const fmtMatch = text.match(formatPattern);
  if (fmtMatch) {
    return fmtMatch[0];
  }

  return "";
}

function extractSalary(text: string): { salaryFrom: string; salaryTo: string; currency: string } {
  let salaryFrom = "";
  let salaryTo = "";
  let currency = "₽";

  // Skip text like "по договорённости", "не указана", etc.
  if (/по\s+договоренност|не\s+указана|без\s+зарплаты|competitive/i.test(text)) {
    return { salaryFrom, salaryTo, currency };
  }

  // Detect currency
  if (/\$|usd|доллар/i.test(text)) currency = "$";
  else if (/€|eur|евро/i.test(text)) currency = "€";

  // Pattern: "от 150 000 до 250 000" or "150 000 – 250 000"
  const rangePatterns = [
    /зарплат\w*\s*[:]\s*(?:от\s+)?(\d[\d\s]*\d)\s*(?:до|–|-|—)\s*(\d[\d\s]*\d)/i,
    /от\s+(\d[\d\s]*\d)\s*(?:до|–|-|—)\s*(\d[\d\s]*\d)/i,
    /(\d[\d\s]*\d)\s*(?:–|-|—)\s*(\d[\d\s]*\d)\s*(?:₽|\$|€)?/i,
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (match) {
      salaryFrom = normalizeNumber(match[1]);
      salaryTo = normalizeNumber(match[2]);
      // Guard against from > to
      if (salaryFrom && salaryTo && parseInt(salaryFrom) > parseInt(salaryTo)) {
        [salaryFrom, salaryTo] = [salaryTo, salaryFrom];
      }
      return { salaryFrom, salaryTo, currency };
    }
  }

  // Single salary: "от 200 000" or "до 300 000"
  const singlePatterns = [
    /(?:от|salary from)\s+(\d[\d\s]*\d)/i,
    /(?:до|salary to)\s+(\d[\d\s]*\d)/i,
    /зарплат\w*\s+до\s+(\d[\d\s]*\d)/i,
  ];

  for (const pattern of singlePatterns) {
    const match = text.match(pattern);
    if (match) {
      const val = normalizeNumber(match[1]);
      if (val === "0") continue; // Skip zero values
      if (pattern.source.includes("от") || pattern.source.includes("from")) {
        salaryFrom = val;
      } else {
        salaryTo = val;
      }
      return { salaryFrom, salaryTo, currency };
    }
  }

  return { salaryFrom, salaryTo, currency };
}

function normalizeNumber(raw: string): string {
  return raw.replace(/\s/g, "");
}

// ---------- Work format / employment type ----------

function extractWorkFormat(text: string): string {
  const lower = text.toLowerCase();
  if (/\bremote\b|удалённ|удаленн/.test(lower)) return "remote";
  if (/\boffice\b|в\s+офисе/.test(lower)) return "office";
  if (/\bhybrid\b|гибрид/.test(lower)) return "hybrid";
  return "";
}

function extractEmploymentType(text: string): string {
  const lower = text.toLowerCase();
  if (/\bfull[- ]?time\b|полная\s+занятость/.test(lower)) return "full_time";
  if (/\bpart[- ]?time\b|частичная|неполная/.test(lower)) return "part_time";
  if (/\bcontract\b|контракт/.test(lower)) return "contract";
  if (/\bfreelance\b|фриланс/.test(lower)) return "freelance";
  return "";
}

// ---------- Skills ----------

// Canonical aliases: normalize common variations to a single canonical name
const SKILL_CANONICAL: Record<string, string> = {
  "react": "react",
  "react.js": "react",
  "reactjs": "react",
  "angular": "angular",
  "angular.js": "angular",
  "angularjs": "angular",
  "vue": "vue",
  "vue.js": "vue",
  "vuejs": "vue",
  "next": "nextjs",
  "next.js": "nextjs",
  "nextjs": "nextjs",
  "nuxt": "nuxtjs",
  "nuxt.js": "nuxtjs",
  "nuxtjs": "nuxtjs",
  "typescript": "typescript",
  "javascript": "javascript",
  "node": "node",
  "node.js": "node",
  "nodejs": "node",
  "python": "python",
  "java": "java",
  "go": "go",
  "golang": "go",
  "rust": "rust",
  "php": "php",
  "ruby": "ruby",
  "c#": "csharp",
  "csharp": "csharp",
  "swift": "swift",
  "kotlin": "kotlin",
  "postgresql": "postgresql",
  "postgres": "postgresql",
  "psql": "postgresql",
  "mysql": "mysql",
  "mongodb": "mongodb",
  "mongo": "mongodb",
  "redis": "redis",
  "elasticsearch": "elasticsearch",
  "docker": "docker",
  "kubernetes": "kubernetes",
  "k8s": "kubernetes",
  "terraform": "terraform",
  "aws": "aws",
  "gcp": "gcp",
  "azure": "azure",
  "git": "git",
  "github": "git",
  "gitlab": "git",
  "html": "html",
  "css": "css",
  "sass": "sass",
  "scss": "sass",
  "tailwind": "tailwind",
  "tailwindcss": "tailwind",
  "bootstrap": "bootstrap",
  "graphql": "graphql",
  "rest": "rest",
  "grpc": "grpc",
  "websockets": "websockets",
  "figma": "figma",
  "sketch": "sketch",
  "jest": "jest",
  "vitest": "vitest",
  "mocha": "mocha",
  "cypress": "cypress",
  "playwright": "playwright",
  "webpack": "webpack",
  "vite": "vite",
  "babel": "babel",
  "jira": "jira",
  "confluence": "confluence",
  "agile": "agile",
  "scrum": "scrum",
  "linux": "linux",
  "bash": "bash",
  "ci/cd": "cicd",
  "jenkins": "jenkins",
  "excel": "excel",
  "microsoft excel": "excel",
  "ms excel": "excel",
  "google sheets": "google_sheets",
  "powerpoint": "powerpoint",
};

function normalizeSkill(raw: string): string {
  let s = raw.toLowerCase().trim().replace(/\s+/g, " ");
  // Remove dots, dashes (but preserve slash for ci/cd)
  s = s.replace(/[.\-]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return SKILL_CANONICAL[s] ?? s;
}

// Known skill keywords for extraction from text
const KNOWN_SKILL_KEYWORDS = [
  "react", "angular", "vue", "vuejs", "next", "nextjs", "nuxt", "nuxtjs",
  "typescript", "javascript", "node", "nodejs", "python", "java", "go", "golang",
  "rust", "php", "ruby", "c#", "csharp", "swift", "kotlin",
  "postgresql", "mysql", "mongodb", "redis", "elasticsearch",
  "docker", "kubernetes", "k8s", "terraform", "aws", "gcp", "azure",
  "git", "github", "gitlab",
  "html", "css", "sass", "scss", "tailwind", "bootstrap",
  "graphql", "rest", "grpc", "websockets",
  "figma", "sketch",
  "jest", "vitest", "mocha", "cypress", "playwright",
  "webpack", "vite", "babel",
  "jira", "confluence", "agile", "scrum",
  "linux", "bash", "ci/cd", "jenkins",
  "excel", "microsoft excel", "ms excel",
];

function extractSkills(text: string): string[] {
  if (!text || typeof text !== "string") return [];

  const found = new Set<string>();
  const lowerText = text.toLowerCase();

  for (const skill of KNOWN_SKILL_KEYWORDS) {
    // Match as word boundary or surrounded by punctuation
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|[\\s,;/\\-–(])${escaped}(?:[\\s,;/\\-–).]|$)`, "i");
    if (pattern.test(lowerText)) {
      found.add(normalizeSkill(skill));
    }
  }

  return [...found];
}

// ---------- Main parser ----------

interface ParseInput {
  source: VacancyImportSource;
  sourceUrl?: string;
  text?: string;
}

function parseVacancyImport(input: ParseInput): VacancyImportDraft {
  const warnings: string[] = [];
  const source = input?.source ?? "text";
  const sourceUrl = input?.sourceUrl ?? "";
  const rawText = typeof input?.text === "string" ? input.text : "";

  if (source === "url" && !rawText.trim()) {
    warnings.push(
      "Автоматическая загрузка страницы пока не подключена. Вставьте текст вакансии для разбора.",
    );
  }

  const trimmedText = normalizeText(rawText);

  // Guard: empty input after normalization
  if (!trimmedText) {
    return {
      source,
      sourceUrl: (sourceUrl ?? "").trim(),
      rawText: "",
      extractedFields: {
        title: missingField(),
        company: missingField(),
        location: missingField(),
        salaryFrom: missingField(),
        salaryTo: missingField(),
        currency: missingField(),
        description: missingField(),
        skills: [],
        requirements: [],
        responsibilities: [],
        workFormat: missingField(),
        employmentType: missingField(),
      },
      warnings: warnings.length > 0 ? warnings : ["Текст вакансии пуст. Вставьте текст для разбора."],
    };
  }

  const sections = detectSections(trimmedText);

  // Extract fields
  const title = extractTitle(trimmedText, sections);
  const company = extractCompany(trimmedText);
  const location = extractLocation(trimmedText);
  const { salaryFrom, salaryTo, currency } = extractSalary(trimmedText);
  const workFormat = extractWorkFormat(trimmedText);
  const employmentType = extractEmploymentType(trimmedText);
  const skills = extractSkills(trimmedText);

  // Extract requirements section
  let requirements: string[] = [];
  const reqSection = sections.find((s) => s.key === "requirements");
  if (reqSection) {
    const sectionText = extractSection(trimmedText, reqSection.start, sections);
    requirements = extractListFromSection(sectionText);
  }

  // Extract responsibilities section
  let responsibilities: string[] = [];
  const respSection = sections.find((s) => s.key === "responsibilities");
  if (respSection) {
    const sectionText = extractSection(trimmedText, respSection.start, sections);
    responsibilities = extractListFromSection(sectionText);
  }

  // Build description from all text if no sections found
  const description = trimmedText;

  // Build confidence for each field
  const titleConf = title ? inferField(title) : missingField();
  const companyConf = company ? inferField(company) : missingField();
  const locationConf = location ? inferField(location) : missingField();
  const salaryFromConf = salaryFrom ? inferField(salaryFrom) : missingField();
  const salaryToConf = salaryTo ? inferField(salaryTo) : missingField();
  const currencyConf = currency !== "₽" ? inferField(currency) : missingField();
  const descriptionConf = description ? inferField(description) : missingField();
  const workFormatConf = workFormat ? inferField(workFormat) : missingField();
  const employmentTypeConf = employmentType ? inferField(employmentType) : missingField();

  // Add warnings for low-confidence fields
  if (!title) warnings.push("Название не определено. Укажите его вручную.");
  if (!company) warnings.push("Компания не определена. Укажите её вручную.");
  if (!salaryFrom && !salaryTo) warnings.push("Зарплата не определена.");
  if (skills.length === 0) warnings.push("Навыки не распознаны. Добавьте их вручную.");

  return {
    source,
    sourceUrl: (sourceUrl ?? "").trim(),
    rawText: trimmedText,
    extractedFields: {
      title: titleConf,
      company: companyConf,
      location: locationConf,
      salaryFrom: salaryFromConf,
      salaryTo: salaryToConf,
      currency: currencyConf,
      description: descriptionConf,
      skills,
      requirements,
      responsibilities,
      workFormat: workFormatConf,
      employmentType: employmentTypeConf,
    },
    warnings,
  };
}

// ---------- Draft → Vacancy ----------

function draftToVacancy(
  draft: VacancyImportDraft,
  overrides: {
    title?: string;
    company?: string;
    location?: string;
    description?: string;
    salaryFrom?: string;
    salaryTo?: string;
    currency?: string;
    skills?: string[];
    requirements?: string[];
    responsibilities?: string[];
    workFormat?: string;
    employmentType?: string;
  } = {},
): {
  title: string;
  company: string;
  location: string;
  description: string;
  salaryFrom: string;
  salaryTo: string;
  currency: string;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
  workFormat: string;
  employmentType: string;
  source: VacancyImportSource;
  sourceUrl: string;
} {
  const f = draft.extractedFields;
  return {
    title: overrides.title ?? f.title.value ?? "",
    company: overrides.company ?? f.company.value ?? "",
    location: overrides.location ?? f.location.value ?? "",
    description: overrides.description ?? f.description.value ?? "",
    salaryFrom: overrides.salaryFrom ?? f.salaryFrom.value ?? "",
    salaryTo: overrides.salaryTo ?? f.salaryTo.value ?? "",
    currency: overrides.currency ?? f.currency.value ?? "₽",
    skills: overrides.skills ?? f.skills,
    requirements: overrides.requirements ?? f.requirements,
    responsibilities: overrides.responsibilities ?? f.responsibilities,
    workFormat: overrides.workFormat ?? f.workFormat.value ?? "",
    employmentType: overrides.employmentType ?? f.employmentType.value ?? "",
    source: draft.source,
    sourceUrl: draft.sourceUrl,
  };
}

// ---------- URL validation ----------

function isValidImportUrl(url: string): boolean {
  if (!url?.trim()) return true; // empty is valid (optional)
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export {
  normalizeText,
  parseVacancyImport,
  draftToVacancy,
  isValidImportUrl,
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
};
