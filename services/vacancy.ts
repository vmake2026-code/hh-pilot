import type {
  Vacancy,
  VacancyParseRequest,
  VacancySource,
} from "../types/vacancy";
import { isAllowedUrl } from "../lib/security";
import { generateId } from "../lib/ids";

interface VacancyService {
  parseVacancy(request: VacancyParseRequest): Promise<Vacancy>;
  normalizeVacancy(raw: string): Vacancy;
  validateSource(source: VacancyParseRequest): { valid: boolean; error?: string };
}

function validateVacancySource(
  request: VacancyParseRequest,
): { valid: boolean; error?: string } {
  if (request.source === "hh_url") {
    if (!request.url) {
      return { valid: false, error: "URL не указан" };
    }
    if (!isAllowedUrl(request.url)) {
      return {
        valid: false,
        error: "Разрешены только ссылки на hh.ru",
      };
    }
    return { valid: true };
  }

  if (request.source === "text") {
    if (!request.text || request.text.trim().length === 0) {
      return { valid: false, error: "Текст вакансии пуст" };
    }
    return { valid: true };
  }

  return { valid: false, error: `Неизвестный источник: ${request.source}` };
}

class MockVacancyService implements VacancyService {
  async parseVacancy(request: VacancyParseRequest): Promise<Vacancy> {
    const validation = validateVacancySource(request);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    if (request.source === "text" && request.text) {
      return this.normalizeVacancy(request.text);
    }

    return {
      id: generateId(),
      title: "Frontend Developer",
      company: "ООО Пример",
      description: "Разработка и поддержка SPA",
      requirements: [
        {
          id: generateId(),
          text: "Опыт работы от 2 лет",
          isRequired: true,
          category: "experience",
        },
        {
          id: generateId(),
          text: "Знание React",
          isRequired: true,
          category: "skill",
        },
      ],
      skills: ["React", "TypeScript"],
      responsibilities: ["Разработка UI компонентов"],
      salary: "от 150 000 ₽",
      salaryFrom: 150000,
      location: "Москва",
      source: request.source,
      sourceUrl: request.url,
      fetchedAt: new Date().toISOString(),
    };
  }

  normalizeVacancy(raw: string): Vacancy {
    return {
      id: generateId(),
      title: "Должность из текста",
      company: "Компания",
      description: raw.slice(0, 500),
      requirements: [],
      skills: [],
      responsibilities: [],
      location: "Не указано",
      source: "text",
      fetchedAt: new Date().toISOString(),
    };
  }

  validateSource(source: VacancyParseRequest) {
    return validateVacancySource(source);
  }
}

function createVacancyService(): VacancyService {
  return new MockVacancyService();
}

export type { VacancyService };
export { MockVacancyService, validateVacancySource, createVacancyService };
