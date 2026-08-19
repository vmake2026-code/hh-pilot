import Link from "next/link";

export default function MatchingPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Сопоставление</h1>
        <p>
          Сравнение вашего резюме с вакансией: совпадения, частичные
          совпадения, недостающие требования и рекомендации.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
