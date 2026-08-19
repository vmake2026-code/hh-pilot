"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { getVacancy } from "@/services/vacancy-persistence";
import { listResumeRecords } from "@/services/resume-persistence";
import { useRouter } from "next/navigation";
import { calculateMatch } from "@/services/matching";
import { toMatchRecord, levelLabel } from "@/types/match";
import { saveMatchRecord } from "@/services/match-persistence";
import type { Vacancy } from "@/types/vacancy";
import type { ResumeRecord, ResumeVersion } from "@/types/resume";
import type { MatchResult } from "@/types/match";

export default function MatchPage({
  params,
}: {
  params: Promise<{ vacancyId: string }>;
}) {
  const { vacancyId } = use(params);
  const vacancy: Vacancy | null = getVacancy(vacancyId);
  const allRecords: ResumeRecord[] = listResumeRecords();

  const router = useRouter();
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  const handleCalculate = useCallback(() => {
    if (!vacancy || !selectedResumeId) return;

    const record = allRecords.find((r) => r.id === selectedResumeId);
    if (!record) return;

    const currentVersion: ResumeVersion | undefined =
      record.versions.find((v) => v.id === record.resume.currentVersionId) ??
      record.versions[record.versions.length - 1];

    if (!currentVersion) return;

    const result = calculateMatch(vacancy, currentVersion, record.resume.id);
    setMatchResult(result);

    // Persist as snapshot and redirect
    const matchRecord = toMatchRecord(
      result,
      vacancy.title,
      vacancy.company,
      record.resume.title,
      currentVersion.versionNumber,
    );
    saveMatchRecord(matchRecord);
    router.push(`/matches/${matchRecord.id}`);
  }, [vacancy, selectedResumeId, allRecords, router]);

  if (!vacancy) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Вакансия не найдена</h1>
          <Link href="/vacancies" className="btn btn-primary btn-md">
            К списку вакансий
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page-wide">
      <div className="preview-actions-bar">
        <Link href={`/vacancies/${vacancyId}`} className="btn btn-secondary btn-sm">
          ← К вакансии
        </Link>
      </div>

      <h1>Сопоставление</h1>
      <p className="wizard-hint">
        Вакансия: <strong>{vacancy.title}</strong> — {vacancy.company}
      </p>

      {!matchResult && (
        <div className="match-select">
          <h3>Выберите резюме</h3>
          {allRecords.length === 0 ? (
            <div className="empty-state">
              <p>У вас пока нет резюме.</p>
              <Link href="/resume/create" className="btn btn-primary btn-md">
                Создать резюме
              </Link>
            </div>
          ) : (
            <>
              <div className="resume-select-list">
                {allRecords.map((r) => {
                  const currentVersion = r.versions.find(
                    (v) => v.id === r.resume.currentVersionId,
                  ) ?? r.versions[r.versions.length - 1];
                  return (
                    <label
                      key={r.id}
                      className={`resume-select-item ${selectedResumeId === r.id ? "resume-select-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="resume"
                        value={r.id}
                        checked={selectedResumeId === r.id}
                        onChange={() => setSelectedResumeId(r.id)}
                      />
                      <div>
                        <strong>{r.resume.title}</strong>
                        <span className="resume-select-meta">
                          v{currentVersion?.versionNumber ?? "?"} ·{" "}
                          {new Date(r.resume.updatedAt).toLocaleDateString("ru-RU")}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleCalculate}
                disabled={!selectedResumeId}
              >
                Рассчитать соответствие
              </button>
            </>
          )}
        </div>
      )}

      {matchResult && (
        <div className="match-result">
          <div className="match-score-block">
            <div className={`match-score match-level-${matchResult.level}`}>
              {matchResult.overallScore}
            </div>
            <div className="match-score-label">из 100</div>
            <div className="match-level-text">
              {levelLabel(matchResult.level)}
            </div>
          </div>

          {matchResult.matchedSkills.length > 0 && (
            <section className="match-section">
              <h3>✓ Совпадающие навыки</h3>
              <div className="match-tags match-tags-good">
                {matchResult.matchedSkills.map((s) => (
                  <span key={s} className="match-tag match-tag-good">{s}</span>
                ))}
              </div>
            </section>
          )}

          {matchResult.missingSkills.length > 0 && (
            <section className="match-section">
              <h3>! Нехватает навыков</h3>
              <div className="match-tags match-tags-bad">
                {matchResult.missingSkills.map((s) => (
                  <span key={s} className="match-tag match-tag-bad">{s}</span>
                ))}
              </div>
            </section>
          )}

          {matchResult.matchedRequirements.length > 0 && (
            <section className="match-section">
              <h3>✓ Выполненные требования</h3>
              <ul className="match-list match-list-good">
                {matchResult.matchedRequirements.map((r) => (
                  <li key={r.requirementId}>{r.requirementText}</li>
                ))}
              </ul>
            </section>
          )}

          {matchResult.missingRequirements.length > 0 && (
            <section className="match-section">
              <h3>! Невыполненные требования</h3>
              <ul className="match-list match-list-bad">
                {matchResult.missingRequirements.map((r) => (
                  <li key={r.requirementId}>{r.requirementText}</li>
                ))}
              </ul>
            </section>
          )}

          {matchResult.risks.length > 0 && (
            <section className="match-section">
              <h3>• Риски</h3>
              <ul className="match-list match-list-risk">
                {matchResult.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {matchResult.recommendations.length > 0 && (
            <section className="match-section">
              <h3>Рекомендации</h3>
              <ul className="match-list match-list-rec">
                {matchResult.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="match-actions">
            <Link
              href={`/resume/${matchResult.resumeId}/preview`}
              className="btn btn-secondary btn-md"
            >
              Открыть резюме
            </Link>
            <Link
              href={`/vacancies/${vacancyId}`}
              className="btn btn-ghost btn-md"
            >
              Открыть вакансию
            </Link>
            <Link
              href={`/resume/create?resumeId=${matchResult.resumeId}`}
              className="btn btn-ghost btn-md"
            >
              Редактировать резюме
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              onClick={() => setMatchResult(null)}
            >
              Выбрать другое резюме
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
