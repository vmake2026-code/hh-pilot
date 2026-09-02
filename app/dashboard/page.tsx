"use client";

import Link from "next/link";
import { listResumeRecords } from "@/services/resume-persistence";
import { listVacancies } from "@/services/vacancy-persistence";
import { listMatchRecords } from "@/services/match-persistence";
import { useClientData } from "@/features/use-client-data";
import Loading from "@/components/ui/loading";
import { levelLabel } from "@/types/match";
import type { MatchRecord } from "@/types/match";
import type { ResumeRecord, ResumeVersion } from "@/types/resume";
import type { Vacancy } from "@/types/vacancy";

const RECENT_LIMIT = 5;

/**
 * P11.1: рабочая product shell — реальные счётчики, последние записи и CTA
 * из существующих list-сервисов. Никакой новой логики данных: reading only.
 */

function currentVersion(record: ResumeRecord): ResumeVersion | undefined {
  return (
    record.versions.find((v) => v.id === record.resume.currentVersionId) ??
    record.versions[record.versions.length - 1]
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU");
}

export default function DashboardPage() {
  const resumesResult = useClientData(listResumeRecords);
  const vacanciesResult = useClientData(listVacancies);
  const matchesResult = useClientData(listMatchRecords);

  const ready =
    resumesResult.ready && vacanciesResult.ready && matchesResult.ready;

  if (!ready) {
    return <Loading />;
  }

  const resumes: ResumeRecord[] = resumesResult.data ?? [];
  const vacancies: Vacancy[] = vacanciesResult.data ?? [];
  const matches: MatchRecord[] = matchesResult.data ?? [];

  // Последние записи: newest first по фактическим timestamp-полям сущностей.
  const recentResumes = [...resumes]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, RECENT_LIMIT);
  const recentVacancies = [...vacancies]
    .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
    .slice(0, RECENT_LIMIT);
  const recentMatches = [...matches]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, RECENT_LIMIT);

  const counters = [
    { label: "Резюме", value: resumes.length, href: "/resume" },
    { label: "Вакансии", value: vacancies.length, href: "/vacancies" },
    { label: "Сопоставления", value: matches.length, href: "/matches" },
  ];

  return (
    <main className="page-wide">
      <div className="page-header">
        <h1>Дашборд</h1>
        <div className="page-header-actions">
          <Link href="/resume/create" className="btn btn-primary btn-md">
            + Создать резюме
          </Link>
          <Link href="/vacancies/create" className="btn btn-secondary btn-md">
            + Добавить вакансию
          </Link>
          <Link href="/vacancies/import" className="btn btn-secondary btn-md">
            Импортировать вакансию
          </Link>
        </div>
      </div>

      <div className="dashboard-counters">
        {counters.map((c) => (
          <Link key={c.label} href={c.href} className="dashboard-counter-card">
            <span className="dashboard-counter-value">{c.value}</span>
            <span className="dashboard-counter-label">{c.label}</span>
          </Link>
        ))}
      </div>

      <div className="dashboard-columns">
        {/* Последние резюме */}
        <section className="dashboard-column">
          <h2 className="dashboard-column-title">
            Последние резюме
          </h2>
          {recentResumes.length === 0 ? (
            <div className="empty-state">
              <p>Пока нет резюме.</p>
              <Link href="/resume/create" className="btn btn-primary btn-md">
                Создать резюме
              </Link>
            </div>
          ) : (
            <div className="dashboard-item-list">
              {recentResumes.map((r) => (
                <Link
                  key={r.id}
                  href={`/resume/${r.id}`}
                  className="dashboard-item"
                >
                  <strong>{r.resume.title}</strong>
                  <span className="dashboard-item-meta">
                    v{currentVersion(r)?.versionNumber ?? "?"} · {formatDate(r.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Последние вакансии */}
        <section className="dashboard-column">
          <h2 className="dashboard-column-title">
            Последние вакансии
          </h2>
          {recentVacancies.length === 0 ? (
            <div className="empty-state">
              <p>Пока нет вакансий.</p>
              <Link href="/vacancies/create" className="btn btn-primary btn-md">
                Добавить вакансию
              </Link>
            </div>
          ) : (
            <div className="dashboard-item-list">
              {recentVacancies.map((v) => (
                <Link
                  key={v.id}
                  href={`/vacancies/${v.id}`}
                  className="dashboard-item"
                >
                  <strong>{v.title}</strong>
                  <span className="dashboard-item-meta">
                    {v.company} · {formatDate(v.fetchedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Последние сопоставления */}
        <section className="dashboard-column">
          <h2 className="dashboard-column-title">
            Последние сопоставления
          </h2>
          {recentMatches.length === 0 ? (
            <div className="empty-state">
              <p>Пока нет сопоставлений.</p>
              <Link href="/vacancies" className="btn btn-primary btn-md">
                Найти подходящие вакансии
              </Link>
            </div>
          ) : (
            <div className="dashboard-item-list">
              {recentMatches.map((m) => (
                <Link
                  key={m.id}
                  href={`/matches/${m.id}`}
                  className="dashboard-item"
                >
                  <strong>{m.vacancyTitle}</strong>
                  <span className="dashboard-item-meta">
                    {m.overallScore}/100 · {levelLabel(m.level)} · {formatDate(m.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
