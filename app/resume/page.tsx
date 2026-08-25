"use client";

import Link from "next/link";
import { listResumeRecords } from "@/services/resume-persistence";
import { useClientData } from "@/features/use-client-data";
import { buildResumeListItems } from "@/features/resume-list";
import Loading from "@/components/ui/loading";
import type { ResumeRecord } from "@/types/resume";

export default function ResumePage() {
  const { data, ready } = useClientData(listResumeRecords);

  if (!ready || data === null) {
    return <Loading />;
  }

  const records: ResumeRecord[] = data;
  const items = buildResumeListItems(records);

  return (
    <main className="page-wide">
      <div className="page-header">
        <h1>Резюме</h1>
        <div className="page-header-actions">
          <Link href="/resume/create" className="btn btn-primary btn-md">
            + Создать с нуля
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>У вас пока нет резюме.</p>
          <p>Создайте резюме с нуля за 8 шагов или импортируйте существующее.</p>
          <Link href="/resume/create" className="btn btn-primary btn-md">
            Создать с нуля
          </Link>
        </div>
      ) : (
        <div className="vacancy-list">
          {items.map((item) => (
            <div key={item.id} className="vacancy-card">
              <div className="vacancy-card-main">
                <h3 className="vacancy-card-title">{item.title}</h3>
                <p className="vacancy-card-company">
                  Версия v{item.versionNumber ?? "?"} · обновлено{" "}
                  {new Date(item.updatedAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div className="vacancy-card-meta">
                <Link
                  href={`/resume/${item.id}`}
                  className="btn btn-secondary btn-sm"
                >
                  Открыть
                </Link>
                <Link
                  href={`/resume/${item.id}/preview`}
                  className="btn btn-ghost btn-sm"
                >
                  Просмотреть
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
