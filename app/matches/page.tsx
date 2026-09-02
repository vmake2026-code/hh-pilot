"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { listMatchRecords, deleteMatchRecord } from "@/services/match-persistence";
import { useClientData } from "@/features/use-client-data";
import Loading from "@/components/ui/loading";
import { levelLabel } from "@/types/match";
import type { MatchRecord } from "@/types/match";

export default function MatchesHistoryPage() {
  const { data, ready, refresh } = useClientData(listMatchRecords);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // P11.2C: destructive action с confirmation (P11.2A/P11.2B pattern). Один
  // клик = максимум одна persistence-операция (deletingId блокирует повторный
  // submit). Ошибка не скрывается: запись остаётся, visible error + retry.
  const handleDelete = useCallback(
    (record: MatchRecord) => {
      if (deletingId) return;

      const confirmed = window.confirm(
        `Удалить результат сопоставления?\n\n` +
          `«${record.vacancyTitle} — ${record.vacancyCompany}» ↔ «${record.resumeTitle}» ` +
          `(${record.overallScore}/100, ${levelLabel(record.level)}) будет удалён.\n` +
          `Это действие нельзя отменить.`,
      );
      if (!confirmed) return;

      setDeleteError("");
      setDeletingId(record.id);
      try {
        deleteMatchRecord(record.id);
        // UI обновляется только после успешного удаления.
        refresh();
      } catch {
        setDeleteError(
          "Не удалось удалить результат сопоставления. Проверьте настройки браузера и попробуйте снова.",
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

  const records: MatchRecord[] = data;

  return (
    <main className="page-wide">
      <h1>История сопоставлений</h1>

      {deleteError && (
        <p className="form-error" role="alert">{deleteError}</p>
      )}

      {records.length === 0 ? (
        <div className="empty-state">
          <p>У вас пока нет результатов сопоставления.</p>
          <Link href="/vacancies" className="btn btn-primary btn-md">
            Найти вакансии
          </Link>
        </div>
      ) : (
        <div className="match-history-list">
          {records.map((record) => (
            <div key={record.id} className="match-history-card">
              <div className="match-history-card-header">
                <div className="match-history-score-wrap">
                  <span className={`match-score-sm match-level-${record.level}`}>
                    {record.overallScore}
                  </span>
                  <span className="match-score-sm-label">/100</span>
                </div>
                <div className="match-history-info">
                  <strong>{record.vacancyTitle}</strong>
                  <span className="match-history-meta">
                    {record.vacancyCompany} · {levelLabel(record.level)}
                  </span>
                </div>
              </div>
              <div className="match-history-card-footer">
                <span className="match-history-resume">
                  {record.resumeTitle} · v{record.resumeVersionNumber}
                </span>
                <span className="match-history-date">
                  {new Date(record.createdAt).toLocaleDateString("ru-RU")}
                </span>
                <span className="match-history-actions">
                  <Link
                    href={`/matches/${record.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    Открыть
                  </Link>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(record)}
                    disabled={deletingId !== null}
                  >
                    {deletingId === record.id ? "Удаляем…" : "Удалить"}
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
