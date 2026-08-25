"use client";

import Link from "next/link";
import { listVacancies } from "@/services/vacancy-persistence";
import { useClientData } from "@/features/use-client-data";
import Loading from "@/components/ui/loading";
import { WORK_FORMAT_LABELS } from "@/types/candidate";
import type { Vacancy } from "@/types/vacancy";

export default function VacanciesPage() {
  const { data, ready } = useClientData(listVacancies);

  if (!ready || data === null) {
    return <Loading />;
  }

  const vacancies: Vacancy[] = data;

  return (
    <main className="page-wide">
      <div className="page-header">
        <h1>Вакансии</h1>
        <div className="page-header-actions">
          <Link href="/vacancies/import" className="btn btn-secondary btn-md">
            Импортировать
          </Link>
          <Link href="/vacancies/create" className="btn btn-primary btn-md">
            + Добавить вакансию
          </Link>
        </div>
      </div>

      {vacancies.length === 0 ? (
        <div className="empty-state">
          <p>У вас пока нет вакансий.</p>
          <p>Добавьте вакансию, чтобы начать сопоставление с резюме.</p>
          <Link href="/vacancies/create" className="btn btn-primary btn-md">
            Добавить вакансию
          </Link>
        </div>
      ) : (
        <div className="vacancy-list">
          {vacancies.map((v) => (
            <Link
              key={v.id}
              href={`/vacancies/${v.id}`}
              className="vacancy-card"
            >
              <div className="vacancy-card-main">
                <h3 className="vacancy-card-title">{v.title}</h3>
                <p className="vacancy-card-company">{v.company}</p>
              </div>
              <div className="vacancy-card-meta">
                {v.location && <span>{v.location}</span>}
                {v.workFormat && (
                  <span>{WORK_FORMAT_LABELS[v.workFormat] ?? v.workFormat}</span>
                )}
                {v.salary && <span>{v.salary}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
