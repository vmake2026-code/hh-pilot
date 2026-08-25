"use client";

import { use, useCallback } from "react";
import Link from "next/link";
import { getResumeRecord } from "@/services/resume-persistence";
import { useClientData } from "@/features/use-client-data";
import Loading from "@/components/ui/loading";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";

export default function ResumeDetailPage({
  params,
}: {
  params: Promise<{ resumeId: string }>;
}) {
  const { resumeId } = use(params);
  const loadRecord = useCallback(() => getResumeRecord(resumeId), [resumeId]);
  const { data: record, ready } = useClientData(loadRecord);

  if (!ready) {
    return <Loading />;
  }

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
  const currentVersion = versions.find((v) => v.id === resume.currentVersionId);
  const workFormatLabel = record.workFormat
    ? WORK_FORMAT_LABELS[record.workFormat as keyof typeof WORK_FORMAT_LABELS]
    : null;
  const empLabel = record.employmentType
    ? EMPLOYMENT_TYPE_LABELS[record.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS]
    : null;

  return (
    <main className="page-wide">
      <div className="resume-dashboard">
        <div className="resume-header">
          <h1>{resume.title}</h1>
          <p className="resume-subtitle">
            {candidateInfo.firstName} {candidateInfo.lastName}
          </p>
          <div className="resume-meta">
            <span>Версия {currentVersion?.versionNumber ?? 1}</span>
            <span>·</span>
            <span>Обновлено {new Date(record.updatedAt).toLocaleDateString("ru-RU")}</span>
            {workFormatLabel && <span>· {workFormatLabel}</span>}
            {empLabel && <span>· {empLabel}</span>}
          </div>
        </div>

        <div className="resume-actions">
          <Link
            href={`/resume/${resumeId}/preview`}
            className="btn btn-primary btn-md"
          >
            Просмотреть
          </Link>
          <Link
            href={`/resume/create?resumeId=${resumeId}`}
            className="btn btn-secondary btn-md"
          >
            Редактировать
          </Link>
          <Link href="/vacancies" className="btn btn-ghost btn-md">
            Найти подходящие вакансии
          </Link>
        </div>

        {versions.length > 1 && (
          <div className="resume-versions">
            <h3>Версии ({versions.length})</h3>
            <div className="version-list">
              {[...versions].reverse().map((v) => (
                <div
                  key={v.id}
                  className={`version-item ${
                    v.id === resume.currentVersionId ? "version-current" : ""
                  }`}
                >
                  <span className="version-num">v{v.versionNumber}</span>
                  <span className="version-date">
                    {new Date(v.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                  {v.id === resume.currentVersionId && (
                    <span className="badge badge-success">Текущая</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
