import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <span className="badge">RESUMEPILOT</span>
        <h1>Резюме, которое работает</h1>
        <p>
          Создайте резюме, добавьте вакансию и узнайте, насколько резюме
          ей соответствует — с AI-анализом и историей результатов.
        </p>

        <div className="entry-grid">
          <Link href="/resume/create" className="entry-card">
            <span className="entry-icon">✨</span>
            <h3>Создать резюме</h3>
            <p>Пройдите пошаговый мастер — резюме сохранится в вашем браузере</p>
          </Link>

          <Link href="/resume" className="entry-card">
            <span className="entry-icon">📄</span>
            <h3>Мои резюме</h3>
            <p>Откройте список своих резюме, версий и результатов анализа</p>
          </Link>

          <Link href="/vacancies" className="entry-card">
            <span className="entry-icon">🎯</span>
            <h3>Вакансии и сопоставление</h3>
            <p>Добавьте вакансию и сравните её с вашим резюме</p>
          </Link>
        </div>
      </section>

      <section className="features">
        <h2>Что умеет ResumePilot</h2>
        <div className="feature-grid">
          <div className="feature-item">
            <strong>Создание резюме</strong>
            <p>Пошаговый мастер с проверкой фактов и черновиками</p>
          </div>
          <div className="feature-item">
            <strong>Версионирование резюме</strong>
            <p>Каждое редактирование сохраняется как новая версия</p>
          </div>
          <div className="feature-item">
            <strong>Разбор вакансии</strong>
            <p>Вставьте текст вакансии — поля заполнятся автоматически</p>
          </div>
          <div className="feature-item">
            <strong>Сопоставление с вакансией</strong>
            <p>Совпадения, недостающие требования и оценка соответствия</p>
          </div>
          <div className="feature-item">
            <strong>AI-анализ резюме</strong>
            <p>Оценка качества по разделам с рекомендациями</p>
          </div>
          <div className="feature-item">
            <strong>История сопоставлений</strong>
            <p>Все результаты сохраняются и доступны в любой момент</p>
          </div>
        </div>
      </section>
    </main>
  );
}
