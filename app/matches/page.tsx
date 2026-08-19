"use client";

import Link from "next/link";
import { listMatchRecords } from "@/services/match-persistence";
import { levelLabel } from "@/types/match";
import type { MatchRecord } from "@/types/match";

export default function MatchesHistoryPage() {
  const records: MatchRecord[] = listMatchRecords();

  return (
    <main className="page-wide">
      <h1>История сопоставлений</h1>

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
            <Link
              key={record.id}
              href={`/matches/${record.id}`}
              className="match-history-card"
            >
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
