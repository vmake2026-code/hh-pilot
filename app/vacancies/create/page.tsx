"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { generateId } from "@/lib/ids";
import { saveVacancy } from "@/services/vacancy-persistence";
import { validateVacancyForm, type VacancyErrors } from "@/lib/vacancy-validation";
import { sanitizeText } from "@/lib/security";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import type { WorkFormat, EmploymentType } from "@/types/candidate";
import FormField from "@/components/ui/form-field";

const WORK_FORMAT_OPTIONS = Object.entries(WORK_FORMAT_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const EMPLOYMENT_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export default function VacancyCreatePage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [workFormat, setWorkFormat] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [salaryFrom, setSalaryFrom] = useState("");
  const [salaryTo, setSalaryTo] = useState("");
  const [currency, setCurrency] = useState("₽");
  const [description, setDescription] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [responsibilitiesText, setResponsibilitiesText] = useState("");
  const [skillsText, setSkillsText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [source, setSource] = useState("text");
  const [errors, setErrors] = useState<VacancyErrors>({});

  const handleSave = useCallback(() => {
    const skillList = skillsText.split(",").map((s) => s.trim()).filter(Boolean);
    const reqList = requirementsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const respList = responsibilitiesText.split("\n").map((s) => s.trim()).filter(Boolean);

    const result = validateVacancyForm({
      title, company, location, description,
      salaryFrom, salaryTo, sourceUrl,
      skills: skillList,
      requirements: reqList,
      responsibilities: respList,
    });

    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    const now = new Date().toISOString();
    const id = generateId();

    const vacancy = {
      id,
      title: sanitizeText(title),
      company: sanitizeText(company),
      location: sanitizeText(location),
      workFormat: workFormat as WorkFormat | undefined,
      employmentType: employmentType as EmploymentType | undefined,
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
      source: source as "hh_url" | "text",
      sourceUrl: sourceUrl.trim() || undefined,
      fetchedAt: now,
    };

    saveVacancy(vacancy);
    router.push(`/vacancies/${id}`);
  }, [title, company, location, workFormat, employmentType, salaryFrom, salaryTo, currency, description, requirementsText, responsibilitiesText, skillsText, sourceUrl, source, router]);

  return (
    <main className="page-wide">
      <div className="wizard-container">
        <h2>Добавить вакансию</h2>

        <div className="wizard-fields">
          <FormField
            label="Название"
            name="title"
            value={title}
            error={errors.title}
            required
            placeholder="Frontend Developer"
            onChange={setTitle}
          />
          <FormField
            label="Компания"
            name="company"
            value={company}
            error={errors.company}
            required
            placeholder="ООО Рога и Копыта"
            onChange={setCompany}
          />
          <FormField
            label="Город"
            name="location"
            value={location}
            placeholder="Москва"
            onChange={setLocation}
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
          <div className="wizard-row">
            <FormField
              label="Зарплата от"
              name="salaryFrom"
              value={salaryFrom}
              error={errors.salaryFrom}
              placeholder="150000"
              onChange={setSalaryFrom}
            />
            <FormField
              label="Зарплата до"
              name="salaryTo"
              value={salaryTo}
              error={errors.salaryTo}
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
          <FormField
            label="Описание"
            name="description"
            type="textarea"
            value={description}
            error={errors.description}
            required
            placeholder="Опишите вакансию..."
            rows={4}
            onChange={setDescription}
          />
          <FormField
            label="Требования (по одному на строку)"
            name="requirements"
            type="textarea"
            value={requirementsText}
            placeholder={"Опыт работы от 2 лет\nЗнание React\nАнглийский B2"}
            rows={4}
            onChange={setRequirementsText}
          />
          <FormField
            label="Обязанности (по одному на строку)"
            name="responsibilities"
            type="textarea"
            value={responsibilitiesText}
            placeholder={"Разработка UI\nCode review\nМенторство"}
            rows={4}
            onChange={setResponsibilitiesText}
          />
          <FormField
            label="Навыки (через запятую)"
            name="skills"
            value={skillsText}
            placeholder="React, TypeScript, Node.js"
            onChange={setSkillsText}
          />
          <FormField
            label="URL вакансии"
            name="sourceUrl"
            value={sourceUrl}
            error={errors.sourceUrl}
            placeholder="https://hh.ru/vacancy/12345"
            onChange={setSourceUrl}
          />
          <FormField
            label="Источник"
            name="source"
            type="select"
            value={source}
            options={[
              { value: "text", label: "Вставлен вручную" },
              { value: "hh_url", label: "Ссылка с hh.ru" },
            ]}
            onChange={setSource}
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
              className="btn btn-primary btn-md"
              onClick={handleSave}
            >
              Сохранить вакансию
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
