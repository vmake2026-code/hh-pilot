import type { WorkFormat, EmploymentType } from "./candidate";
import type { Confident } from "./confirmation";

type VacancySource = "hh_url" | "text";

interface VacancyParseRequest {
  source: VacancySource;
  url?: string;
  text?: string;
}

interface VacancyRequirement {
  id: string;
  text: string;
  isRequired: boolean;
  category?:
    | "experience"
    | "education"
    | "skill"
    | "language"
    | "soft_skill"
    | "other";
}

interface Vacancy {
  id: string;
  title: string;
  company: string;
  description: string;
  requirements: VacancyRequirement[];
  skills: string[];
  responsibilities: string[];
  salary?: string;
  salaryFrom?: number;
  salaryTo?: number;
  currency?: string;
  location: string;
  workFormat?: WorkFormat;
  employmentType?: EmploymentType;
  experienceLevel?: string;
  source: VacancySource;
  sourceUrl?: string;
  fetchedAt: string;
}

// ---------- Vacancy Import ----------

type VacancyImportSource = "manual" | "url" | "text";

interface VacancyImportDraft {
  source: VacancyImportSource;
  sourceUrl: string;
  rawText: string;
  extractedFields: {
    title: Confident<string>;
    company: Confident<string>;
    location: Confident<string>;
    salaryFrom: Confident<string>;
    salaryTo: Confident<string>;
    currency: Confident<string>;
    description: Confident<string>;
    skills: string[];
    requirements: string[];
    responsibilities: string[];
    workFormat: Confident<string>;
    employmentType: Confident<string>;
  };
  warnings: string[];
}

export type {
  VacancySource,
  VacancyParseRequest,
  VacancyRequirement,
  Vacancy,
  VacancyImportSource,
  VacancyImportDraft,
};
