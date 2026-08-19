import type { WorkExperience, Education } from "../types/resume";

type ValidationErrors = Record<string, string>;

function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `Поле "${label}" обязательно для заполнения`;
  return null;
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email обязателен для заполнения";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Введите корректный email";
  if (email.length > 320) return "Email слишком длинный";
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone.trim()) return "Телефон обязателен для заполнения";
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (!/^\+?\d{7,15}$/.test(cleaned)) return "Введите корректный номер телефона";
  return null;
}

function validateDateRange(start: string, end: string | null, label: string): string | null {
  if (!start) return `Укажите дату начала для "${label}"`;
  if (end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate < startDate) {
      return `Дата окончания не может быть раньше даты начала для "${label}"`;
    }
  }
  return null;
}

function validateWorkExperience(items: WorkExperience[]): ValidationErrors {
  const errors: ValidationErrors = {};
  items.forEach((item, index) => {
    const prefix = `work[${index}]`;
    const companyErr = validateRequired(item.company, `Место работы #${index + 1}: Компания`);
    if (companyErr) errors[`${prefix}.company`] = companyErr;

    const posErr = validateRequired(item.position, `Место работы #${index + 1}: Должность`);
    if (posErr) errors[`${prefix}.position`] = posErr;

    const dateErr = validateDateRange(item.startDate, item.endDate, `Место работы #${index + 1}`);
    if (dateErr) errors[`${prefix}.dates`] = dateErr;
  });
  return errors;
}

function validateEducation(items: Education[]): ValidationErrors {
  const errors: ValidationErrors = {};
  items.forEach((item, index) => {
    const prefix = `edu[${index}]`;
    const instErr = validateRequired(item.institution, `Образование #${index + 1}: Учебное заведение`);
    if (instErr) errors[`${prefix}.institution`] = instErr;

    const degreeErr = validateRequired(item.degree, `Образование #${index + 1}: Степень`);
    if (degreeErr) errors[`${prefix}.degree`] = degreeErr;

    const dateErr = validateDateRange(item.startDate, item.endDate, `Образование #${index + 1}`);
    if (dateErr) errors[`${prefix}.dates`] = dateErr;
  });
  return errors;
}

// ---------- Step-level validators ----------

interface StepValidationResult {
  valid: boolean;
  errors: ValidationErrors;
}

function validateStep1(data: {
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  email: string;
}): StepValidationResult {
  const errors: ValidationErrors = {};

  const fn = validateRequired(data.firstName, "Имя");
  if (fn) errors.firstName = fn;

  const ln = validateRequired(data.lastName, "Фамилия");
  if (ln) errors.lastName = ln;

  const city = validateRequired(data.city, "Город");
  if (city) errors.city = city;

  const phone = validatePhone(data.phone);
  if (phone) errors.phone = phone;

  const email = validateEmail(data.email);
  if (email) errors.email = email;

  return { valid: Object.keys(errors).length === 0, errors };
}

function validateStep2(data: {
  desiredPosition: string;
}): StepValidationResult {
  const errors: ValidationErrors = {};
  const pos = validateRequired(data.desiredPosition, "Желаемая должность");
  if (pos) errors.desiredPosition = pos;
  return { valid: Object.keys(errors).length === 0, errors };
}

function validateStep3(items: WorkExperience[]): StepValidationResult {
  const errors = validateWorkExperience(items);
  return { valid: Object.keys(errors).length === 0, errors };
}

function validateStep4(items: Education[]): StepValidationResult {
  const errors = validateEducation(items);
  return { valid: Object.keys(errors).length === 0, errors };
}

// Step 5 (skills) and Step 6 (additional) have no required fields

function validateAllSteps(data: {
  firstName: string;
  lastName: string;
  city: string;
  phone: string;
  email: string;
  desiredPosition: string;
  workExperience: WorkExperience[];
  education: Education[];
}): ValidationErrors {
  const all: ValidationErrors = {};
  Object.assign(all, validateStep1(data).errors);
  Object.assign(all, validateStep2(data).errors);
  Object.assign(all, validateStep3(data.workExperience).errors);
  Object.assign(all, validateStep4(data.education).errors);
  return all;
}

export type { ValidationErrors, StepValidationResult };
export {
  validateRequired,
  validateEmail,
  validatePhone,
  validateDateRange,
  validateWorkExperience,
  validateEducation,
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateAllSteps,
};
