"use client";

import { use } from "react";
import Link from "next/link";
import { getVacancy } from "@/services/vacancy-persistence";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import type { Vacancy } from "@/types/vacancy";

export default function VacancyDetailPage({
  params,
}: {
  params: Promise<{ vacancyId: string }>;
}) {
  const { vacancyId } = use(params);
  const vacancy: Vacancy | null = getVacancy(vacancyId);

  if (!vacancy) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Вакансия не найдена</h1>
          <p>Запрашиваемая вакансия не существует или была удалена.</p>
          <Link href="/vacancies" className="btn btn-primary btn-md">
            К списку вакансий
          </Link>
        </div>
      </main>
    );
  }

  const wfLabel = vacancy.workFormat
    ? WORK_FORMAT_LABELS[vacancy.workFormat]
    : null;
  const etLabel = vacancy.employmentType
    ? EMPLOYMENT_TYPE_LABELS[vacancy.employmentType]
    : null;

  return (
    <main className="page-wide">
      <div className="preview-actions-bar">
        <Link href="/vacancies" className="btn btn-secondary btn-sm">
          ← К вакансиям
        </Link>
        <Link
          href={`/vacancies/${vacancyId}/match`}
          className="btn btn-primary btn-md"
        >
          Сопоставить с резюме
        </Link>
      </div>

      <div className="vacancy-doc">
        <header className="vacancy-doc-header">
          <h1>{vacancy.title}</h1>
          <p className="vacancy-doc-company">{vacancy.company}</p>
          <div className="vacancy-doc-meta">
            {vacancy.location && <span>{vacancy.location}</span>}
            {wfLabel && <span>{wfLabel}</span>}
            {etLabel && <span>{etLabel}</span>}
            {vacancy.salary && <span>{vacancy.salary}</span>}
          </div>
        </header>

        {vacancy.description && (
          <section className="resume-section">
            <h2>Описание</h2>
            <p>{vacancy.description}</p>
          </section>
        )}

        {vacancy.requirements.length > 0 && (
          <section className="resume-section">
            <h2>Требования</h2>
            <ul className="vacancy-list-items">
              {vacancy.requirements.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
            </ul>
          </section>
        )}

        {vacancy.responsibilities.length > 0 && (
          <section className="resume-section">
            <h2>Обязанности</h2>
            <ul className="vacancy-list-items">
              {vacancy.responsibilities.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {vacancy.skills.length > 0 && (
          <section className="resume-section">
            <h2>Навыки</h2>
            <div className="resume-skills">
              {vacancy.skills.map((s) => (
                <span key={s} className="resume-skill">{s}</span>
              ))}
            </div>
          </section>
        )}

        {vacancy.sourceUrl && (
          <section className="resume-section">
            <h2>Источник</h2>
            <a
              href={vacancy.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="vacancy-link"
            >
              {vacancy.sourceUrl}
            </a>
          </section>
        )}

        <footer className="resume-doc-footer">
          <span>Добавлено {new Date(vacancy.fetchedAt).toLocaleDateString("ru-RU")}</span>
        </footer>
      </div>
    </main>
  );
}
