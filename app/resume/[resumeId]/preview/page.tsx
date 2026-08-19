"use client";

import { use } from "react";
import Link from "next/link";
import { getResumeRecord } from "@/services/resume-persistence";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import type { ResumeRecord, ResumeVersion } from "@/types/resume";
import type { Confident } from "@/types/confirmation";
import { isConfirmed, isInferred, getFieldValue } from "@/types/confirmation";

function ConfBadge<T>({ field }: { field: Confident<T> }) {
  if (isConfirmed(field)) return <span className="conf-badge conf-confirmed">✓</span>;
  if (isInferred(field)) return <span className="conf-badge conf-inferred">⚠</span>;
  return <span className="conf-badge conf-missing">○</span>;
}

function FieldValue<T>({ field }: { field: Confident<T> }) {
  const value = getFieldValue(field);
  if (value === null || value === undefined || value === "") return null;
  return <>{String(value)}</>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr;
}

export default function ResumePreviewPage({
  params,
}: {
  params: Promise<{ resumeId: string }>;
}) {
  const { resumeId } = use(params);
  const record: ResumeRecord | null = getResumeRecord(resumeId);

  if (!record) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Резюме не найдено</h1>
          <p>Запрашиваемое резюме не существует или было удалено.</p>
          <Link href="/resume" className="btn btn-primary btn-md">
            К списку резюме
          </Link>
        </div>
      </main>
    );
  }

  const { resume, candidateInfo, versions } = record;
  const currentVersion: ResumeVersion | undefined =
    versions.find((v) => v.id === resume.currentVersionId) ??
    versions[versions.length - 1];
  const vd = currentVersion?.data;

  const workFormatLabel = record.workFormat
    ? WORK_FORMAT_LABELS[record.workFormat as keyof typeof WORK_FORMAT_LABELS]
    : null;
  const empLabel = record.employmentType
    ? EMPLOYMENT_TYPE_LABELS[record.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS]
    : null;

  const fullName = [candidateInfo.lastName, candidateInfo.firstName, candidateInfo.middleName]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="page-wide">
      {/* Actions bar */}
      <div className="preview-actions-bar">
        <Link
          href={`/resume/${resumeId}`}
          className="btn btn-secondary btn-sm"
        >
          ← К резюме
        </Link>
        <div className="preview-actions-right">
          <Link
            href={`/resume/create?resumeId=${resumeId}`}
            className="btn btn-secondary btn-sm"
          >
            Редактировать
          </Link>
          <Link href="/vacancy" className="btn btn-ghost btn-sm">
            Найти подходящие вакансии
          </Link>
        </div>
      </div>

      {/* Resume document */}
      <div className="resume-doc">
        {/* Header */}
        <header className="resume-doc-header">
          <h1 className="resume-doc-name">{fullName || "(Имя не указано)"}</h1>
          <div className="resume-doc-contact">
            {candidateInfo.city && <span>{candidateInfo.city}</span>}
            {candidateInfo.phone && (
              <span>{candidateInfo.phone}</span>
            )}
            {candidateInfo.email && (
              <span>{candidateInfo.email}</span>
            )}
          </div>
        </header>

        {/* Desired position */}
        {vd?.desiredPosition && (
          <section className="resume-section">
            <h2>Желаемая должность</h2>
            <p className="resume-position">
              <FieldValue field={vd.desiredPosition} />
              <ConfBadge field={vd.desiredPosition} />
            </p>
            {vd.salaryExpectation && (
              <p className="resume-salary">
                Зарплата: <FieldValue field={vd.salaryExpectation} />
              </p>
            )}
            <div className="resume-meta-inline">
              {workFormatLabel && <span>{workFormatLabel}</span>}
              {empLabel && <span>{empLabel}</span>}
            </div>
          </section>
        )}

        {/* Work experience */}
        {vd?.workExperience && vd.workExperience.length > 0 && (
          <section className="resume-section">
            <h2>Опыт работы</h2>
            {vd.workExperience.map((w) => (
              <div key={w.id} className="resume-exp-item">
                <div className="resume-exp-header">
                  <div>
                    <strong className="resume-exp-position">{w.position}</strong>
                    <span className="resume-exp-company"> — {w.company}</span>
                  </div>
                  <span className="resume-exp-dates">
                    {formatDate(w.startDate)}
                    {w.endDate
                      ? ` — ${formatDate(w.endDate)}`
                      : w.isCurrent
                        ? " — по настоящее время"
                        : ""}
                  </span>
                </div>
                {w.description && (
                  <p className="resume-exp-desc">{w.description}</p>
                )}
                {w.achievements.length > 0 && (
                  <ul className="resume-exp-achievements">
                    {w.achievements.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Education */}
        {vd?.education && vd.education.length > 0 && (
          <section className="resume-section">
            <h2>Образование</h2>
            {vd.education.map((e) => (
              <div key={e.id} className="resume-edu-item">
                <div className="resume-edu-header">
                  <div>
                    <strong>{e.degree}</strong>
                    {e.field && <span>, {e.field}</span>}
                  </div>
                  <span className="resume-exp-dates">
                    {formatDate(e.startDate)}
                    {e.endDate ? ` — ${formatDate(e.endDate)}` : ""}
                  </span>
                </div>
                <p className="resume-edu-inst">{e.institution}</p>
              </div>
            ))}
          </section>
        )}

        {/* Skills */}
        {vd?.skills && vd.skills.length > 0 && (
          <section className="resume-section">
            <h2>Навыки</h2>
            <div className="resume-skills">
              {vd.skills.map((s) => (
                <span key={s.name} className="resume-skill">{s.name}</span>
              ))}
            </div>
          </section>
        )}

        {/* Summary */}
        {vd?.summary && getFieldValue(vd.summary) && (
          <section className="resume-section">
            <h2>О себе</h2>
            <p className="resume-summary">
              <FieldValue field={vd.summary} />
            </p>
          </section>
        )}

        {/* Languages */}
        {vd?.languages && vd.languages.length > 0 && (
          <section className="resume-section">
            <h2>Языки</h2>
            <p>{vd.languages.join(", ")}</p>
          </section>
        )}

        {/* Version footer */}
        <footer className="resume-doc-footer">
          <span>Версия {currentVersion?.versionNumber ?? 1}</span>
          <span>
            Создано {new Date(record.createdAt).toLocaleDateString("ru-RU")}
          </span>
        </footer>
      </div>
    </main>
  );
}
