import Link from "next/link";

export default function OptimizationPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Оптимизация</h1>
        <p>
          Конкретные предложения по адаптации резюме под выбранную вакансию.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
