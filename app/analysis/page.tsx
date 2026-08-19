import Link from "next/link";

export default function AnalysisPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Анализ резюме</h1>
        <p>
          Оценка качества вашего резюме по разделам с конкретными
          рекомендациями по улучшению.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
