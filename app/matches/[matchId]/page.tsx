"use client";

import { use } from "react";
import Link from "next/link";
import { getMatchRecord } from "@/services/match-persistence";
import { levelLabel } from "@/types/match";
import type { MatchRecord } from "@/types/match";

export default function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const record: MatchRecord | null = getMatchRecord(matchId);

  if (!record) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Результат не найден</h1>
          <Link href="/matches" className="btn btn-primary btn-md">
            К истории сопоставлений
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wide">
      <div className="preview-actions-bar">
        <Link href="/matches" className="btn btn-secondary btn-sm">
          ← К истории
        </Link>
      </div>

      <div className="match-result">
        <div className="match-score-block">
          <div className={`match-score match-level-${record.level}`}>
            {record.overallScore}
          </div>
          <div className="match-score-label">из 100</div>
          <div className="match-level-text">{levelLabel(record.level)}</div>
        </div>

        <div className="match-snapshot-meta">
          <div>
            <span className="match-meta-label">Вакансия:</span>{" "}
            <Link href={`/vacancies/${record.vacancyId}`}>
              {record.vacancyTitle} — {record.vacancyCompany}
            </Link>
          </div>
          <div>
            <span className="match-meta-label">Резюме:</span>{" "}
            <Link href={`/resume/${record.resumeId}/preview`}>
              {record.resumeTitle} · v{record.resumeVersionNumber}
            </Link>
          </div>
          <div>
            <span className="match-meta-label">Дата расчёта:</span>{" "}
            {new Date(record.createdAt).toLocaleDateString("ru-RU")}
          </div>
        </div>

        {record.matchedSkills.length > 0 && (
          <section className="match-section">
            <h3>✓ Совпадающие навыки</h3>
            <div className="match-tags match-tags-good">
              {record.matchedSkills.map((s) => (
                <span key={s} className="match-tag match-tag-good">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {record.missingSkills.length > 0 && (
          <section className="match-section">
            <h3>! Нехватает навыков</h3>
            <div className="match-tags match-tags-bad">
              {record.missingSkills.map((s) => (
                <span key={s} className="match-tag match-tag-bad">
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {record.matchedRequirements.length > 0 && (
          <section className="match-section">
            <h3>✓ Выполненные требования</h3>
            <ul className="match-list match-list-good">
              {record.matchedRequirements.map((r) => (
                <li key={r.requirementId}>{r.requirementText}</li>
              ))}
            </ul>
          </section>
        )}

        {record.missingRequirements.length > 0 && (
          <section className="match-section">
            <h3>! Невыполненные требования</h3>
            <ul className="match-list match-list-bad">
              {record.missingRequirements.map((r) => (
                <li key={r.requirementId}>{r.requirementText}</li>
              ))}
            </ul>
          </section>
        )}

        {record.risks.length > 0 && (
          <section className="match-section">
            <h3>• Риски</h3>
            <ul className="match-list match-list-risk">
              {record.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        {record.recommendations.length > 0 && (
          <section className="match-section">
            <h3>Рекомендации</h3>
            <ul className="match-list match-list-rec">
              {record.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="match-actions">
          <Link
            href={`/resume/${record.resumeId}/preview`}
            className="btn btn-secondary btn-md"
          >
            Открыть резюме
          </Link>
          <Link
            href={`/vacancies/${record.vacancyId}`}
            className="btn btn-ghost btn-md"
          >
            Открыть вакансию
          </Link>
          <Link
            href={`/resume/create?resumeId=${record.resumeId}`}
            className="btn btn-ghost btn-md"
          >
            Редактировать резюме
          </Link>
        </div>
      </div>
    </main>
  );
}
