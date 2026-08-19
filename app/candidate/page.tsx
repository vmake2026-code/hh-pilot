import Link from "next/link";

export default function CandidatePage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Профиль кандидата</h1>
        <p>
          Заполните основную информацию о себе. Это шаг 1 мастера создания
          резюме.
        </p>
        <Link href="/resume/create" className="btn btn-primary btn-md">
          Начать заполнение
        </Link>
      </div>
    </main>
  );
}
