import Link from "next/link";

export default function HHWizardPage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>HH Wizard</h1>
        <p>
          Пошаговая инструкция для переноса резюме в поля формы hh.ru.
          Каждый шаг с указанием: куда вставить, что вставить, и кнопкой
          &ldquo;Копировать&rdquo;.
        </p>
        <Link href="/" className="btn btn-secondary btn-md">
          На главную
        </Link>
      </div>
    </main>
  );
}
