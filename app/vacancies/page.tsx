"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { listVacancies, deleteVacancy } from "@/services/vacancy-persistence";
import { useClientData } from "@/features/use-client-data";
import Loading from "@/components/ui/loading";
import { WORK_FORMAT_LABELS } from "@/types/candidate";
import type { Vacancy } from "@/types/vacancy";

export default function VacanciesPage() {
  const { data, ready, refresh } = useClientData(listVacancies);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // P11.2B: destructive action с confirmation (P11.2A pattern). Один клик =
  // максимум одна persistence-операция (deletingId блокирует повторный submit).
  // Ошибка не скрывается: вакансия остаётся, показывается visible error + retry.
  const handleDelete = useCallback(
    (id: string, title: string) => {
      if (deletingId) return;

      const confirmed = window.confirm(
        `Удалить вакансию?\n\n«${title}» будет удалена.\nЭто действие нельзя отменить.`,
      );
      if (!confirmed) return;

      setDeleteError("");
      setDeletingId(id);
      try {
        deleteVacancy(id);
        // UI обновляется только после успешного удаления.
        refresh();
      } catch {
        setDeleteError(
          "Не удалось удалить вакансию. Проверьте настройки браузера и попробуйте снова.",
        );
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, refresh],
  );

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

      {deleteError && (
        <p className="form-error" role="alert">{deleteError}</p>
      )}

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
            <div key={v.id} className="vacancy-card">
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
                <Link
                  href={`/vacancies/${v.id}`}
                  className="btn btn-secondary btn-sm"
                >
                  Открыть
                </Link>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(v.id, v.title)}
                  disabled={deletingId !== null}
                >
                  {deletingId === v.id ? "Удаляем…" : "Удалить"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
