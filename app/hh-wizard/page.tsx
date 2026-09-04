"use client";

import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { listResumeRecords, getResumeRecord } from "@/services/resume-persistence";
import { useClientData } from "@/features/use-client-data";
import { createPersistenceStore } from "@/lib/persistence";
import { copyToClipboard } from "@/lib/clipboard";
import {
  createHHWizard,
  saveHHWizardProgress,
  loadHHWizardProgress,
} from "@/features/hh-wizard";
import Loading from "@/components/ui/loading";
import type { ResumeRecord, ResumeVersion } from "@/types/resume";
import type { HHFieldInstruction } from "@/types/hh-wizard";

// P24: single-page checklist that walks the user through copying each
// resume field into the hh.ru resume form. Client-only: reads persisted
// resumes through the hydration-safe useClientData hook and stores per-resume
// completion progress in localStorage (progress store mirrors the resume
// wizard's draft-store pattern: module instance + no direct localStorage reads).

const progressStore = createPersistenceStore<unknown>();

const wizard = createHHWizard();

/** Canonical current-version resolution (same as preview/match pages). */
function currentVersionOf(record: ResumeRecord): ResumeVersion | undefined {
  return (
    record.versions.find((v) => v.id === record.resume.currentVersionId) ??
    record.versions[record.versions.length - 1]
  );
}

function HHWizardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resumeIdParam = searchParams.get("resumeId") ?? "";

  const recordsState = useClientData(listResumeRecords);
  const [selectedResumeId, setSelectedResumeId] = useState("");
  // resumeIdParam drives the initial deep-link selection only after the
  // client has mounted (hydration-safe).
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  useEffect(() => {
    if (deepLinkApplied || !recordsState.ready) return;
    setDeepLinkApplied(true);
    if (resumeIdParam) setSelectedResumeId(resumeIdParam);
  }, [deepLinkApplied, recordsState.ready, resumeIdParam]);

  const recordResult = useClientData(
    useCallback(() => {
      if (!selectedResumeId) return null;
      return getResumeRecord(selectedResumeId);
    }, [selectedResumeId]),
  );

  const [instructions, setInstructions] = useState<HHFieldInstruction[]>([]);
  const [progressError, setProgressError] = useState("");
  // Copied feedback per field key: transient, never conflated with completion.
  const [copiedKey, setCopiedKey] = useState("");
  const [copyError, setCopyError] = useState("");

  const records: ResumeRecord[] = useMemo(
    () => recordsState.data ?? [],
    [recordsState.data],
  );

  const record: ResumeRecord | null = selectedResumeId
    ? recordResult.ready
      ? recordResult.data
      : null
    : records.find((r) => r.id === selectedResumeId) ?? null;

  // Build instructions + restore persisted progress whenever the selected
  // record changes. loadHHWizardProgress shape-guards damaged storage data.
  useEffect(() => {
    if (!record) {
      setInstructions([]);
      return;
    }
    const version = currentVersionOf(record);
    if (!version) {
      setInstructions([]);
      return;
    }
    const base = wizard.generateInstructions(version.data);
    const completedIds = loadHHWizardProgress(progressStore, record.id);
    setInstructions(
      completedIds
        ? base.map(
            (instruction) =>
              completedIds.includes(instruction.hhFieldKey)
                ? wizard.markCompleted(instruction)
                : instruction,
          )
        : base,
    );
  }, [record]);

  const toggleCompleted = useCallback(
    (fieldKey: string) => {
      setInstructions((prev) => {
        const next = prev.map((instruction) =>
          instruction.hhFieldKey === fieldKey
            ? { ...instruction, isCompleted: !instruction.isCompleted }
            : instruction,
        );
        if (!record) return next;
        const completedIds = next
          .filter((i) => i.isCompleted)
          .map((i) => i.hhFieldKey);
        if (!saveHHWizardProgress(progressStore, record.id, completedIds)) {
          setProgressError(
            "Не удалось сохранить прогресс. Проверьте свободное место в браузере.",
          );
        } else {
          setProgressError("");
        }
        return next;
      });
    },
    [record],
  );

  const handleCopy = useCallback(
    async (instruction: HHFieldInstruction) => {
      if (!instruction.copyableText) {
        setCopyError("Нечего копировать — заполните это поле в резюме.");
        return;
      }
      const result = await copyToClipboard(instruction.copyableText);
      if (result.ok) {
        setCopyError("");
        setCopiedKey(instruction.hhFieldKey);
      } else {
        setCopiedKey("");
        setCopyError("Не удалось скопировать. Попробуйте ещё раз.");
      }
    },
    [],
  );

  // Transient copied feedback: clear after a short delay.
  useEffect(() => {
    if (!copiedKey) return;
    const timer = setTimeout(() => setCopiedKey(""), 2500);
    return () => clearTimeout(timer);
  }, [copiedKey]);

  const progress = wizard.getProgress(instructions);

  // ---------- No resume selected: selection screen ----------
  if (!selectedResumeId) {
    return (
      <main className="page-wide">
        <div className="page-header">
          <h1>Подготовка резюме для hh.ru</h1>
        </div>
        <p className="wizard-hint">
          Выберите резюме — мастер подготовит текст каждого раздела для
          копирования в форму резюме на hh.ru.
        </p>

        {recordsState.ready && records.length === 0 ? (
          <div className="empty-state">
            <p>Пока нет ни одного резюме.</p>
            <Link href="/resume/create" className="btn btn-primary btn-md">
              Создать резюме
            </Link>
          </div>
        ) : !recordsState.ready ? (
          <Loading />
        ) : (
          <div className="match-select">
            <div className="resume-select-list">
              {records.map((r) => {
                const currentVersion = currentVersionOf(r);
                return (
                  <label
                    key={r.id}
                    className={`resume-select-item ${
                      selectedResumeId === r.id ? "resume-select-active" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="hh-wizard-resume"
                      value={r.id}
                      checked={selectedResumeId === r.id}
                      onChange={() => {
                        setSelectedResumeId(r.id);
                        router.replace(`/hh-wizard?resumeId=${r.id}`);
                      }}
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
          </div>
        )}
      </main>
    );
  }

  // ---------- Loading selected record ----------
  if (!recordResult.ready) {
    return <Loading />;
  }

  // ---------- Stale/deleted resume id: graceful empty state ----------
  if (!record) {
    return (
      <main className="page-wide">
        <div className="stub-section">
          <h1>Резюме не найдено</h1>
          <p>Возможно, оно было удалено. Выберите другое резюме для подготовки.</p>
          <div className="stub-actions">
            <Link href="/hh-wizard" className="btn btn-primary btn-md">
              Выбрать другое резюме
            </Link>
            <Link href="/resume" className="btn btn-secondary btn-md">
              К списку резюме
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const version = currentVersionOf(record);
  const allDone = progress.completed === progress.total && progress.total > 0;

  // ---------- Checklist ----------
  return (
    <main className="page-wide">
      <div className="preview-actions-bar">
        <Link
          href={`/resume/${record.id}/preview`}
          className="btn btn-secondary btn-sm"
        >
          ← К резюме
        </Link>
        <div className="preview-actions-right">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelectedResumeId("");
              router.replace("/hh-wizard");
            }}
          >
            Сменить резюме
          </button>
        </div>
      </div>

      <h1>Подготовка резюме для hh.ru</h1>
      <p className="wizard-hint">
        {record.resume.title}
        {version ? ` · версия v${version.versionNumber}` : ""}
      </p>

      <div
        className="hh-wizard-progress"
        role="status"
        aria-live="polite"
      >
        <span className="hh-wizard-progress-count">
          {allDone
            ? "Все поля подготовлены"
            : `Прогресс: ${progress.completed} из ${progress.total}`}
        </span>
        <div className="wizard-progress-bar" aria-hidden="true">
          <div
            className="wizard-progress-fill"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {progressError && (
        <p className="form-error" role="alert">{progressError}</p>
      )}
      {copyError && (
        <p className="form-error" role="alert">{copyError}</p>
      )}

      <div className="hh-wizard-list">
        {instructions.map((instruction) => {
          const hasText = Boolean(instruction.copyableText);
          return (
            <div
              key={instruction.hhFieldKey}
              className={`hh-wizard-item ${
                instruction.isCompleted ? "hh-wizard-item-done" : ""
              }`}
            >
              <div className="hh-wizard-item-head">
                <span
                  className={
                    instruction.isCompleted
                      ? "hh-wizard-step-done"
                      : "hh-wizard-step-num"
                  }
                  aria-hidden="true"
                >
                  {instruction.isCompleted ? "✓" : instruction.stepNumber}
                </span>
                <h3 className="hh-wizard-item-title">
                  {instruction.hhFieldName}
                  {instruction.isCompleted && (
                    <span className="badge badge-success hh-wizard-done-badge">
                      Готово
                    </span>
                  )}
                </h3>
              </div>

              <p className="hh-wizard-where">
                Куда вставить: {instruction.hhFieldName}
              </p>
              <p className="hh-wizard-where">{instruction.notes}</p>

              {hasText ? (
                <pre className="hh-wizard-copybox">{instruction.copyableText}</pre>
              ) : (
                <p className="hh-wizard-empty">
                  В резюме это поле не заполнено — дополните резюме или пропустите шаг.
                </p>
              )}

              <div className="hh-wizard-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => void handleCopy(instruction)}
                  disabled={!hasText}
                  aria-label={`Копировать: ${instruction.hhFieldName}`}
                >
                  {copiedKey === instruction.hhFieldKey
                    ? "Скопировано"
                    : "Копировать"}
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    instruction.isCompleted
                      ? "btn-ghost"
                      : "btn-primary"
                  }`}
                  onClick={() => toggleCompleted(instruction.hhFieldKey)}
                  aria-pressed={instruction.isCompleted}
                  aria-label={
                    instruction.isCompleted
                      ? `Отменить готовность: ${instruction.hhFieldName}`
                      : `Отметить готовым: ${instruction.hhFieldName}`
                  }
                >
                  {instruction.isCompleted ? "Отменить" : "Готово"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="empty-state" role="status">
          <p>Все поля подготовлены — можно открывать форму резюме на hh.ru.</p>
        </div>
      )}
    </main>
  );
}

export default function HHWizardPage() {
  return (
    <Suspense
      fallback={
        <main className="page-wide">
          <div className="stub-section">
            <p>Загрузка…</p>
          </div>
        </main>
      }
    >
      <HHWizardClient />
    </Suspense>
  );
}
