"use client";

import { use, useState, useCallback } from "react";
import Link from "next/link";
import { getResumeRecord } from "@/services/resume-persistence";
import { useClientData } from "@/features/use-client-data";
import { listAnalysesForResume, isAnalysisStale, selectLatestAnalysis, analyzeCurrentVersion, RemoteAIGateway } from "@/features/resume-analysis";
import type { AIErrorCode } from "@/features/resume-analysis";
import Loading from "@/components/ui/loading";
import { WORK_FORMAT_LABELS, EMPLOYMENT_TYPE_LABELS } from "@/types/candidate";
import { educationLevelLabel, skillLevelLabel } from "@/types/resume";
import type { ResumeVersion } from "@/types/resume";
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

/**
 * P10.3B: локальный mapping server error code -> текст для пользователя.
 * Технические детали (HTTP-статусы, env-переменные, ответ провайдера)
 * сюда не попадают — сервер их уже не присылает.
 */
const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  ai_not_configured: "AI-анализ сейчас не настроен. Обратитесь к администратору сервиса.",
  input_too_large: "Резюме слишком большое для анализа. Сократите описания опыта и попробуйте снова.",
  invalid_input: "Данные резюме не подходят для анализа. Проверьте, что текущая версия заполнена.",
  invalid_body: "Не удалось отправить резюме на анализ.",
  rate_limited: "Слишком много запросов на анализ. Подождите немного и попробуйте снова.",
  provider_rate_limited: "AI-сервис перегружен. Попробуйте через минуту.",
  provider_unavailable: "AI-сервис временно недоступен. Попробуйте позже.",
  provider_error: "AI-сервис временно не смог обработать запрос. Попробуйте позже.",
  provider_invalid_response: "AI-сервис вернул некорректный ответ. Попробуйте ещё раз.",
};

/**
 * Повтор имеет смысл только при временных сбоях. Для конфигурации,
 * размера и некорректного ввода повтор с теми же данными ничего не изменит.
 */
const AI_ERROR_RETRYABLE: Record<AIErrorCode, boolean> = {
  ai_not_configured: false,
  input_too_large: false,
  invalid_input: false,
  // Тело запроса формируется клиентом детерминированно — повтор не поможет.
  invalid_body: false,
  // P10.5: окно rate limit временное — повтор осмыслен после Retry-After.
  rate_limited: true,
  provider_rate_limited: true,
  provider_unavailable: true,
  provider_error: true,
  provider_invalid_response: true,
};

const GENERIC_AI_ERROR_TEXT = "AI-сервис временно недоступен";

/** Неизвестный/отсутствующий code: generic-текст и разрешённый повтор. */
function aiErrorText(code: AIErrorCode | undefined, fallback: string): string {
  if (code && code in AI_ERROR_MESSAGES) return AI_ERROR_MESSAGES[code];
  return fallback || GENERIC_AI_ERROR_TEXT;
}

function aiErrorRetryable(code: AIErrorCode | undefined): boolean {
  if (code && code in AI_ERROR_RETRYABLE) return AI_ERROR_RETRYABLE[code];
  return true;
}

export default function ResumePreviewPage({
  params,
}: {
  params: Promise<{ resumeId: string }>;
}) {
  const { resumeId } = use(params);
  const loadRecord = useCallback(() => getResumeRecord(resumeId), [resumeId]);
  const { data: record, ready } = useClientData(loadRecord);
  const analysesState = useClientData(() => listAnalysesForResume(resumeId));

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisErrorCode, setAnalysisErrorCode] = useState<AIErrorCode | undefined>(undefined);

  const handleAnalyze = useCallback(async () => {
    if (!record || analyzing) return;
    setAnalyzing(true);
    setAnalysisError("");
    setAnalysisErrorCode(undefined);
    // P10.2: транспорт через server API route — ключ остаётся на сервере.
    const outcome = await analyzeCurrentVersion(record, new RemoteAIGateway());
    setAnalyzing(false);
    if (!outcome.ok) {
      setAnalysisError(outcome.error);
      setAnalysisErrorCode(outcome.code);
      return;
    }
    analysesState.refresh();
  }, [record, analyzing, analysesState]);

  const latest = record && analysesState.ready && analysesState.data
    ? selectLatestAnalysis(analysesState.data, record)
    : null;
  const stale = !!(record && latest && isAnalysisStale(latest, record));

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

      {/* AI analysis (P10.1) */}
      {record && (
        <section className="resume-section">
          <h2>AI-анализ резюме</h2>

          {stale && (
            <p className="wizard-hint">
              Анализ относится к предыдущей версии резюме.
            </p>
          )}

          {analysisError ? (
            <>
              <p className="form-error">
                Не удалось выполнить анализ: {aiErrorText(analysisErrorCode, analysisError)}
              </p>
              {aiErrorRetryable(analysisErrorCode) && (
                <button
                  type="button"
                  className="btn btn-secondary btn-md"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                >
                  Повторить
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-md"
              onClick={handleAnalyze}
              disabled={analyzing}
            >
              {analyzing
                ? "Анализируем…"
                : latest && !stale
                  ? "Анализировать заново"
                  : stale
                    ? "Анализировать текущую версию"
                    : "Анализировать резюме"}
            </button>
          )}

          {analyzing && <p className="wizard-hint">Идёт анализ…</p>}

          {latest && !stale && (
            <div className="resume-doc" style={{ marginTop: 12 }}>
              <p><strong>Балл: {latest.overallScore} / 100</strong></p>
              <p>{latest.summary}</p>

              {latest.strengths.length > 0 && (
                <>
                  <h3>Сильные стороны</h3>
                  <ul className="resume-exp-achievements">
                    {latest.strengths.map((sItem, i) => (<li key={i}>{sItem}</li>))}
                  </ul>
                </>
              )}

              {latest.weaknesses.length > 0 && (
                <>
                  <h3>Что улучшить</h3>
                  <ul className="resume-exp-achievements">
                    {latest.weaknesses.map((wItem, i) => (<li key={i}>{wItem}</li>))}
                  </ul>
                </>
              )}

              {(latest.recommendations ?? []).length > 0 && (
                <>
                  <h3>Рекомендации</h3>
                  <ul className="resume-exp-achievements">
                    {(latest.recommendations ?? []).map((rItem, i) => (<li key={i}>{rItem}</li>))}
                  </ul>
                </>
              )}

              {latest.sections.length > 0 && (
                <>
                  <h3>По разделам</h3>
                  {latest.sections.map((sec) => (
                    <p key={sec.section}>
                      <strong>{sec.section}: {sec.score}/100</strong> — {sec.feedback}
                      {sec.suggestions.length > 0 && ` (${sec.suggestions.join("; ")})`}
                    </p>
                  ))}
                </>
              )}
            </div>
          )}
        </section>
      )}

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
                  {(w.achievements ?? []).length > 0 && (
                    <ul className="resume-exp-achievements">
                      {(w.achievements ?? []).map((a, i) => (
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
                {educationLevelLabel(e.level) && (
                  <p className="resume-edu-inst">{educationLevelLabel(e.level)}</p>
                )}
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
            {vd.skills.map((s) => {
              const lvl = skillLevelLabel(s.level);
              return (
                <span key={s.name} className="resume-skill">
                  {s.name}{lvl ? ` — ${lvl}` : ""}
                </span>
              );
            })}
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
