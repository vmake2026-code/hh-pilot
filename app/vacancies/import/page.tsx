"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateId } from "@/lib/ids";
import { saveVacancy } from "@/services/vacancy-persistence";
import {
  parseVacancyImport,
  isValidImportUrl,
} from "@/services/vacancy-import";
import { sanitizeText } from "@/lib/security";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import type { WorkFormat, EmploymentType } from "@/types/candidate";
import type { VacancyImportDraft } from "@/types/vacancy";
import FormField from "@/components/ui/form-field";

const WORK_FORMAT_OPTIONS = Object.entries(WORK_FORMAT_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const EMPLOYMENT_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

type Step = "input" | "preview";

export default function VacancyImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [urlError, setUrlError] = useState("");
  const [draft, setDraft] = useState<VacancyImportDraft | null>(null);

  // Editable fields in preview
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [salaryFrom, setSalaryFrom] = useState("");
  const [salaryTo, setSalaryTo] = useState("");
  const [currency, setCurrency] = useState("₽");
  const [description, setDescription] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");
  const [workFormat, setWorkFormat] = useState("");
  const [employmentType, setEmploymentType] = useState("");

  const handleParse = useCallback(() => {
    // Validate URL if provided
    if (sourceUrl.trim() && !isValidImportUrl(sourceUrl)) {
      setUrlError("Введите корректный URL (http:// или https://)");
      return;
    }
    setUrlError("");

    const source = sourceUrl.trim() ? "url" : "text";
    const parsed = parseVacancyImport({
      source,
      sourceUrl: sourceUrl.trim(),
      text: rawText,
    });

    setDraft(parsed);

    // Populate editable fields from draft
    const f = parsed.extractedFields;
    setTitle(f.title.value ?? "");
    setCompany(f.company.value ?? "");
    setLocation(f.location.value ?? "");
    setSalaryFrom(f.salaryFrom.value ?? "");
    setSalaryTo(f.salaryTo.value ?? "");
    setCurrency(f.currency.value ?? "₽");
    setDescription(f.description.value ?? "");
    setSkillsText(f.skills.join(", "));
    setRequirementsText(f.requirements.join("\n"));
    setResponsibilitiesText(f.responsibilities.join("\n"));
    setWorkFormat(f.workFormat.value ?? "");
    setEmploymentType(f.employmentType.value ?? "");

    setStep("preview");
  }, [sourceUrl, rawText]);

  const handleSave = useCallback(() => {
    if (!draft) return;

    const skillList = skillsText.split(",").map((s) => s.trim()).filter(Boolean);
    const reqList = requirementsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const respList = responsibilitiesText.split("\n").map((s) => s.trim()).filter(Boolean);

    const now = new Date().toISOString();
    const id = generateId();

    const vacancy = {
      id,
      title: sanitizeText(title),
      company: sanitizeText(company),
      location: sanitizeText(location),
      workFormat: workFormat ? (workFormat as WorkFormat) : undefined,
      employmentType: employmentType ? (employmentType as EmploymentType) : undefined,
      salaryFrom: salaryFrom ? parseFloat(salaryFrom) : undefined,
      salaryTo: salaryTo ? parseFloat(salaryTo) : undefined,
      currency: currency || undefined,
      salary: salaryFrom
        ? `от ${salaryFrom} ${currency}${salaryTo ? ` до ${salaryTo}` : ""}`
        : salaryTo
          ? `до ${salaryTo} ${currency}`
          : undefined,
      description: sanitizeText(description),
      requirements: reqList.map((text, i) => ({
        id: `req-${id}-${i}`,
        text,
        isRequired: true,
        category: "skill" as const,
      })),
      skills: skillList,
      responsibilities: respList,
      source: draft.source === "url" ? "hh_url" as const : "text" as const,
      sourceUrl: draft.sourceUrl || undefined,
      fetchedAt: now,
    };

    saveVacancy(vacancy);
    router.push(`/vacancies/${id}`);
  }, [draft, title, company, location, workFormat, employmentType, salaryFrom, salaryTo, currency, description, skillsText, requirementsText, responsibilitiesText, router]);

  // ---------- INPUT step ----------
  if (step === "input") {
    return (
      <main className="page-wide">
        <div className="preview-actions-bar">
          <Link href="/vacancies" className="btn btn-secondary btn-sm">
            ← К вакансиям
          </Link>
        </div>

        <div className="wizard-container">
          <h2>Импорт вакансии</h2>
          <p className="wizard-hint">
            Вставьте URL или текст вакансии для автоматического разбора полей.
          </p>

          <div className="wizard-fields">
            <FormField
              label="URL вакансии"
              name="sourceUrl"
              value={sourceUrl}
              error={urlError}
              placeholder="https://hh.ru/vacancy/12345"
              onChange={setSourceUrl}
            />

            <FormField
              label="Текст вакансии"
              name="rawText"
              type="textarea"
              value={rawText}
              placeholder={`Frontend Developer\n\nКомпания: ООО Ромашка\nМосква / удалённо\nЗарплата: 180000–250000 ₽\n\nТребования:\nReact\nTypeScript\n3+ года опыта\n\nОбязанности:\nРазработка интерфейсов`}
              rows={12}
              onChange={setRawText}
            />
          </div>

          <div className="wizard-nav">
            <div className="wizard-nav-left">
              <button
                type="button"
                className="btn btn-secondary btn-md"
                onClick={() => router.back()}
              >
                ← Назад
              </button>
            </div>
            <div className="wizard-nav-right">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleParse}
                disabled={!rawText.trim()}
              >
                Разобрать вакансию
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---------- PREVIEW step ----------
  return (
    <main className="page-wide">
      <div className="preview-actions-bar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStep("input")}
        >
          ← К вводу
        </button>
      </div>

      <div className="wizard-container">
        <h2>Результат разбора</h2>

        {draft && draft.warnings.length > 0 && (
          <div className="import-warnings">
            {draft.warnings.map((w, i) => (
              <div key={i} className="import-warning">
                ⚠ {w}
              </div>
            ))}
          </div>
        )}

        <div className="wizard-fields">
          <FormField
            label="Название"
            name="title"
            value={title}
            required
            placeholder="Frontend Developer"
            onChange={setTitle}
          />
          <FormField
            label="Компания"
            name="company"
            value={company}
            placeholder="ООО Ромашка"
            onChange={setCompany}
          />
          <FormField
            label="Город / Локация"
            name="location"
            value={location}
            placeholder="Москва"
            onChange={setLocation}
          />
          <div className="wizard-row">
            <FormField
              label="Зарплата от"
              name="salaryFrom"
              value={salaryFrom}
              placeholder="150000"
              onChange={setSalaryFrom}
            />
            <FormField
              label="Зарплата до"
              name="salaryTo"
              value={salaryTo}
              placeholder="250000"
              onChange={setSalaryTo}
            />
          </div>
          <FormField
            label="Валюта"
            name="currency"
            value={currency}
            placeholder="₽"
            onChange={setCurrency}
          />
          <div className="wizard-row">
            <FormField
              label="Формат работы"
              name="workFormat"
              type="select"
              value={workFormat}
              options={WORK_FORMAT_OPTIONS}
              onChange={setWorkFormat}
            />
            <FormField
              label="Тип занятости"
              name="employmentType"
              type="select"
              value={employmentType}
              options={EMPLOYMENT_OPTIONS}
              onChange={setEmploymentType}
            />
          </div>
          <FormField
            label="Описание"
            name="description"
            type="textarea"
            value={description}
            required
            placeholder="Опишите вакансию..."
            rows={5}
            onChange={setDescription}
          />
          <FormField
            label="Навыки (через запятую)"
            name="skills"
            value={skillsText}
            placeholder="React, TypeScript, Node.js"
            onChange={setSkillsText}
          />
          <FormField
            label="Требования (по одному на строку)"
            name="requirements"
            type="textarea"
            value={requirementsText}
            rows={4}
            onChange={setRequirementsText}
          />
          <FormField
            label="Обязанности (по одному на строку)"
            name="responsibilities"
            type="textarea"
            value={responsibilitiesText}
            rows={4}
            onChange={setResponsibilitiesText}
          />
        </div>

        <div className="wizard-nav">
          <div className="wizard-nav-left">
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={() => setStep("input")}
            >
              ← Назад
            </button>
          </div>
          <div className="wizard-nav-right">
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={handleSave}
              disabled={!title.trim()}
            >
              Сохранить вакансию
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
