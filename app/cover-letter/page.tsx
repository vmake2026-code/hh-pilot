import Link from "next/link";

export default function CoverLetterPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Сопроводительное письмо</h1>
        <p>
          Готовое письмо, адаптированное под вакансию и ваше резюме.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
