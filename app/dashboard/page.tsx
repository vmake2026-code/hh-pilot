import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Дашборд</h1>
        <p>
          Здесь будут ваши резюме, вакансии и результаты анализа.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
