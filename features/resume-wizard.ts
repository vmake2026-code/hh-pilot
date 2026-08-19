import type { WorkExperience, Education, Skill, ResumeRecord, ResumeVersion } from "../types/resume";
import type { Confident } from "../types/confirmation";
import { confirmField, missingField } from "../types/confirmation";
import { validateStep1, validateStep2, validateStep3, validateStep4 } from "../lib/validation";
import { generateId } from "../lib/ids";
import { createResumeEngine } from "../services/resume";
import { saveResumeRecord, getResumeRecord } from "../services/resume-persistence";

// ---------- Wizard data per step ----------

interface WizardData {
  firstName: string;
  lastName: string;
  middleName: string;
  city: string;
  phone: string;
  email: string;
  desiredPosition: string;
  desiredSalary: string;
  workFormat: string;
  employmentType: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: Skill[];
  summary: string;
  languages: string[];
}

const WIZARD_STEPS = [
  { number: 1, title: "Основная информация", short: "Личные данные" },
  { number: 2, title: "Желаемая должность", short: "Позиция" },
  { number: 3, title: "Опыт работы", short: "Опыт" },
  { number: 4, title: "Образование", short: "Образование" },
  { number: 5, title: "Навыки", short: "Навыки" },
  { number: 6, title: "Дополнительная информация", short: "Доп. информация" },
  { number: 7, title: "Предварительный просмотр", short: "Просмотр" },
  { number: 8, title: "Подтверждение фактов", short: "Проверка" },
] as const;

type WizardStep = (typeof WIZARD_STEPS)[number]["number"];

// ---------- Required fields for fact-check ----------

const REQUIRED_FIELDS: { path: string; label: string }[] = [
  { path: "firstName", label: "Имя" },
  { path: "lastName", label: "Фамилия" },
  { path: "city", label: "Город" },
  { path: "phone", label: "Телефон" },
  { path: "email", label: "Email" },
  { path: "desiredPosition", label: "Желаемая должность" },
];

// ---------- Fact-check ----------

interface FieldCheck {
  fieldPath: string;
  label: string;
  value: string;
  level: "confirmed" | "missing";
  isRequired: boolean;
}

function buildFactChecks(
  data: WizardData,
  confirmed: Set<string>,
): FieldCheck[] {
  return REQUIRED_FIELDS.map(({ path, label }) => {
    const value = (data as unknown as Record<string, string>)[path] ?? "";
    const isEmpty = !value.trim();
    const isConfirmed = confirmed.has(path);
    return {
      fieldPath: path,
      label,
      value,
      level: isEmpty ? "missing" : isConfirmed ? "confirmed" : "missing",
      isRequired: true,
    };
  });
}

function canFinalize(
  data: WizardData,
  confirmed: Set<string>,
): { allowed: boolean; blockingFields: string[] } {
  const blocking: string[] = [];
  for (const { path, label } of REQUIRED_FIELDS) {
    const value = (data as unknown as Record<string, string>)[path] ?? "";
    if (!value.trim() || !confirmed.has(path)) {
      blocking.push(label);
    }
  }
  return { allowed: blocking.length === 0, blockingFields: blocking };
}

// ---------- Validation per step ----------

function validateWizardStep(
  step: WizardStep,
  data: WizardData,
): { valid: boolean; errors: Record<string, string> } {
  switch (step) {
    case 1:
      return validateStep1(data);
    case 2:
      return validateStep2(data);
    case 3:
      return validateStep3(data.workExperience);
    case 4:
      return validateStep4(data.education);
    default:
      return { valid: true, errors: {} };
  }
}

// ---------- Empty item factories ----------

function createEmptyWorkExperience(): WorkExperience {
  return {
    id: `we-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    company: "",
    position: "",
    startDate: "",
    endDate: null,
    isCurrent: false,
    description: "",
    achievements: [],
  };
}

function createEmptyEducation(): Education {
  return {
    id: `edu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    institution: "",
    degree: "",
    field: "",
    startDate: "",
    endDate: null,
    description: "",
  };
}

// ---------- Default data ----------

function createDefaultWizardData(): WizardData {
  return {
    firstName: "",
    lastName: "",
    middleName: "",
    city: "",
    phone: "",
    email: "",
    desiredPosition: "",
    desiredSalary: "",
    workFormat: "",
    employmentType: "",
    workExperience: [],
    education: [],
    skills: [],
    summary: "",
    languages: [],
  };
}

// ---------- Convert wizard data to Confident types ----------

function toConfirmedOrMissing(value: string): Confident<string> {
  return value.trim() ? confirmField(value.trim()) : missingField();
}

function wizardDataToResumeFields(data: WizardData) {
  return {
    firstName: toConfirmedOrMissing(data.firstName),
    lastName: toConfirmedOrMissing(data.lastName),
    middleName: toConfirmedOrMissing(data.middleName),
    email: toConfirmedOrMissing(data.email),
    phone: toConfirmedOrMissing(data.phone),
    city: toConfirmedOrMissing(data.city),
    desiredPosition: toConfirmedOrMissing(data.desiredPosition),
    salaryExpectation: toConfirmedOrMissing(data.desiredSalary),
    summary: toConfirmedOrMissing(data.summary),
    workExperience: data.workExperience,
    education: data.education,
    skills: data.skills,
    languages: data.languages,
  };
}

