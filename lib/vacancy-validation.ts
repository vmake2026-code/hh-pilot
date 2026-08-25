import { parseSalaryValue } from "./salary";

type VacancyErrors = Record<string, string>;

function validateVacancyForm(data: {
  title: string;
  company: string;
  location: string;
  description: string;
  salaryFrom: string;
  salaryTo: string;
  sourceUrl: string;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
}): { valid: boolean; errors: VacancyErrors } {
  const errors: VacancyErrors = {};

  if (!data.title.trim()) {
    errors.title = "Название вакансии обязательно";
  }

  if (!data.company.trim()) {
    errors.company = "Компания обязательна";
  }

  if (!data.description.trim()) {
    errors.description = "Описание обязательно";
  }

  if (data.sourceUrl.trim()) {
    try {
      const url = new URL(data.sourceUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.sourceUrl = "URL должен начинаться с http:// или https://";
      }
    } catch {
      errors.sourceUrl = "Введите корректный URL";
    }
  }

  // Salary validation (same semantics as the import parser).
  // parseSalaryValue returns undefined for empty input — an empty field stays valid (optional).
  const parsedFrom = parseSalaryValue(data.salaryFrom);
  if (parsedFrom === undefined && data.salaryFrom.trim()) {
    errors.salaryFrom = "Зарплата от должна быть положительным числом";
  }
  const parsedTo = parseSalaryValue(data.salaryTo);
  if (parsedTo === undefined && data.salaryTo.trim()) {
    errors.salaryTo = "Зарплата до должна быть положительным числом";
  }
  if (parsedFrom !== undefined && parsedTo !== undefined && parsedFrom > parsedTo) {
    errors.salaryTo = "Зарплата до не может быть меньше зарплаты от";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export type { VacancyErrors };
export { validateVacancyForm };
