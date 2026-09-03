"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generateId } from "@/lib/ids";
import { saveVacancy } from "@/services/vacancy-persistence";
import {
  parseVacancyImport,
  isValidImportUrl,
  classifyRequirementCategory,
  parseSalaryValue,
} from "@/services/vacancy-import";
import { validateVacancyForm, type VacancyErrors } from "@/lib/vacancy-validation";
import { sanitizeText } from "@/lib/security";
import { dedupeSkills } from "@/lib/skills";
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
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [fetchedAt, setFetchedAt] = useState("");
  const [saveErrors, setSaveErrors] = useState<VacancyErrors>({});
  const [saveError, setSaveError] = useState("");
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

  const applyDraft = useCallback((parsed: VacancyImportDraft) => {
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
  }, []);

  // URL-only / URL+text: server-side HH fetch → extracted text (или
  // ручной текст как override) → существующий text parser.
  const handleUrlImport = useCallback(async () => {
    if (isImporting) return;
    setIsImporting(true);
    setImportError("");
    setUrlError("");

    try {
      const response = await fetch("/api/vacancies/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl.trim() }),
      });
      const payload = (await response.json()) as
        | { ok: true; text: string; fetchedAt: string }
        | { ok: false; error?: string; code?: string };

      if (!payload.ok) {
        setImportError(payload.error || "Не удалось загрузить вакансию с HH");
        return;
      }

      // URL + text: ручной текст приоритетнее (пользователь мог
      // поправить/сократить выписку), URL остаётся источником метаданных.
      const textForParsing = rawText.trim() ? rawText : payload.text;
      setFetchedAt(payload.fetchedAt);

      const parsed = parseVacancyImport({
        source: "url",
        sourceUrl: sourceUrl.trim(),
        text: textForParsing,
      });
      applyDraft(parsed);
    } catch {
      setImportError("Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.");
    } finally {
      setIsImporting(false);
    }
  }, [sourceUrl, rawText, isImporting, applyDraft]);

  // Text only: существующий локальный parser flow без изменений.
  const handleTextParse = useCallback(() => {
    const parsed = parseVacancyImport({ source: "text", text: rawText });
    applyDraft(parsed);
  }, [rawText, applyDraft]);

  const handleParse = useCallback(() => {
    // Validate URL if provided
    if (sourceUrl.trim() && !isValidImportUrl(sourceUrl)) {
      setUrlError("Введите корректный URL (http:// или https://)");
      return;
    }
    setUrlError("");
    setImportError("");
    setSaveErrors({});

    if (sourceUrl.trim()) {
      void handleUrlImport();
    } else {
      handleTextParse();
    }
  }, [sourceUrl, rawText, handleUrlImport, handleTextParse]);

  const handleSave = useCallback(() => {
    if (!draft) return;

    const skillList = dedupeSkills(skillsText.split(",").map((s) => s.trim()).filter(Boolean));
    const reqList = requirementsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const respList = responsibilitiesText.split("\n").map((s) => s.trim()).filter(Boolean);

    // Reuse the existing manual-form validation: invalid input blocks the save
    const validation = validateVacancyForm({
      title,
      company,
      location,
      description,
      salaryFrom,
      salaryTo,
      sourceUrl: draft.sourceUrl,
      skills: skillList,
      requirements: reqList,
      responsibilities: respList,
    });
    if (!validation.valid) {
      setSaveErrors(validation.errors);
      return;
    }
    setSaveErrors({});
    setSaveError("");

    const now = new Date().toISOString();
    const id = generateId();

    const parsedSalaryFrom = parseSalaryValue(salaryFrom);
    const parsedSalaryTo = parseSalaryValue(salaryTo);

    // URL import: fetchedAt — момент реального server-side fetch,
    // а не момент сохранения черновика.
    const finalFetchedAt = draft.source === "url" && fetchedAt ? fetchedAt : now;

    const vacancy = {
      id,
      title: sanitizeText(title),
      company: sanitizeText(company),
      location: sanitizeText(location),
      workFormat: workFormat ? (workFormat as WorkFormat) : undefined,
      employmentType: employmentType ? (employmentType as EmploymentType) : undefined,
      salaryFrom: parsedSalaryFrom,
      salaryTo: parsedSalaryTo,
      currency: currency || undefined,
      salary: parsedSalaryFrom !== undefined
        ? `от ${parsedSalaryFrom} ${currency}${parsedSalaryTo !== undefined ? ` до ${parsedSalaryTo}` : ""}`
        : parsedSalaryTo !== undefined
          ? `до ${parsedSalaryTo} ${currency}`
          : undefined,
      description: sanitizeText(description),
      requirements: reqList.map((text, i) => ({
        id: `req-${id}-${i}`,
        text,
        isRequired: true,
        category: classifyRequirementCategory(text),
      })),
      skills: skillList,
      responsibilities: respList,
      source: draft.source === "url" ? "hh_url" as const : "text" as const,
      sourceUrl: draft.sourceUrl || undefined,
      fetchedAt: finalFetchedAt,
    };

    // P10.6 F1: persistence failure видима; navigation — только после
    // успешного сохранения. Семантика saveVacancy не меняется.
    try {
      saveVacancy(vacancy);
      router.push(`/vacancies/${id}`);
    } catch {
      setSaveError(
        "Не удалось сохранить вакансию. Проверьте свободное место в браузере и попробуйте снова.",
      );
    }
  }, [draft, title, company, location, workFormat, employmentType, salaryFrom, salaryTo, currency, description, skillsText, requirementsText, responsibilitiesText, router, fetchedAt]);

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
            Вставьте URL публичной вакансии hh.ru или её текст для автоматического разбора полей.
          </p>

          {importError && (
            <p className="form-error" role="alert">{importError}</p>
          )}

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
                disabled={isImporting || (!sourceUrl.trim() && !rawText.trim())}
              >
                {isImporting ? "Загружаем вакансию с HH…" : "Разобрать вакансию"}
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

        {saveError && (
          <p className="form-error" role="alert">{saveError}</p>
        )}

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
            error={saveErrors.title}
            onChange={setTitle}
          />
          <FormField
            label="Компания"
            name="company"
            value={company}
            placeholder="ООО Ромашка"
            error={saveErrors.company}
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
              error={saveErrors.salaryFrom}
              onChange={setSalaryFrom}
            />
            <FormField
              label="Зарплата до"
              name="salaryTo"
              value={salaryTo}
              placeholder="250000"
              error={saveErrors.salaryTo}
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
            error={saveErrors.description}
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