// ---------- Finalize: wizard data → persisted ResumeRecord + ResumeVersion ----------

interface FinalizeResult {
  record: ResumeRecord;
  version: ResumeVersion;
}

function finalizeResume(
  data: WizardData,
  confirmedFields: Set<string>,
): FinalizeResult {
  const engine = createResumeEngine();
  const now = new Date().toISOString();
  const resumeId = generateId();
  const candidateId = generateId();

  const fields = wizardDataToResumeFields(data);

  // Build Resume
  const resume = engine.createBlank({
    id: candidateId,
    firstName: fields.firstName,
    lastName: fields.lastName,
    middleName: fields.middleName,
    email: fields.email,
    phone: fields.phone,
    city: fields.city,
    desiredPosition: fields.desiredPosition,
    salaryExpectation: fields.salaryExpectation,
    workFormat: missingField(),
    employmentType: missingField(),
    summary: fields.summary,
    workExperience: fields.workExperience,
    education: fields.education,
    skills: fields.skills,
    createdAt: now,
    updatedAt: now,
  });

  resume.id = resumeId;
  resume.title = data.desiredPosition || "Новое резюме";

  // Create version 1 — includes workFormat and employmentType
  const version = engine.createVersion(resume, {
    desiredPosition: fields.desiredPosition,
    summary: fields.summary,
    salaryExpectation: fields.salaryExpectation,
    location: fields.city,
    workExperience: fields.workExperience,
    education: fields.education,
    skills: fields.skills,
    languages: fields.languages,
    workFormat: data.workFormat,
    employmentType: data.employmentType,
  }, 1);

  resume.currentVersionId = version.id;

  // Build ResumeRecord
  const record: ResumeRecord = {
    id: resumeId,
    resume,
    versions: [version],
    candidateInfo: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      middleName: data.middleName.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      city: data.city.trim(),
    },
    workFormat: data.workFormat,
    employmentType: data.employmentType,
    confirmedFields: Array.from(confirmedFields),
    createdAt: now,
    updatedAt: now,
  };

  saveResumeRecord(record);

  return { record, version };
}

// ---------- Re-edit: ResumeRecord → WizardData ----------

function resumeRecordToWizardData(record: ResumeRecord): WizardData {
  const { candidateInfo } = record;
  const currentVersion = record.versions.find(
    (v) => v.id === record.resume.currentVersionId,
  ) ?? record.versions[record.versions.length - 1];

  const versionData = currentVersion?.data;

  return {
    firstName: candidateInfo.firstName,
    lastName: candidateInfo.lastName,
    middleName: candidateInfo.middleName,
    city: candidateInfo.city,
    phone: candidateInfo.phone,
    email: candidateInfo.email,
    desiredPosition: versionData?.desiredPosition?.value ?? "",
    desiredSalary: versionData?.salaryExpectation?.value ?? "",
    // Prefer version data, fall back to record-level
    workFormat: versionData?.workFormat ?? record.workFormat,
    employmentType: versionData?.employmentType ?? record.employmentType,
    workExperience: versionData?.workExperience ?? [],
    education: versionData?.education ?? [],
    skills: versionData?.skills ?? [],
    summary: versionData?.summary?.value ?? "",
    languages: versionData?.languages ?? [],
  };
}

// ---------- Load for edit ----------

function loadForEdit(resumeId: string): { record: ResumeRecord; wizardData: WizardData } | null {
  const record = getResumeRecord(resumeId);
  if (!record) return null;
  return { record, wizardData: resumeRecordToWizardData(record) };
}

// ---------- Create new version ----------

function createNewVersion(
  data: WizardData,
  record: ResumeRecord,
  confirmedFields: Set<string>,
): ResumeVersion {
  const engine = createResumeEngine();
  const fields = wizardDataToResumeFields(data);
  const newVersionNumber = record.versions.length + 1;

  const version = engine.createVersion(record.resume, {
    desiredPosition: fields.desiredPosition,
    summary: fields.summary,
    salaryExpectation: fields.salaryExpectation,
    location: fields.city,
    workExperience: fields.workExperience,
    education: fields.education,
    skills: fields.skills,
    languages: fields.languages,
    workFormat: data.workFormat,
    employmentType: data.employmentType,
  }, newVersionNumber);

  record.versions.push(version);
  record.resume.currentVersionId = version.id;
  record.resume.updatedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  record.confirmedFields = Array.from(confirmedFields);
  record.workFormat = data.workFormat;
  record.employmentType = data.employmentType;

  saveResumeRecord(record);

  return version;
}

export type { WizardData, WizardStep, FieldCheck, FinalizeResult };
export {
  WIZARD_STEPS,
  REQUIRED_FIELDS,
  createDefaultWizardData,
  createEmptyWorkExperience,
  createEmptyEducation,
  validateWizardStep,
  buildFactChecks,
  canFinalize,
  toConfirmedOrMissing,
  wizardDataToResumeFields,
  finalizeResume,
  resumeRecordToWizardData,
  loadForEdit,
  createNewVersion,
};
