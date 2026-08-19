import Link from "next/link";

export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <span className="badge">RESUMEPILOT</span>
        <h1>Резюме, которое работает</h1>
        <p>
          Создайте резюме, адаптируйте его под вакансию, получите
          рекомендации и пошаговую инструкцию для публикации на hh.ru.
        </p>

        <div className="entry-grid">
          <Link href="/resume" className="entry-card">
            <span className="entry-icon">📄</span>
            <h3>У меня уже есть резюме</h3>
            <p>Импортируйте существующее резюме для анализа и улучшения</p>
          </Link>

          <Link href="/resume/create" className="entry-card">
            <span className="entry-icon">✨</span>
            <h3>У меня нет резюме</h3>
            <p>Создайте резюме с нуля с помощью AI-помощника</p>
          </Link>

          <Link href="/vacancy" className="entry-card">
            <span className="entry-icon">🎯</span>
            <h3>Проверить резюме под вакансию</h3>
            <p>Сравните ваше резюме с конкретной вакансией и получите план</p>
          </Link>
        </div>
      </section>

      <section className="features">
        <h2>Что умеет ResumePilot</h2>
        <div className="feature-grid">
          <div className="feature-item">
            <strong>Анализ резюме</strong>
            <p>Оценка качества по разделам с конкретными рекомендациями</p>
          </div>
          <div className="feature-item">
            <strong>Сопоставление с вакансией</strong>
            <p>Какие требования совпадают, какие нужно доработать</p>
          </div>
          <div className="feature-item">
            <strong>Адаптация</strong>
            <p>Персонализация резюме под конкретную вакансию</p>
          </div>
          <div className="feature-item">
            <strong>Сопроводительное письмо</strong>
            <p>Готовое письмо, адаптированное под вакансию</p>
          </div>
          <div className="feature-item">
            <strong>HH Wizard</strong>
            <p>Пошаговая инструкция переноса резюме в поля hh.ru</p>
          </div>
          <div className="feature-item">
            <strong>Версионирование</strong>
            <p>История изменений для каждой адаптации</p>
          </div>
        </div>
      </section>
    </main>
  );
}
