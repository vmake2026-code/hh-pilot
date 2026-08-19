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

  // Salary validation
  if (data.salaryFrom.trim()) {
    const from = parseFloat(data.salaryFrom);
    if (isNaN(from) || from < 0) {
      errors.salaryFrom = "Зарплата от должна быть положительным числом";
    }
  }
  if (data.salaryTo.trim()) {
    const to = parseFloat(data.salaryTo);
    if (isNaN(to) || to < 0) {
      errors.salaryTo = "Зарплата до должна быть положительным числом";
    }
  }
  if (data.salaryFrom.trim() && data.salaryTo.trim()) {
    const from = parseFloat(data.salaryFrom);
    const to = parseFloat(data.salaryTo);
    if (!isNaN(from) && !isNaN(to) && from > to) {
      errors.salaryTo = "Зарплата до не может быть меньше зарплаты от";
    }
  }

  // Clean arrays: remove empty entries
  const cleanSkills = data.skills.filter((s) => s.trim());
  const cleanReqs = data.requirements.filter((s) => s.trim());
  const cleanResp = data.responsibilities.filter((s) => s.trim());
  void cleanSkills;
  void cleanReqs;
  void cleanResp;

  return { valid: Object.keys(errors).length === 0, errors };
}

export type { VacancyErrors };
export { validateVacancyForm };
