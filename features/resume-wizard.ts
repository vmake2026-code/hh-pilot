import type { WorkExperience, Education, Skill, ResumeRecord, ResumeVersion } from "../types/resume";
import type { Confident } from "../types/confirmation";
import { confirmField, missingField } from "../types/confirmation";
import { validateStep1, validateStep2, validateStep3, validateStep4, validateStep5 } from "../lib/validation";
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
  { path: "phone", label: "Телефон" },
  { path: "email", label: "Email" },
  { path: "desiredPosition", label: "Желаемая должность" },
];

// ---------- Draft persistence (context-aware envelope) ----------

const DRAFT_KEY_PREFIX = "resume-draft:";
const DRAFT_CONTEXT_NEW = "new";

/** Serializable draft snapshot bound to a single resume context. */
interface WizardDraftState {
  data: WizardData;
  step: number;
  confirmedFields: string[];
}

/** "resume-draft:new" for creation, "resume-draft:<resumeId>" for editing. */
function draftKeyFor(context: string): string {
  return DRAFT_KEY_PREFIX + context;
}

function createDraftState(
  data: WizardData,
  step: number,
  confirmedFields: Set<string>,
): WizardDraftState {
  return {
    data,
    step,
    confirmedFields: [...confirmedFields],
  };
}

function looksLikeWizardData(value: unknown): value is WizardData {
  if (typeof value !== "object" || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.firstName === "string" &&
    typeof o.lastName === "string" &&
    typeof o.desiredPosition === "string" &&
    Array.isArray(o.workExperience) &&
    Array.isArray(o.education) &&
    Array.isArray(o.skills) &&
    Array.isArray(o.languages)
  );
}

/**
 * Accepts the current envelope { data, step, confirmedFields } and the
 * legacy bare-WizardData format. Returns null for anything unusable.
 * Step is clamped into [1..WIZARD_STEPS.length]; unknown fields are
 * backfilled from defaults.
 */
function normalizeDraft(raw: unknown): WizardDraftState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  let payload: unknown = obj;
  if (
    typeof obj.data === "object" &&
    obj.data !== null &&
    looksLikeWizardData(obj.data)
  ) {
    payload = obj.data;
  }

  if (!looksLikeWizardData(payload)) return null;

  const stepRaw = obj.step;
  const step =
    typeof stepRaw === "number" &&
    Number.isInteger(stepRaw) &&
    stepRaw >= 1 &&
    stepRaw <= WIZARD_STEPS.length
      ? stepRaw
      : 1;

  const confirmedFields = Array.isArray(obj.confirmedFields)
    ? obj.confirmedFields.filter((f): f is string => typeof f === "string")
    : [];

  return {
    data: { ...createDefaultWizardData(), ...(payload as WizardData) },
    step,
    confirmedFields,
  };
}

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

// ---------- Achievements (P9.3) ----------

/** Textarea text ("one achievement per line") -> string[]: trim, drop empties, keep order. */
function parseAchievements(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** string[] -> textarea text. Legacy/undefined safely renders as an empty string. */
function achievementsToText(achievements: string[] | undefined): string {
  return (achievements ?? []).join("\n");
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
    case 5:
      return validateStep5(data.skills);
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

export type { WizardData, WizardStep, FieldCheck, FinalizeResult, WizardDraftState };
export {
  WIZARD_STEPS,
  REQUIRED_FIELDS,
  DRAFT_CONTEXT_NEW,
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
  draftKeyFor,
  createDraftState,
  normalizeDraft,
  parseAchievements,
  achievementsToText,
};
