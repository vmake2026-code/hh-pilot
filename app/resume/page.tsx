import Link from "next/link";

export default function ResumePage() {
  return (
    <main className="page-wide">
      <div className="stub-section">
        <h1>Резюме</h1>
        <p>
          Создайте резюме с нуля за 8 шагов или импортируйте существующее.
        </p>
        <div className="entry-grid" style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link href="/resume/create" className="entry-card">
            <span className="entry-icon">✨</span>
            <h3>Создать с нуля</h3>
            <p>Пошаговый мастер: от личных данных до подтверждения</p>
          </Link>
          <Link href="/resume" className="entry-card">
            <span className="entry-icon">📄</span>
            <h3>Импортировать</h3>
            <p>Вставьте текст или загрузите файл</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
